import type {
  MemWalConfig,
  RememberResult,
  RecallResult,
  RecallMemory
} from "@mysten-incubation/memwal";
import {
  FindingRecord,
  FindingRecordSchema,
  decisionNamespace,
  outcomeNamespace,
  findingNamespace,
  BSideEnv,
  DecisionRecord,
  DecisionRecordSchema,
  OutcomeRecord,
  OutcomeRecordSchema
} from "@narc/shared";
import type { NarcJournal } from "./journal.js";
import { LocalFallbackJournal } from "./localJournal.js";

// MemWal instance type
import type { MemWal as MemWalType } from "@mysten-incubation/memwal";

/**
 * MemWalJournal — production implementation backed by @mysten-incubation/memwal.
 *
 * Key constraints:
 *   - Always suiNetwork: 'testnet' would be set, but MemWalConfig (v0.0.7) does NOT
 *     include suiNetwork — it is a TEE-relayer-side client that uses Sui only for
 *     SEAL session keys on a separate code path (MemWalManual). The delegate-key
 *     path (MemWal) does not take a network param. Documented in BLOCKERS.md.
 *   - Writes use rememberAndWait() so the blob_id is available before returning.
 *   - Reads use recall() with a high limit (all-records approximation) since
 *     restore() in v0.0.7 only rebuilds the relayer's local index and returns
 *     counts — not the record texts. Documented in BLOCKERS.md.
 *   - Every record returned from a read is parsed through the zod schema.
 */
export class MemWalJournal implements NarcJournal {
  private memwal!: MemWalType;
  private _ready: Promise<void>;
  private readonly localMirror: LocalFallbackJournal;
  // Expose for testing
  readonly _initOpts: MemWalConfig;

  // Rate-limit cooldown: skip MemWal entirely until this timestamp
  private rateLimitedUntil = 0;

  constructor(env: BSideEnv) {
    this._initOpts = {
      key: env.MEMWAL_DELEGATE_KEY!,
      accountId: env.MEMWAL_ACCOUNT_ID!,
      serverUrl: env.MEMWAL_RELAYER_URL
      // NOTE: MemWalConfig (v0.0.7) has no suiNetwork field. The relayer-mode
      // client is network-agnostic at the SDK level. See BLOCKERS.md.
    };
    this.localMirror = new LocalFallbackJournal(env.LOCAL_ACTIVITY_DIR);
    this._ready = this._init();
  }

  private async _init(): Promise<void> {
    const { MemWal } = await import("@mysten-incubation/memwal");
    this.memwal = MemWal.create(this._initOpts);
  }

  private async ready(): Promise<MemWalType> {
    await this._ready;
    return this.memwal;
  }

  // ---------------------------------------------------------------------------
  // Writes
  // ---------------------------------------------------------------------------

  async writeDecision(record: DecisionRecord): Promise<string> {
    return this.writeWithMirror(
      () => this.rememberJson(record, decisionNamespace(record.agentId)),
      () => this.localMirror.writeDecision(record)
    );
  }

  async writeOutcome(record: OutcomeRecord): Promise<string> {
    return this.writeWithMirror(
      () => this.rememberJson(record, outcomeNamespace(record.agentId)),
      () => this.localMirror.writeOutcome(record)
    );
  }

  async writeFinding(record: FindingRecord): Promise<string> {
    return this.writeWithMirror(
      () => this.rememberJson(record, findingNamespace(record.auditorId)),
      () => this.localMirror.writeFinding(record)
    );
  }

  // ---------------------------------------------------------------------------
  // Reads
  // ---------------------------------------------------------------------------
  // NOTE: restore() in memwal v0.0.7 only rebuilds the relayer's local vector
  // index and returns counts (restored/skipped/total), NOT the record texts.
  // We use recall() with a large limit as the exhaustive-read approximation.
  // See BLOCKERS.md for the full blocker description.

  async readAllDecisions(agentId: string): Promise<DecisionRecord[]> {
    const ns = decisionNamespace(agentId);
    return mergeById(
      await this.readLocalAndMemWal(
        () => this.recallNamespace(ns),
        () => this.localMirror.readAllDecisions(agentId),
        DecisionRecordSchema
      ),
      (record) => record.recordId
    );
  }

  async readAllOutcomes(agentId: string): Promise<OutcomeRecord[]> {
    const ns = outcomeNamespace(agentId);
    return mergeById(
      await this.readLocalAndMemWal(
        () => this.recallNamespace(ns),
        () => this.localMirror.readAllOutcomes(agentId),
        OutcomeRecordSchema
      ),
      (record) => record.recordId
    );
  }

  async readAllFindings(auditorId: string): Promise<FindingRecord[]> {
    const ns = findingNamespace(auditorId);
    return mergeById(
      await this.readLocalAndMemWal(
        () => this.recallNamespace(ns),
        () => this.localMirror.readAllFindings(auditorId),
        FindingRecordSchema
      ),
      (record) => record.findingId
    );
  }

  private isRateLimited(): boolean {
    return Date.now() < this.rateLimitedUntil;
  }

  private applyRateLimit(error: unknown): void {
    const msg = error instanceof Error ? error.message : String(error);
    const match = msg.match(/"retry_after_seconds"\s*:\s*(\d+)/);
    const seconds = match ? parseInt(match[1], 10) : 300;
    this.rateLimitedUntil = Date.now() + seconds * 1000;
    console.error(
      `[MemWalJournal] Rate limited for ${seconds}s — using local mirror until ${new Date(this.rateLimitedUntil).toISOString()}`
    );
  }

  private async rememberJson(record: unknown, namespace: string): Promise<string> {
    if (this.isRateLimited()) {
      throw new Error("[MemWalJournal] Rate limit cooldown active, skipping MemWal write");
    }
    const mw = await this.ready();
    try {
      const result: RememberResult = await retryMemWal(
        () => mw.rememberAndWait(JSON.stringify(record), namespace)
      );
      return result.blob_id;
    } catch (error) {
      if (is429Error(error)) this.applyRateLimit(error);
      throw error;
    }
  }

  private async recallNamespace(namespace: string): Promise<RecallResult> {
    if (this.isRateLimited()) {
      throw new Error("[MemWalJournal] Rate limit cooldown active, skipping MemWal read");
    }
    const mw = await this.ready();
    try {
      return await retryMemWal(() => mw.recall({ query: "*", limit: 1000, namespace }));
    } catch (error) {
      if (is429Error(error)) this.applyRateLimit(error);
      throw error;
    }
  }

  private async writeWithMirror(
    writeMemWal: () => Promise<string>,
    writeLocal: () => Promise<string>
  ): Promise<string> {
    try {
      const blobId = await writeMemWal();
      // Fire-and-forget mirror write (JSONL + Supabase sync). Don't let local
      // failures surface as MemWal failures — the record is already persisted.
      writeLocal().catch((err) =>
        console.error(
          "[MemWalJournal] local mirror write failed (record already in MemWal):",
          err instanceof Error ? err.message : String(err)
        )
      );
      return blobId;
    } catch (error) {
      console.error(
        "[MemWalJournal] MemWal write failed, falling back to local mirror:",
        error instanceof Error ? error.message : String(error)
      );
      return writeLocal();
    }
  }

  private async readLocalAndMemWal<T>(
    readMemWal: () => Promise<RecallResult>,
    readLocal: () => Promise<T[]>,
    schema: { parse(data: unknown): T }
  ): Promise<T[]> {
    const [localResult, memwalResult] = await Promise.allSettled([
      readLocal(),
      readMemWal()
    ]);

    const local = localResult.status === "fulfilled" ? localResult.value : [];
    if (memwalResult.status !== "fulfilled") {
      if (localResult.status !== "fulfilled") {
        throw memwalResult.reason;
      }
      console.error(
        "[MemWalJournal] MemWal read failed; serving local mirror:",
        memwalResult.reason instanceof Error ? memwalResult.reason.message : String(memwalResult.reason)
      );
      return local;
    }

    const remote = parseRecallMemories(memwalResult.value.results, schema);
    return [...remote, ...local];
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function parseRecallMemories<T>(
  memories: RecallMemory[],
  schema: { parse(data: unknown): T }
): T[] {
  if (!memories?.length) return [];
  return memories.map((m) => schema.parse(JSON.parse(m.text)));
}

async function retryMemWal<T>(fn: () => Promise<T>, maxAttempts = 4, baseDelayMs = 500): Promise<T> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (attempt >= maxAttempts || !isRetriableMemWalError(error)) {
        throw error;
      }
      await sleep(baseDelayMs * attempt);
    }
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

function is429Error(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /429|rate limit|too many requests/i.test(message);
}

function isRetriableMemWalError(error: unknown): boolean {
  // 429 is NOT retriable here — we handle it separately with a long cooldown
  if (is429Error(error)) return false;
  const message = error instanceof Error ? error.message : String(error);
  return /timeout|temporarily unavailable|ECONNRESET|ETIMEDOUT/i.test(message);
}

function mergeById<T>(records: T[], getId: (record: T) => string): T[] {
  const seen = new Map<string, T>();
  for (const record of records) {
    seen.set(getId(record), record);
  }
  return [...seen.values()].sort((a, b) => {
    const ats = typeof (a as { ts?: unknown }).ts === "number" ? (a as { ts: number }).ts : 0;
    const bts = typeof (b as { ts?: unknown }).ts === "number" ? (b as { ts: number }).ts : 0;
    return ats - bts;
  });
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
