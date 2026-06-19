import type { Mandate, PoolParameterCheck, TradeIntent } from "@narc/shared";

const EPSILON = 1e-9;

export function checkPoolParameters(intent: TradeIntent, mandate: Mandate, poolId = mandate.expectedPoolId): PoolParameterCheck[] {
  return [
    check("expected_pool", poolId === mandate.expectedPoolId, `Expected pool ${mandate.expectedPoolId}, got ${poolId}.`),
    check("allowed_pair", mandate.allowedPairs.includes(intent.pair), `Pair ${intent.pair} must be allowed.`),
    check("minimum_size", intent.sizeQuote >= mandate.minOrderSizeQuote, `Size ${intent.sizeQuote} must be >= ${mandate.minOrderSizeQuote}.`),
    check("lot_size", isMultiple(intent.sizeQuote, mandate.lotSizeQuote), `Size ${intent.sizeQuote} must match lot ${mandate.lotSizeQuote}.`),
    check("tick_size", isMultiple(intent.limitPrice, mandate.tickSize), `Price ${intent.limitPrice} must match tick ${mandate.tickSize}.`),
    check("allowed_side", !mandate.allowedSide || mandate.allowedSide === intent.side, `Side ${intent.side} must be allowed.`),
    check("max_notional", intent.sizeQuote <= mandate.maxNotionalQuote, `Size ${intent.sizeQuote} must be <= ${mandate.maxNotionalQuote}.`)
  ];
}

export function assertPoolChecksPass(checks: PoolParameterCheck[]): void {
  const failed = checks.filter((item) => !item.passed);
  if (failed.length > 0) {
    throw new Error(`Pool parameter checks failed: ${failed.map((item) => item.name).join(", ")}`);
  }
}

function check(name: string, passed: boolean, message: string): PoolParameterCheck {
  return { name, passed, message };
}

function isMultiple(value: number, step: number): boolean {
  const quotient = value / step;
  return Math.abs(quotient - Math.round(quotient)) < EPSILON;
}
