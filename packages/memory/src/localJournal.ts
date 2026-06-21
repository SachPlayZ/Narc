import { mkdir, appendFile, readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import {
  DecisionRecord,
  DecisionRecordSchema,
  OutcomeRecord,
  OutcomeRecordSchema,
  FindingRecord,
  FindingRecordSchema
} from "@narc/shared";
import type { NarcJournal } from "./journal.js";
import { syncDecision, syncFinding, syncOutcome } from "./supabaseSync.js";

/**
 * LocalFallbackJournal — writes JSONL files to LOCAL_ACTIVITY_DIR.
 * Used when MemWal env vars are not set or the relayer is down.
 */
export class LocalFallbackJournal implements NarcJournal {
  private readonly rootDir: string;

  constructor(rootDir = ".narc/activity") {
    this.rootDir = rootDir;
  }

  async writeDecision(record: DecisionRecord): Promise<string> {
    const path = join(this.rootDir, `${record.agentId}-decisions.jsonl`);
    await appendJsonLine(path, record);
    syncDecision(record);
    return `local:${path}:${record.recordId}`;
  }

  async writeOutcome(record: OutcomeRecord): Promise<string> {
    const path = join(this.rootDir, `${record.agentId}-outcomes.jsonl`);
    await appendJsonLine(path, record);
    syncOutcome(record);
    return `local:${path}:${record.recordId}`;
  }

  async writeFinding(record: FindingRecord): Promise<string> {
    const path = join(this.rootDir, `${record.auditorId}-findings.jsonl`);
    await appendJsonLine(path, record);
    syncFinding(record);
    return `local:${path}:${record.findingId}`;
  }

  async readAllDecisions(agentId: string): Promise<DecisionRecord[]> {
    const path = join(this.rootDir, `${agentId}-decisions.jsonl`);
    return readAndParseJsonl(path, DecisionRecordSchema);
  }

  async readAllOutcomes(agentId: string): Promise<OutcomeRecord[]> {
    const path = join(this.rootDir, `${agentId}-outcomes.jsonl`);
    return readAndParseJsonl(path, OutcomeRecordSchema);
  }

  async readAllFindings(auditorId: string): Promise<FindingRecord[]> {
    const path = join(this.rootDir, `${auditorId}-findings.jsonl`);
    return readAndParseJsonl(path, FindingRecordSchema);
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function appendJsonLine(path: string, value: unknown): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await appendFile(path, `${JSON.stringify(value)}\n`, "utf8");
}

async function readAndParseJsonl<T>(
  path: string,
  schema: { parse(data: unknown): T }
): Promise<T[]> {
  if (!existsSync(path)) return [];
  const raw = await readFile(path, "utf8");
  const results: T[] = [];
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    // Will throw ZodError on invalid records — caller sees it
    results.push(schema.parse(JSON.parse(trimmed)));
  }
  return results;
}
