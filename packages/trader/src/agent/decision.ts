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
import {
  deterministicBreachDecision,
  generateLlmTradeDecision,
  type ChatRequester,
  type LlmDecision
} from "./groq.js";
import type { MarketSnapshot } from "./market.js";

const EPSILON = 1e-9;

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
  signalInputs?: Record<string, string | number | boolean | null>;
  deepbookPoolId?: string;
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
      signalInputs: input.signalInputs ?? { source: "deterministic-demo" },
      priceFeedTs,
      stale: ts - priceFeedTs > 10_000,
      deepbookPoolId: input.deepbookPoolId ?? input.mandate.expectedPoolId
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

export type GenerateTradeDecisionInput = {
  mandate: Mandate;
  market: MarketSnapshot;
  breach?: boolean;
};

export async function generateTradeDecision(
  input: GenerateTradeDecisionInput,
  requester?: ChatRequester
): Promise<LlmDecision> {
  if (input.breach) {
    return deterministicBreachDecision(input.mandate);
  }

  const decision = await generateLlmTradeDecision(
    {
      mandate: input.mandate,
      pair: input.market.pair,
      midPrice: input.market.midPrice,
      priceFeedTs: input.market.priceFeedTs,
      deepbookPoolId: input.market.deepbookPoolId,
      signalInputs: input.market.signalInputs
    },
    undefined,
    requester
  );

  return {
    ...decision,
    intent: normalizeTradeIntent(decision.intent, input.mandate, input.market)
  };
}

export function normalizeTradeIntent(intent: TradeIntent, mandate: Mandate, market: MarketSnapshot): TradeIntent {
  const tickSize = numericSignal(market, "tickSize") ?? mandate.tickSize;
  const rawPrice = intent.limitPrice > 0 ? intent.limitPrice : market.midPrice;
  const limitPrice = alignPrice(rawPrice, tickSize, intent.side);
  const lotSizeBase = numericSignal(market, "lotSize") ?? Math.max(mandate.lotSizeQuote / limitPrice, EPSILON);
  const minSizeBase = numericSignal(market, "minSize") ?? Math.max(mandate.minOrderSizeQuote / limitPrice, lotSizeBase);
  const targetQuote = clamp(intent.sizeQuote, mandate.minOrderSizeQuote, mandate.maxNotionalQuote);

  let baseQuantity = floorToStep(targetQuote / limitPrice, lotSizeBase);
  if (baseQuantity + EPSILON < minSizeBase) {
    baseQuantity = ceilToStep(minSizeBase, lotSizeBase);
  }

  let sizeQuote = round(baseQuantity * limitPrice);
  if (sizeQuote > mandate.maxNotionalQuote + EPSILON) {
    baseQuantity = floorToStep(mandate.maxNotionalQuote / limitPrice, lotSizeBase);
    sizeQuote = round(baseQuantity * limitPrice);
  }

  if (baseQuantity <= 0 || sizeQuote <= 0) {
    throw new Error("Normalized order is empty after DeepBook lot-size alignment.");
  }
  if (baseQuantity + EPSILON < minSizeBase) {
    throw new Error("Mandate maxNotionalQuote is too small for the pool minimum size.");
  }
  if (sizeQuote + EPSILON < mandate.minOrderSizeQuote) {
    throw new Error("Normalized order fell below mandate minOrderSizeQuote.");
  }
  if (sizeQuote > mandate.maxNotionalQuote + EPSILON) {
    throw new Error("Normalized order still exceeds mandate maxNotionalQuote.");
  }

  return {
    ...intent,
    sizeQuote,
    limitPrice
  };
}

function numericSignal(market: MarketSnapshot, key: string): number | null {
  const value = market.signalInputs[key];
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : null;
}

function alignPrice(price: number, tickSize: number, side: TradeIntent["side"]): number {
  return side === "ask" ? ceilToStep(price, tickSize) : floorToStep(price, tickSize);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function floorToStep(value: number, step: number): number {
  return round(Math.floor((value + EPSILON) / step) * step);
}

function ceilToStep(value: number, step: number): number {
  return round(Math.ceil((value - EPSILON) / step) * step);
}

function round(value: number): number {
  return Number(value.toFixed(9));
}
