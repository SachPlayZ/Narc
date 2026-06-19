import { describe, expect, it } from "vitest";
import { sampleMandate } from "@narc/shared";
import { deterministicBreachDecision, generateLlmTradeDecision, loadGroqAgentEnv } from "./groq.js";

describe("loadGroqAgentEnv", () => {
  it("defaults to qwen/qwen3-32b", () => {
    const env = loadGroqAgentEnv({ GROQ_API_KEY: "test-key" } as NodeJS.ProcessEnv);
    expect(env.GROQ_MODEL).toBe("qwen/qwen3-32b");
  });
});

describe("generateLlmTradeDecision", () => {
  it("parses a valid structured response", async () => {
    const decision = await generateLlmTradeDecision(
      {
        mandate: sampleMandate,
        pair: "SUI_USDC",
        midPrice: 1.25,
        priceFeedTs: Date.now(),
        deepbookPoolId: sampleMandate.expectedPoolId,
        signalInputs: { source: "test" }
      },
      { GROQ_API_KEY: "test-key", GROQ_MODEL: "qwen/qwen3-32b", GROQ_BASE_URL: "https://example.com" },
      async () =>
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
                  reasoning: "Stay under the mandate with a small bid.",
                  signalInputs: { confidence: 0.7 }
                })
              }
            }
          ]
        })
    );

    expect(decision.intent.pair).toBe("SUI_USDC");
    expect(decision.reasoning.length).toBeGreaterThan(0);
  });

  it("rejects invalid JSON payloads", async () => {
    await expect(
      generateLlmTradeDecision(
        {
          mandate: sampleMandate,
          pair: "SUI_USDC",
          midPrice: 1.25,
          priceFeedTs: Date.now(),
          deepbookPoolId: sampleMandate.expectedPoolId,
          signalInputs: { source: "test" }
        },
        { GROQ_API_KEY: "test-key", GROQ_MODEL: "qwen/qwen3-32b", GROQ_BASE_URL: "https://example.com" },
        async () =>
          JSON.stringify({
            choices: [{ message: { content: "{\"intent\": {\"side\": \"bid\"}}" } }]
          })
      )
    ).rejects.toThrow();
  });

  it("rejects empty assistant content", async () => {
    await expect(
      generateLlmTradeDecision(
        {
          mandate: sampleMandate,
          pair: "SUI_USDC",
          midPrice: 1.25,
          priceFeedTs: Date.now(),
          deepbookPoolId: sampleMandate.expectedPoolId,
          signalInputs: { source: "test" }
        },
        { GROQ_API_KEY: "test-key", GROQ_MODEL: "qwen/qwen3-32b", GROQ_BASE_URL: "https://example.com" },
        async () => JSON.stringify({ choices: [{ message: { content: "" } }] })
      )
    ).rejects.toThrow("Groq returned an empty decision payload.");
  });

  it("retries without json mode when Groq json validation fails", async () => {
    let calls = 0;
    const decision = await generateLlmTradeDecision(
      {
        mandate: sampleMandate,
        pair: "SUI_USDC",
        midPrice: 1.25,
        priceFeedTs: Date.now(),
        deepbookPoolId: sampleMandate.expectedPoolId,
        signalInputs: { source: "test" }
      },
      { GROQ_API_KEY: "test-key", GROQ_MODEL: "qwen/qwen3-32b", GROQ_BASE_URL: "https://example.com" },
      async () => {
        calls += 1;
        if (calls === 1) {
          throw new Error("json_validate_failed");
        }

        return JSON.stringify({
          choices: [
            {
              message: {
                content: [
                  "```json",
                  JSON.stringify({
                    intent: {
                      side: "bid",
                      pair: "SUI_USDC",
                      sizeQuote: 2,
                      limitPrice: 1.25
                    },
                    reasoning: "Fallback path worked."
                  }),
                  "```"
                ].join("\n")
              }
            }
          ]
        });
      }
    );

    expect(calls).toBe(2);
    expect(decision.reasoning).toContain("Fallback path");
  });
});

describe("deterministicBreachDecision", () => {
  it("creates an over-limit decision for demo mode", () => {
    const decision = deterministicBreachDecision(sampleMandate);
    expect(decision.intent.sizeQuote).toBeGreaterThan(sampleMandate.maxNotionalQuote);
  });
});
