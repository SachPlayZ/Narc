import type { DecisionRecord, OutcomeRecord, FindingRecord } from "@narc/shared";

/**
 * NarcJournal — the typed interface used by both B2 (auditor) and locally by B1.
 *
 * Writes return a blob_id (real MemWal) or a local:path:recordId string
 * (LocalFallbackJournal). Reads are exhaustive (restore-based, not semantic top-k).
 */
export interface NarcJournal {
  // Writes — store record as JSON text, return blob_id or local:path:id
  writeDecision(record: DecisionRecord): Promise<string>;
  writeOutcome(record: OutcomeRecord): Promise<string>;
  writeFinding(record: FindingRecord): Promise<string>;

  // Reads — exhaustive restore (NOT semantic recall)
  readAllDecisions(agentId: string): Promise<DecisionRecord[]>;
  readAllOutcomes(agentId: string): Promise<OutcomeRecord[]>;
  readAllFindings(auditorId: string): Promise<FindingRecord[]>;
}
