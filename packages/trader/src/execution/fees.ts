import type { FeeEstimate, TradeIntent } from "@narc/shared";

const FALLBACK_DEEPBOOK_FEE_BPS = 2.5;

export async function estimateFee(intent: TradeIntent): Promise<FeeEstimate> {
  return {
    estimatedFeeBps: FALLBACK_DEEPBOOK_FEE_BPS,
    feeAmountQuote: (intent.sizeQuote * FALLBACK_DEEPBOOK_FEE_BPS) / 10_000,
    feeToken: quoteToken(intent.pair),
    source: "static_fallback"
  };
}

function quoteToken(pair: string): string | null {
  const [, quote] = pair.split("_");
  return quote || null;
}
