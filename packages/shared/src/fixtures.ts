import type { Mandate, TradeIntent } from "./schemas.js";

export const sampleMandate: Mandate = {
  mandateId: "demo-mandate",
  maxNotionalQuote: 25,
  maxCumulativeNotionalQuote: 100,
  allowedPairs: ["SUI_USDC"],
  allowedSide: "bid",
  maxSlippageBps: 50,
  expiresAt: 4_102_444_800_000,
  venue: "deepbook",
  minOrderSizeQuote: 1,
  lotSizeQuote: 0.01,
  tickSize: 0.0001,
  expectedPoolId: "0xdeepbook_pool",
  rules: [
    { id: "max_notional", description: "Single order must stay under quote notional.", severity: "BREACH" },
    { id: "pair_allowed", description: "Only configured DeepBook pair may be traded.", severity: "BREACH" }
  ]
};

export const validIntent: TradeIntent = {
  side: "bid",
  pair: "SUI_USDC",
  sizeQuote: 5,
  limitPrice: 1.25
};

export const overLimitIntent: TradeIntent = {
  ...validIntent,
  sizeQuote: 50
};
