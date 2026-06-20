/**
 * tick.ts — single-tick audit logic.
 *
 * This is a pure(ish) function: all side-effects (writing to MemWal, calling
 * pausePolicy) are injected through `deps`.  That makes it fully unit-testable
 * without a real Sui node or MemWal relayer.
 *
 * Invariants (do not relax):
 *  - evaluateMandate() and riskScore() are called from @narc/shared — never
 *    reimplemented here.
 *  - --loosen-check ONLY exists in the trader self-check call site; never here.
 *  - FindingRecord is validated with FindingRecordSchema.parse() before writing.
 */

import { randomUUID } from "node:crypto";
import {
  evaluateMandate,
  FindingRecordSchema,
  hashMandate,
  riskScore,
  type DecisionRecord,
  type FindingAction,
  type FindingRecord,
  type OutcomeRecord
} from "@narc/shared";
import type { AuditTickInput, AuditTickResult, BreachHandlerResult } from "./types.js";

export const AUDITOR_VERSION = "0.1.0";

export type AuditTickDeps = {
  /**
   * Persist the FindingRecord to Walrus / local fallback.
   * Returns the blob_id string.
   */
  writeFinding: (record: FindingRecord) => Promise<string>;

  /**
   * Called only when verdict === "BREACH".
   * Receives the pre-written FindingRecord and its blob_id so the pause tx
   * can include the blob id as the on-chain reason.
   */
  onBreach?: (
    record: FindingRecord,
    blobId: string
  ) => Promise<BreachHandlerResult>;

  /** Optional LLM model tag stored in the record for auditability. */
  model?: string;
};

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

export async function auditTick(
  input: AuditTickInput,
  deps: AuditTickDeps
): Promise<AuditTickResult> {
  const {
    auditorId,
    tick,
    mandate,
    decisions,
    outcomes,
    narcPrevBlobId,
    traderPrevBlobId
  } = input;

  // -------------------------------------------------------------------------
  // 1. Find the latest DecisionRecord (highest tick number)
  // -------------------------------------------------------------------------
  const latestDecision = findLatestDecision(decisions);

  // -------------------------------------------------------------------------
  // 2. Find the matching OutcomeRecord (same decisionRecordId)
  // -------------------------------------------------------------------------
  const matchedOutcome = latestDecision
    ? outcomes.find((o) => o.decisionRecordId === latestDecision.recordId) ?? null
    : null;

  // -------------------------------------------------------------------------
  // 3. Compute cumulative notional from all EXECUTED outcomes
  //    We pass `decisions` so each executed trade is summed at its sizeQuote.
  // -------------------------------------------------------------------------
  const cumulativeNotionalQuote = computeCumulative(outcomes, decisions);

  // -------------------------------------------------------------------------
  // 4 & 5. Re-evaluate mandate using SHARED function
  // -------------------------------------------------------------------------
  const nowMs = Date.now();
  const recomputedEval = latestDecision
    ? evaluateMandate(latestDecision.intent, mandate, { cumulativeNotionalQuote, nowMs })
    : { passed: true, checkedRules: [], loosenCheckEnabled: false };

  // -------------------------------------------------------------------------
  // 6. Compute risk score using SHARED function
  // -------------------------------------------------------------------------
  const currentNotionalQuote = latestDecision?.intent.sizeQuote ?? 0;
  const stalePrice = latestDecision?.observation.stale ?? false;

  const risk = riskScore({
    mandateCheck: recomputedEval,
    stalePrice,
    cumulativeNotionalQuote,
    currentNotionalQuote
  });

  // -------------------------------------------------------------------------
  // 7. Detect self-check disagreement
  // -------------------------------------------------------------------------
  const selfCheckDisagreement = latestDecision
    ? latestDecision.mandateCheck.passed !== recomputedEval.passed
    : false;

  // -------------------------------------------------------------------------
  // 8. Detect mandate hash mismatch
  // -------------------------------------------------------------------------
  const expectedHash = hashMandate(mandate);
  const mandateHashMismatch = latestDecision
    ? latestDecision.mandateHash !== expectedHash
    : false;

  // -------------------------------------------------------------------------
  // 9. Determine verdict
  // -------------------------------------------------------------------------
  const hasBreachRule = !recomputedEval.passed;
  const isVerdict = (): FindingRecord["verdict"] => {
    if (hasBreachRule || mandateHashMismatch) return "BREACH";
    if (risk.score >= 35) return "WARN";
    return "PASS";
  };
  const verdict = isVerdict();

  // -------------------------------------------------------------------------
  // 10. Build explanation
  // -------------------------------------------------------------------------
  const explanation = buildExplanation({
    verdict,
    selfCheckDisagreement,
    mandateHashMismatch,
    risk,
    latestDecision,
    matchedOutcome,
    recomputedEval
  });

  // -------------------------------------------------------------------------
  // 11. Assemble the FindingRecord with actionTaken = "NONE" initially
  // -------------------------------------------------------------------------
  const reviewedDecisionBlobId: string =
    matchedOutcome?.decisionBlobId ??
    latestDecision?.recordId ??
    "unknown";

  const reviewedOutcomeBlobId: string | null =
    matchedOutcome?.recordId ?? null;

  const findingBase: FindingRecord = FindingRecordSchema.parse({
    findingId: `finding:${auditorId}:${tick}:${randomUUID().slice(0, 8)}`,
    ts: nowMs,
    auditorId,
    tick,
    reviewedDecisionBlobId,
    reviewedOutcomeBlobId,
    verdict,
    riskScore: risk,
    triggeredRules: risk.triggeredRules,
    explanation,
    actionTaken: "NONE" as FindingAction,
    pauseTxDigest: null,
    pauseTxExplorer: null,
    pauseReasonBlobId: null,
    narcPrevBlobId,
    traderPrevBlobId,
    selfCheckDisagreement,
    auditorVersion: AUDITOR_VERSION,
    model: deps.model ?? "none"
  });

  // -------------------------------------------------------------------------
  // 12. On BREACH: write finding first, then call onBreach handler
  // -------------------------------------------------------------------------
  if (verdict === "BREACH" && deps.onBreach) {
    // Write the finding first so the pause tx can reference the blob id
    const prelimBlobId = await deps.writeFinding(findingBase);

    const breachResult = await deps.onBreach(findingBase, prelimBlobId);

    // Update the finding with the breach action results
    const updatedFinding: FindingRecord = FindingRecordSchema.parse({
      ...findingBase,
      actionTaken: breachResult.actionTaken,
      pauseTxDigest: breachResult.pauseTxDigest,
      pauseReasonBlobId: breachResult.pauseReasonBlobId
    });

    // Write the updated finding (with action info)
    const findingBlobId = await deps.writeFinding(updatedFinding);

    return { finding: updatedFinding, findingBlobId };
  }

  // -------------------------------------------------------------------------
  // 13. Non-breach path: write and return
  // -------------------------------------------------------------------------
  const findingBlobId = await deps.writeFinding(findingBase);
  return { finding: findingBase, findingBlobId };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function findLatestDecision(
  decisions: DecisionRecord[]
): DecisionRecord | null {
  if (decisions.length === 0) return null;
  // Sort by timestamp so fresh decisions (from the latest agent run) are
  // preferred over older records with higher tick numbers from past sessions.
  return decisions.reduce((best, current) =>
    current.ts > best.ts ? current : best
  );
}

/**
 * Sum notional across all EXECUTED outcomes.
 *
 * When `decisions` is provided we join outcomes → decisions by decisionRecordId
 * and use the authoritative `intent.sizeQuote` from each decision.
 * Without decisions we fall back to `fillPrice` as a best-effort sentinel.
 */
export function computeCumulative(
  outcomes: OutcomeRecord[],
  decisions?: DecisionRecord[]
): number {
  const decisionMap = decisions
    ? new Map(decisions.map((d) => [d.recordId, d]))
    : null;

  let sum = 0;
  for (const o of outcomes) {
    if (o.executed) {
      if (decisionMap) {
        const dec = decisionMap.get(o.decisionRecordId);
        sum += dec ? dec.intent.sizeQuote : (o.fillPrice ?? 0);
      } else {
        sum += o.fillPrice ?? 0;
      }
    }
  }
  return sum;
}

type ExplanationArgs = {
  verdict: FindingRecord["verdict"];
  selfCheckDisagreement: boolean;
  mandateHashMismatch: boolean;
  risk: ReturnType<typeof riskScore>;
  latestDecision: DecisionRecord | null;
  matchedOutcome: OutcomeRecord | null;
  recomputedEval: ReturnType<typeof evaluateMandate>;
};

function buildExplanation({
  verdict,
  selfCheckDisagreement,
  mandateHashMismatch,
  risk,
  latestDecision,
  matchedOutcome,
  recomputedEval
}: ExplanationArgs): string {
  const parts: string[] = [];

  if (!latestDecision) {
    return "No decision records available yet. Narc standing by.";
  }

  parts.push(
    `Narc tick review of decision ${latestDecision.recordId} (agent tick ${latestDecision.tick}).`
  );

  if (mandateHashMismatch) {
    parts.push(
      `MANDATE HASH MISMATCH: decision carried ${latestDecision.mandateHash}; ` +
        `expected ${hashMandate(recomputedEval as unknown as Parameters<typeof hashMandate>[0])}. ` +
        `Possible tampering or version drift.`
    );
  }

  if (selfCheckDisagreement) {
    parts.push(
      `SELF-CHECK DISAGREEMENT: trader reported mandateCheck.passed=${latestDecision.mandateCheck.passed} ` +
        `but Narc recomputed passed=${recomputedEval.passed}.`
    );
  }

  if (!recomputedEval.passed) {
    const failedRules = recomputedEval.checkedRules
      .filter((r) => !r.passed)
      .map((r) => r.ruleId)
      .join(", ");
    parts.push(`Mandate BREACH — failed rules: [${failedRules}].`);
  }

  if (risk.score >= 35) {
    parts.push(`Risk score ${risk.score}/100 (${verdict}).`);
  }

  if (matchedOutcome) {
    parts.push(
      `Outcome: ${matchedOutcome.status}, executed=${matchedOutcome.executed}.`
    );
  } else {
    parts.push("No matching outcome record found for this decision.");
  }

  return parts.join(" ");
}
