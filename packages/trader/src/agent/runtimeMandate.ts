import type { Mandate, Side } from "@narc/shared";
import type { MarketSnapshot } from "./market.js";

const DEFAULT_MAX_SLIPPAGE_BPS = 50;
const DEFAULT_MAX_CUMULATIVE_NOTIONAL = 25;

export type RuntimeMandateOptions = {
  mandateId?: string;
  allowedSide?: Side;
  maxNotionalQuote?: number;
  maxCumulativeNotionalQuote?: number;
  maxSlippageBps?: number;
  expiresAt?: number;
};

export function buildRuntimeMandate(
  market: MarketSnapshot,
  options: RuntimeMandateOptions = {}
): Mandate {
  const tickSize = readPositiveSignal(market, "tickSize");
  const lotSizeBase = readPositiveSignal(market, "lotSize");
  const minSizeBase = readPositiveSignal(market, "minSize");
  const lotSizeQuote = round(lotSizeBase * tickSize);
  const minOrderSizeQuote = roundUp(minSizeBase * market.midPrice, lotSizeQuote);
  const maxNotionalQuote = options.maxNotionalQuote ?? roundUp(Math.max(minOrderSizeQuote * 3, 2), lotSizeQuote);

  if (maxNotionalQuote < minOrderSizeQuote) {
    throw new Error("Configured maxNotionalQuote is below the pool minimum order size.");
  }

  return {
    mandateId: options.mandateId ?? `live-${market.deepbookPoolId.slice(0, 10)}`,
    maxNotionalQuote,
    maxCumulativeNotionalQuote: options.maxCumulativeNotionalQuote ?? DEFAULT_MAX_CUMULATIVE_NOTIONAL,
    allowedPairs: [market.pair],
    allowedSide: options.allowedSide,
    maxSlippageBps: options.maxSlippageBps ?? DEFAULT_MAX_SLIPPAGE_BPS,
    expiresAt: options.expiresAt ?? Date.now() + 24 * 60 * 60 * 1000,
    venue: "deepbook",
    minOrderSizeQuote,
    lotSizeQuote,
    tickSize,
    expectedPoolId: market.deepbookPoolId,
    rules: [
      {
        id: "max_notional",
        description: "Single order must stay under quote notional.",
        severity: "BREACH"
      },
      {
        id: "pair_allowed",
        description: "Only the configured DeepBook pair may be traded.",
        severity: "BREACH"
      }
    ]
  };
}

function readPositiveSignal(market: MarketSnapshot, key: string): number {
  const value = market.signalInputs[key];
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    throw new Error(`Market snapshot is missing a positive numeric ${key} signal.`);
  }
  return value;
}

function roundUp(value: number, step: number): number {
  return round(Math.ceil(value / step) * step);
}

function round(value: number): number {
  return Number(value.toFixed(9));
}
