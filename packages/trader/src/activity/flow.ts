import { OutcomeRecordSchema, type Mandate, type OutcomeRecord, type OutcomeStatus } from "@narc/shared";
import { placePolicyGatedOrder } from "../execution/policyGatedOrder.js";
import { buildDecisionRecord, generateTradeDecision } from "../agent/decision.js";
import { readMarketSnapshot, type MarketSnapshot } from "../agent/market.js";
import type { LocalJournal } from "./localJournal.js";

export type RunTickInput = {
  agentId: string;
  tick: number;
  mandate: Mandate;
  journal: LocalJournal;
  market?: MarketSnapshot;
  loosenCheck?: boolean;
  breach?: boolean;
  prevDecisionBlobId: string | null;
  prevOutcomeBlobId: string | null;
};

export type RunTickDependencies = {
  readMarketSnapshot?: typeof readMarketSnapshot;
  generateTradeDecision?: typeof generateTradeDecision;
  buildDecisionRecord?: typeof buildDecisionRecord;
  placePolicyGatedOrder?: typeof placePolicyGatedOrder;
};

export async function runASideTick(
  input: RunTickInput,
  deps: RunTickDependencies = {}
): Promise<{ decisionBlobId: string; outcomeBlobId: string; outcome: OutcomeRecord }> {
  const market = input.market ?? await (deps.readMarketSnapshot ?? readMarketSnapshot)();
  const llmDecision = await (deps.generateTradeDecision ?? generateTradeDecision)({
    mandate: input.mandate,
    market,
    breach: input.breach
  });
  const intent = llmDecision.intent;
  const decision = await (deps.buildDecisionRecord ?? buildDecisionRecord)({
    agentId: input.agentId,
    tick: input.tick,
    mandate: input.mandate,
    intent,
    midPrice: market.midPrice,
    reasoning: llmDecision.reasoning,
    prevBlobId: input.prevDecisionBlobId,
    loosenCheck: input.loosenCheck,
    priceFeedTs: market.priceFeedTs,
    signalInputs: {
      ...market.signalInputs,
      ...(llmDecision.signalInputs ?? {})
    },
    deepbookPoolId: market.deepbookPoolId
  });

  const decisionBlobId = await input.journal.writeDecision(decision);

  if (!decision.mandateCheck.passed) {
    const outcome = await writeOutcome(input, decision.recordId, decisionBlobId, "ABORTED_SELF_CHECK", false, null, "self_check");
    const outcomeBlobId = await persistOutcome(input.journal, outcome);
    return { decisionBlobId, outcomeBlobId, outcome };
  }

  try {
    const result = await (deps.placePolicyGatedOrder ?? placePolicyGatedOrder)(intent, input.mandate);
    const outcome = await writeOutcome(input, decision.recordId, decisionBlobId, "EXECUTED", true, result.digest);
    const outcomeBlobId = await persistOutcome(input.journal, outcome);
    return { decisionBlobId, outcomeBlobId, outcome };
  } catch (error) {
    const classified = classifyExecutionFailure(error);
    const outcome = await writeOutcome(
      input,
      decision.recordId,
      decisionBlobId,
      classified.status,
      false,
      null,
      classified.abortedBy,
      classified.error
    );
    const outcomeBlobId = await persistOutcome(input.journal, outcome);
    return { decisionBlobId, outcomeBlobId, outcome };
  }
}

export function classifyExecutionFailure(error: unknown): {
  status: OutcomeStatus;
  abortedBy?: OutcomeRecord["abortedBy"];
  error: string;
} {
  const message = error instanceof Error ? error.message : String(error);
  if (/E_POLICY_PAUSED|policy.*paused|assert_active/i.test(message)) {
    return { status: "ABORTED_POLICY_PAUSED", abortedBy: "assert_active", error: message };
  }
  if (/withdraw_with_proof|insufficient.*balance|balance.*insufficient|InsufficientCoinBalance/i.test(message)) {
    return { status: "FAILED_BALANCE", error: message };
  }
  if (/gas|GasBalanceTooLow|No valid gas coins|insufficient gas/i.test(message)) {
    return { status: "FAILED_GAS", error: message };
  }
  return { status: "FAILED_DEEPBOOK", error: message };
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

async function persistOutcome(journal: LocalJournal, outcome: OutcomeRecord): Promise<string> {
  try {
    return await journal.writeOutcome(outcome);
  } catch (firstError) {
    try {
      return await journal.writeOutcome(outcome);
    } catch (secondError) {
      console.error(
        "Outcome journal write failed; leaving pending marker.",
        firstError instanceof Error ? firstError.message : String(firstError),
        secondError instanceof Error ? secondError.message : String(secondError)
      );
      return `pending:${outcome.recordId}`;
    }
  }
}
