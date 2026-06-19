import { describe, expect, it } from "vitest";
import { overLimitIntent, sampleMandate, validIntent } from "@narc/shared";
import { runTraderSelfCheck } from "./selfCheck.js";

describe("runTraderSelfCheck", () => {
  it("passes normal valid orders", () => {
    expect(runTraderSelfCheck(validIntent, sampleMandate).passed).toBe(true);
  });

  it("fails over-limit orders by default", () => {
    expect(runTraderSelfCheck(overLimitIntent, sampleMandate).passed).toBe(false);
  });

  it("loosens exactly the max_notional rule at the trader call site", () => {
    const result = runTraderSelfCheck(overLimitIntent, sampleMandate, {}, { loosenCheck: true });
    expect(result.passed).toBe(true);
    expect(result.loosenCheckEnabled).toBe(true);
    expect(result.checkedRules.filter((rule) => !rule.passed)).toHaveLength(0);
  });
});
