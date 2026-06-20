import { describe, expect, it, vi } from "vitest";
import { DecisionRecordSchema, OutcomeRecordSchema, sampleMandate } from "@narc/shared";
import { deterministicIntent } from "../agent/decision.js";
import type { MarketSnapshot } from "../agent/market.js";
import { classifyExecutionFailure, runASideTick } from "./flow.js";
import type { LocalJournal } from "./localJournal.js";

const market: MarketSnapshot = {
  pair: "SUI_USDC",
  midPrice: 1.25,
  priceFeedTs: Date.now(),
  deepbookPoolId: sampleMandate.expectedPoolId,
  signalInputs: {
    source: "test",
    tickSize: 0.0001,
    lotSize: 0.1,
    minSize: 1
  }
};

describe("runASideTick", { timeout: 60000 }, () => {
  it("prevents trading when decision persistence fails", async () => {
    const placeOrder = vi.fn();

    await expect(
      runASideTick(
        {
          agentId: "agent-a",
          tick: 1,
          mandate: sampleMandate,
          market,
          journal: {
            writeDecision: async () => {
              throw new Error("disk full");
            },
            writeOutcome: async () => "unused"
          },
          prevDecisionBlobId: null,
          prevOutcomeBlobId: null
        },
        {
          generateTradeDecision: async () => ({
            intent: deterministicIntent(sampleMandate),
            reasoning: "test"
          }),
          placePolicyGatedOrder: placeOrder
        }
      )
    ).rejects.toThrow("disk full");

    expect(placeOrder).not.toHaveBeenCalled();
  });

  it("writes a self-check abort outcome and skips execution", async () => {
    const placeOrder = vi.fn();
    const writes: { decisions: unknown[]; outcomes: unknown[] } = { decisions: [], outcomes: [] };

    const result = await runASideTick(
      {
        agentId: "agent-a",
        tick: 2,
        mandate: sampleMandate,
        market,
        journal: createMemoryJournal(writes),
        prevDecisionBlobId: null,
        prevOutcomeBlobId: null
      },
      {
        generateTradeDecision: async () => ({
          intent: deterministicIntent(sampleMandate, true),
          reasoning: "breach"
        }),
        placePolicyGatedOrder: placeOrder
      }
    );

    expect(result.outcome.status).toBe("ABORTED_SELF_CHECK");
    expect(placeOrder).not.toHaveBeenCalled();
    expect(writes.decisions).toHaveLength(1);
    expect(writes.outcomes).toHaveLength(1);
  });

  it("maps a paused policy failure to ABORTED_POLICY_PAUSED", async () => {
    const result = await runASideTick(
      {
        agentId: "agent-a",
        tick: 3,
        mandate: sampleMandate,
        market,
        journal: createMemoryJournal(),
        prevDecisionBlobId: null,
        prevOutcomeBlobId: null
      },
      {
        generateTradeDecision: async () => ({
          intent: deterministicIntent(sampleMandate),
          reasoning: "test"
        }),
        placePolicyGatedOrder: async () => {
          throw new Error("MoveAbort assert_active E_POLICY_PAUSED");
        }
      }
    );

    expect(result.outcome.status).toBe("ABORTED_POLICY_PAUSED");
    expect(result.outcome.abortedBy).toBe("assert_active");
  });

  it("maps balance failures distinctly", async () => {
    const result = await runASideTick(
      {
        agentId: "agent-a",
        tick: 4,
        mandate: sampleMandate,
        market,
        journal: createMemoryJournal(),
        prevDecisionBlobId: null,
        prevOutcomeBlobId: null
      },
      {
        generateTradeDecision: async () => ({
          intent: deterministicIntent(sampleMandate),
          reasoning: "test"
        }),
        placePolicyGatedOrder: async () => {
          throw new Error("deepbook balance_manager::withdraw_with_proof abort");
        }
      }
    );

    expect(result.outcome.status).toBe("FAILED_BALANCE");
  });

  it("records missing policy env as a failed deepbook outcome", async () => {
    const result = await runASideTick(
      {
        agentId: "agent-a",
        tick: 4,
        mandate: sampleMandate,
        market,
        journal: createMemoryJournal(),
        prevDecisionBlobId: null,
        prevOutcomeBlobId: null
      },
      {
        generateTradeDecision: async () => ({
          intent: deterministicIntent(sampleMandate),
          reasoning: "test"
        }),
        placePolicyGatedOrder: async () => {
          throw new Error("NARC_POLICY_PACKAGE_ID and AGENT_POLICY_OBJECT_ID are required for policy-gated execution.");
        }
      }
    );

    expect(result.outcome.status).toBe("FAILED_DEEPBOOK");
    expect(result.outcome.error).toContain("policy-gated execution");
  });

  it("carries the prev blob chain forward", async () => {
    const writes = { decisions: [] as any[], outcomes: [] as any[] };

    const first = await runASideTick(
      {
        agentId: "agent-a",
        tick: 5,
        mandate: sampleMandate,
        market,
        journal: createMemoryJournal(writes),
        prevDecisionBlobId: null,
        prevOutcomeBlobId: null
      },
      {
        generateTradeDecision: async () => ({
          intent: deterministicIntent(sampleMandate),
          reasoning: "first"
        }),
        placePolicyGatedOrder: async () => ({ digest: "0xabc", raw: {} })
      }
    );

    const second = await runASideTick(
      {
        agentId: "agent-a",
        tick: 6,
        mandate: sampleMandate,
        market,
        journal: createMemoryJournal(writes),
        prevDecisionBlobId: first.decisionBlobId,
        prevOutcomeBlobId: first.outcomeBlobId
      },
      {
        generateTradeDecision: async () => ({
          intent: deterministicIntent(sampleMandate),
          reasoning: "second"
        }),
        placePolicyGatedOrder: async () => ({ digest: "0xdef", raw: {} })
      }
    );

    const secondDecision = writes.decisions.at(-1);
    const secondOutcome = writes.outcomes.at(-1);

    expect(secondDecision.prevBlobId).toBe(first.decisionBlobId);
    expect(secondOutcome.prevBlobId).toBe(first.outcomeBlobId);
    expect(second.outcome.txDigest).toBe("0xdef");
  });

  it("returns a pending marker when outcome persistence fails twice", async () => {
    const journal: LocalJournal = {
      writeDecision: async (record) => `decision:${record.recordId}`,
      writeOutcome: vi
        .fn()
        .mockRejectedValueOnce(new Error("first failure"))
        .mockRejectedValueOnce(new Error("second failure"))
    };

    const result = await runASideTick(
      {
        agentId: "agent-a",
        tick: 7,
        mandate: sampleMandate,
        market,
        journal,
        prevDecisionBlobId: null,
        prevOutcomeBlobId: null
      },
      {
        generateTradeDecision: async () => ({
          intent: deterministicIntent(sampleMandate),
          reasoning: "test"
        }),
        placePolicyGatedOrder: async () => ({ digest: "0x123", raw: {} })
      }
    );

    expect(result.outcomeBlobId).toMatch(/^pending:/);
  });
});

describe("classifyExecutionFailure", () => {
  it("maps gas errors distinctly", () => {
    expect(classifyExecutionFailure(new Error("GasBalanceTooLow: no valid gas coins"))).toEqual({
      status: "FAILED_GAS",
      error: "GasBalanceTooLow: no valid gas coins"
    });
  });
});

function createMemoryJournal(store = { decisions: [] as any[], outcomes: [] as any[] }): LocalJournal {
  return {
    async writeDecision(record) {
      const parsed = DecisionRecordSchema.parse(record);
      store.decisions.push(parsed);
      return `decision:${parsed.recordId}`;
    },
    async writeOutcome(record) {
      const parsed = OutcomeRecordSchema.parse(record);
      store.outcomes.push(parsed);
      return `outcome:${parsed.recordId}`;
    }
  };
}
