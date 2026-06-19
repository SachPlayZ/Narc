import { describe, expect, it } from "vitest";
import { sampleMandate } from "@narc/shared";
import { buildDecisionRecord, deterministicIntent } from "./decision.js";

describe("buildDecisionRecord", () => {
  it("creates a valid decision record", async () => {
    const decision = await buildDecisionRecord({
      agentId: "agent-a",
      tick: 1,
      mandate: sampleMandate,
      intent: deterministicIntent(sampleMandate),
      midPrice: 1.25,
      reasoning: "test",
      prevBlobId: null
    });

    expect(decision.mandateCheck.passed).toBe(true);
    expect(decision.feeEstimate.estimatedFeeBps).toBeGreaterThan(0);
  });

  it("marks stale prices", async () => {
    const decision = await buildDecisionRecord({
      agentId: "agent-a",
      tick: 1,
      mandate: sampleMandate,
      intent: deterministicIntent(sampleMandate),
      midPrice: 1.25,
      reasoning: "test",
      prevBlobId: null,
      priceFeedTs: Date.now() - 20_000
    });

    expect(decision.observation.stale).toBe(true);
  });
});
