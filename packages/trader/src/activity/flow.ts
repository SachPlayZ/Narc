import { OutcomeRecordSchema, type Mandate, type OutcomeRecord } from "@narc/shared";
import { placePolicyGatedOrder } from "../execution/policyGatedOrder.js";
import { buildDecisionRecord, deterministicIntent } from "../agent/decision.js";
import type { LocalJournal } from "./localJournal.js";

export type RunTickInput = {
  agentId: string;
  tick: number;
  mandate: Mandate;
  journal: LocalJournal;
  loosenCheck?: boolean;
  breach?: boolean;
  prevDecisionBlobId: string | null;
  prevOutcomeBlobId: string | null;
};

export async function runASideTick(input: RunTickInput): Promise<{ decisionBlobId: string; outcomeBlobId: string; outcome: OutcomeRecord }> {
  const intent = deterministicIntent(input.mandate, input.breach);
  const decision = await buildDecisionRecord({
    agentId: input.agentId,
    tick: input.tick,
    mandate: input.mandate,
    intent,
    midPrice: 1.25,
    reasoning: input.breach ? "Deterministic demo breach order." : "Deterministic under-mandate order.",
    prevBlobId: input.prevDecisionBlobId,
    loosenCheck: input.loosenCheck
  });

  const decisionBlobId = await input.journal.writeDecision(decision);

  if (!decision.mandateCheck.passed) {
    const outcome = await writeOutcome(input, decision.recordId, decisionBlobId, "ABORTED_SELF_CHECK", false, null, "self_check");
    const outcomeBlobId = await input.journal.writeOutcome(outcome);
    return { decisionBlobId, outcomeBlobId, outcome };
  }

  try {
    const result = await placePolicyGatedOrder(intent, input.mandate);
    const outcome = await writeOutcome(input, decision.recordId, decisionBlobId, "EXECUTED", true, result.digest);
    const outcomeBlobId = await input.journal.writeOutcome(outcome);
    return { decisionBlobId, outcomeBlobId, outcome };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const policyPaused = /E_POLICY_PAUSED|policy.*paused|assert_active/i.test(message);
    const outcome = await writeOutcome(
      input,
      decision.recordId,
      decisionBlobId,
      policyPaused ? "ABORTED_POLICY_PAUSED" : "FAILED_DEEPBOOK",
      false,
      null,
      policyPaused ? "assert_active" : undefined,
      message
    );
    const outcomeBlobId = await input.journal.writeOutcome(outcome);
    return { decisionBlobId, outcomeBlobId, outcome };
  }
}

async function writeOutcome(
  input: RunTickInput,
  decisionRecordId: string,
  decisionBlobId: string,
  status: OutcomeRecord["status"],
  executed: boolean,
  txDigest: string | null,
  abortedBy?: OutcomeRecord["abortedBy"],
  error?: string
): Promise<OutcomeRecord> {
  return OutcomeRecordSchema.parse({
    recordId: `${input.agentId}:outcome:${input.tick}:${Date.now()}`,
    ts: Date.now(),
    agentId: input.agentId,
    tick: input.tick,
    decisionRecordId,
    decisionBlobId,
    status,
    executed,
    txDigest,
    abortedBy,
    error,
    prevBlobId: input.prevOutcomeBlobId
  });
}
