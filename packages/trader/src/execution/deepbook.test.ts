import { describe, expect, it } from "vitest";
import { resolveDeepBookPool, quantityFromIntent, isStepMultiple, feeEstimateFromTradeParams, unavailableFeeEstimate } from "./deepbook.js";

describe("resolveDeepBookPool", () => {
  it("resolves a known pool key", () => {
    const resolved = resolveDeepBookPool("SUI_DBUSDC");
    expect(resolved.lookupKey).toBe("SUI_DBUSDC");
    expect(resolved.pair).toBe("SUI_DBUSDC");
  });

  it("resolves a known pool address", () => {
    const resolved = resolveDeepBookPool("0x1c19362ca52b8ffd7a33cee805a67d40f31e6ba303753fd3a4cfdfacea7163a5");
    expect(resolved.lookupKey).toBe("SUI_DBUSDC");
  });
});

describe("quantityFromIntent", () => {
  it("converts quote notional to base quantity", () => {
    expect(quantityFromIntent({ side: "ask", pair: "SUI_DBUSDC", sizeQuote: 3.12, limitPrice: 3.12 })).toBe(1);
  });
});

describe("isStepMultiple", () => {
  it("accepts clean step multiples", () => {
    expect(isStepMultiple(0.4, 0.1)).toBe(true);
  });

  it("rejects values off step", () => {
    expect(isStepMultiple(0.41, 0.1)).toBe(false);
  });
});

describe("fee estimators", () => {
  it("converts trade params into a stable fee shape", () => {
    expect(
      feeEstimateFromTradeParams(
        { side: "bid", pair: "SUI_DBUSDC", sizeQuote: 10, limitPrice: 2 },
        { takerFee: 0.0025 }
      )
    ).toEqual({
      estimatedFeeBps: 25,
      feeAmountQuote: 0.025,
      feeToken: "DBUSDC",
      source: "deepbook"
    });
  });

  it("returns an unavailable shape when fee data cannot be loaded", () => {
    expect(unavailableFeeEstimate({ side: "bid", pair: "SUI_DBUSDC", sizeQuote: 10, limitPrice: 2 })).toEqual({
      estimatedFeeBps: 2.5,
      feeAmountQuote: 0.0025,
      feeToken: "DBUSDC",
      source: "static_fallback"
    });
  });
});
