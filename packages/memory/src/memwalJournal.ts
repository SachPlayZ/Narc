import type {
  MemWalConfig,
  RememberResult,
  RecallResult,
  RecallMemory
} from "@mysten-incubation/memwal";
import {
  BSideEnv,
  DecisionRecord,
  DecisionRecordSchema,
  OutcomeRecord,
  OutcomeRecordSchema,
  FindingRecord,
  FindingRecordSchema,
  decisionNamespace,
  outcomeNamespace,
  findingNamespace
} from "@narc/shared";
import type { NarcJournal } from "./journal.js";

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
  // Expose for testing
  readonly _initOpts: MemWalConfig;

  constructor(env: BSideEnv) {
    this._initOpts = {
      key: env.MEMWAL_DELEGATE_KEY!,
      accountId: env.MEMWAL_ACCOUNT_ID!,
      serverUrl: env.MEMWAL_RELAYER_URL
      // NOTE: MemWalConfig (v0.0.7) has no suiNetwork field. The relayer-mode
      // client is network-agnostic at the SDK level. See BLOCKERS.md.
    };
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
    const mw = await this.ready();
    const result: RememberResult = await mw.rememberAndWait(
      JSON.stringify(record),
      decisionNamespace(record.agentId)
    );
    return result.blob_id;
  }

  async writeOutcome(record: OutcomeRecord): Promise<string> {
    const mw = await this.ready();
    const result: RememberResult = await mw.rememberAndWait(
      JSON.stringify(record),
      outcomeNamespace(record.agentId)
    );
    return result.blob_id;
  }

  async writeFinding(record: FindingRecord): Promise<string> {
    const mw = await this.ready();
    const result: RememberResult = await mw.rememberAndWait(
      JSON.stringify(record),
      findingNamespace(record.auditorId)
    );
    return result.blob_id;
  }

  // ---------------------------------------------------------------------------
  // Reads
  // ---------------------------------------------------------------------------
  // NOTE: restore() in memwal v0.0.7 only rebuilds the relayer's local vector
  // index and returns counts (restored/skipped/total), NOT the record texts.
  // We use recall() with a large limit as the exhaustive-read approximation.
  // See BLOCKERS.md for the full blocker description.

  async readAllDecisions(agentId: string): Promise<DecisionRecord[]> {
    const mw = await this.ready();
    const ns = decisionNamespace(agentId);
    const result: RecallResult = await mw.recall({ query: "*", limit: 1000, namespace: ns });
    return parseRecallMemories(result.results, DecisionRecordSchema);
  }

  async readAllOutcomes(agentId: string): Promise<OutcomeRecord[]> {
    const mw = await this.ready();
    const ns = outcomeNamespace(agentId);
    const result: RecallResult = await mw.recall({ query: "*", limit: 1000, namespace: ns });
    return parseRecallMemories(result.results, OutcomeRecordSchema);
  }

  async readAllFindings(auditorId: string): Promise<FindingRecord[]> {
    const mw = await this.ready();
    const ns = findingNamespace(auditorId);
    const result: RecallResult = await mw.recall({ query: "*", limit: 1000, namespace: ns });
    return parseRecallMemories(result.results, FindingRecordSchema);
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
