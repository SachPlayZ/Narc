import { describe, expect, it } from "vitest";
import { sampleMandate, validIntent } from "@narc/shared";
import { checkPoolParameters } from "./poolChecks.js";

describe("checkPoolParameters", () => {
  it("passes a valid order", () => {
    expect(checkPoolParameters(validIntent, sampleMandate).every((check) => check.passed)).toBe(true);
  });

  it("fails wrong pair", () => {
    const checks = checkPoolParameters({ ...validIntent, pair: "DEEP_USDC" }, sampleMandate);
    expect(checks.find((check) => check.name === "allowed_pair")?.passed).toBe(false);
  });

  it("fails too small orders", () => {
    const checks = checkPoolParameters({ ...validIntent, sizeQuote: 0.5 }, sampleMandate);
    expect(checks.find((check) => check.name === "minimum_size")?.passed).toBe(false);
  });

  it("fails bad lot sizes", () => {
    const checks = checkPoolParameters({ ...validIntent, sizeQuote: 1.005 }, sampleMandate);
    expect(checks.find((check) => check.name === "lot_size")?.passed).toBe(false);
  });

  it("fails bad ticks", () => {
    const checks = checkPoolParameters({ ...validIntent, limitPrice: 1.25005 }, sampleMandate);
    expect(checks.find((check) => check.name === "tick_size")?.passed).toBe(false);
  });

  it("fails disallowed side", () => {
    const checks = checkPoolParameters({ ...validIntent, side: "ask" }, sampleMandate);
    expect(checks.find((check) => check.name === "allowed_side")?.passed).toBe(false);
  });

  it("fails max notional breaches", () => {
    const checks = checkPoolParameters({ ...validIntent, sizeQuote: 26 }, sampleMandate);
    expect(checks.find((check) => check.name === "max_notional")?.passed).toBe(false);
  });
});
