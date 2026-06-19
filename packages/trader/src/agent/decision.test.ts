import { describe, expect, it } from "vitest";
import { sampleMandate } from "@narc/shared";
import { buildDecisionRecord, deterministicIntent, generateTradeDecision, normalizeTradeIntent } from "./decision.js";

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

  it("creates a valid normal LLM decision", async () => {
    const decision = await generateTradeDecision({
      mandate: sampleMandate,
      market: {
        pair: "SUI_USDC",
        midPrice: 1.25,
        priceFeedTs: Date.now(),
        deepbookPoolId: sampleMandate.expectedPoolId,
        signalInputs: { source: "test", tickSize: 0.0001, lotSize: 0.1, minSize: 1 }
      }
    }, async () =>
      JSON.stringify({
        choices: [
          {
            message: {
              content: JSON.stringify({
                intent: {
                  side: "bid",
                  pair: "SUI_USDC",
                  sizeQuote: 2,
                  limitPrice: 1.25
                },
                reasoning: "Small valid order."
              })
            }
          }
        ]
      })
    );

    expect(decision.intent.sizeQuote).toBe(2);
  });

  it("normalizes a decision to DeepBook tick and lot sizes", () => {
    const normalized = normalizeTradeIntent(
      {
        side: "bid",
        pair: "SUI_USDC",
        sizeQuote: 1.987,
        limitPrice: 1.25003
      },
      sampleMandate,
      {
        pair: "SUI_USDC",
        midPrice: 1.25,
        priceFeedTs: Date.now(),
        deepbookPoolId: sampleMandate.expectedPoolId,
        signalInputs: { source: "test", tickSize: 0.0001, lotSize: 0.1, minSize: 1 }
      }
    );

    expect(normalized.limitPrice).toBe(1.25);
    expect(normalized.sizeQuote).toBe(1.875);
  });

  it("creates a valid but risky demo breach decision", async () => {
    const decision = await generateTradeDecision({
      mandate: sampleMandate,
      breach: true,
      market: {
        pair: "SUI_USDC",
        midPrice: 1.25,
        priceFeedTs: Date.now(),
        deepbookPoolId: sampleMandate.expectedPoolId,
        signalInputs: { source: "test" }
      }
    });

    expect(decision.intent.sizeQuote).toBeGreaterThan(sampleMandate.maxNotionalQuote);
  });
});
