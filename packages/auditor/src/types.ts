import type {
  DecisionRecord,
  FindingAction,
  FindingRecord,
  Mandate,
  OutcomeRecord
} from "@narc/shared";

// ---------------------------------------------------------------------------
// NarcJournal — re-exported from @narc/memory.
// If that package is not yet built, we define the interface inline here too.
// ---------------------------------------------------------------------------

/**
 * Inline copy of NarcJournal to avoid hard build-time dependency on @narc/memory
 * when writing tests that mock the journal.  The real runtime import still comes
 * from @narc/memory (see auditor.ts).
 */
export interface NarcJournal {
  writeDecision(record: DecisionRecord): Promise<string>;
  writeOutcome(record: OutcomeRecord): Promise<string>;
  writeFinding(record: FindingRecord): Promise<string>;
  readAllDecisions(agentId: string): Promise<DecisionRecord[]>;
  readAllOutcomes(agentId: string): Promise<OutcomeRecord[]>;
  readAllFindings(auditorId: string): Promise<FindingRecord[]>;
}

// ---------------------------------------------------------------------------
// Per-tick inputs & outputs
// ---------------------------------------------------------------------------

export type AuditTickInput = {
  /** The Narc auditor's own identifier (stored in FindingRecord.auditorId) */
  auditorId: string;
  /** The trader agent being watched */
  agentId: string;
  /** Monotonically increasing counter for this audit run */
  tick: number;
  /** Canonical mandate used for independent re-evaluation */
  mandate: Mandate;
  /** All DecisionRecords fetched via exhaustive restore() */
  decisions: DecisionRecord[];
  /** All OutcomeRecords fetched via exhaustive restore() */
  outcomes: OutcomeRecord[];
  /** blob_id of the Narc's previous FindingRecord (linked list head) */
  narcPrevBlobId: string | null;
  /** blob_id of the trader's most recent DecisionRecord (for cross-link) */
  traderPrevBlobId: string | null;
};

export type AuditTickResult = {
  finding: FindingRecord;
  /** blob_id returned by the journal after writing the FindingRecord */
  findingBlobId: string;
};

// ---------------------------------------------------------------------------
// Breach handler result
// ---------------------------------------------------------------------------

export type BreachHandlerResult = {
  actionTaken: FindingAction;
  pauseTxDigest: string | null;
  pauseReasonBlobId: string | null;
};
