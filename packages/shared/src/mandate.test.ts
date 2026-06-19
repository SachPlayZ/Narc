import { describe, expect, it } from "vitest";
import { evaluateMandate, hashMandate } from "./mandate.js";
import { overLimitIntent, sampleMandate, validIntent } from "./fixtures.js";

describe("evaluateMandate", () => {
  it("passes a valid intent", () => {
    const result = evaluateMandate(validIntent, sampleMandate, { nowMs: Date.now() });
    expect(result.passed).toBe(true);
  });

  it("fails an over-limit intent", () => {
    const result = evaluateMandate(overLimitIntent, sampleMandate, { nowMs: Date.now() });
    expect(result.passed).toBe(false);
    expect(result.checkedRules.find((rule) => rule.ruleId === "max_notional")?.passed).toBe(false);
  });

  it("hashes mandates deterministically", () => {
    expect(hashMandate(sampleMandate)).toEqual(hashMandate({ ...sampleMandate }));
  });
});
