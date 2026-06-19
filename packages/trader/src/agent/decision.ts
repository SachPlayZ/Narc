import {
  DecisionRecordSchema,
  hashMandate,
  type DecisionRecord,
  type Mandate,
  type TradeIntent
} from "@narc/shared";
import { estimateFee } from "../execution/fees.js";
import { checkPoolParameters } from "../execution/poolChecks.js";
import { runTraderSelfCheck } from "../mandate/selfCheck.js";

export type BuildDecisionInput = {
  agentId: string;
  tick: number;
  mandate: Mandate;
  intent: TradeIntent;
  midPrice: number;
  reasoning: string;
  prevBlobId: string | null;
  loosenCheck?: boolean;
  priceFeedTs?: number;
};

export async function buildDecisionRecord(input: BuildDecisionInput): Promise<DecisionRecord> {
  const ts = Date.now();
  const priceFeedTs = input.priceFeedTs ?? ts;
  const mandateCheck = runTraderSelfCheck(input.intent, input.mandate, { nowMs: ts }, { loosenCheck: input.loosenCheck });
  const record: DecisionRecord = {
    recordId: `${input.agentId}:decision:${input.tick}:${ts}`,
    ts,
    agentId: input.agentId,
    tick: input.tick,
    observation: {
      pair: input.intent.pair,
      midPrice: input.midPrice,
      signalInputs: { source: "deterministic-demo" },
      priceFeedTs,
      stale: ts - priceFeedTs > 10_000,
      deepbookPoolId: input.mandate.expectedPoolId
    },
    intent: input.intent,
    reasoning: input.reasoning,
    mandateHash: hashMandate(input.mandate),
    mandateCheck,
    poolChecks: checkPoolParameters(input.intent, input.mandate),
    feeEstimate: await estimateFee(input.intent),
    prevBlobId: input.prevBlobId
  };

  return DecisionRecordSchema.parse(record);
}

export function deterministicIntent(mandate: Mandate, breach = false): TradeIntent {
  return {
    side: mandate.allowedSide ?? "bid",
    pair: mandate.allowedPairs[0] ?? "SUI_USDC",
    sizeQuote: breach ? mandate.maxNotionalQuote * 2 : Math.max(mandate.minOrderSizeQuote, mandate.maxNotionalQuote / 5),
    limitPrice: 1.25
  };
}
