/**
 * tick.test.ts — unit tests for auditTick (no real Sui/MemWal).
 *
 * All network calls are mocked; only shared logic and tick.ts are exercised.
 */

import { describe, expect, it, vi } from "vitest";
import {
  DecisionRecordSchema,
  FindingRecordSchema,
  evaluateMandate,
  hashMandate,
  sampleMandate,
  validIntent,
  overLimitIntent,
  type DecisionRecord,
  type FindingRecord,
  type Mandate,
  type OutcomeRecord
} from "@narc/shared";
import { auditTick } from "../src/tick.js";
import type { NarcJournal } from "../src/types.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeDecision(
  intent: (typeof validIntent),
  tick: number,
  prevBlobId: string | null = null,
  mandateOverride?: Mandate
): DecisionRecord {
  const mandate = mandateOverride ?? sampleMandate;
  return DecisionRecordSchema.parse({
    recordId: `test:${tick}`,
    ts: Date.now(),
    agentId: "test-agent",
    tick,
    observation: {
      pair: "SUI_USDC",
      midPrice: 1.0,
      signalInputs: {},
      priceFeedTs: Date.now(),
      stale: false,
      deepbookPoolId: "0xpool"
    },
    intent,
    reasoning: "test",
    mandateHash: hashMandate(mandate),
    mandateCheck: evaluateMandate(intent, mandate),
    poolChecks: [],
    feeEstimate: {
      estimatedFeeBps: 10,
      feeAmountQuote: null,
      feeToken: null,
      source: "unavailable"
    },
    prevBlobId
  });
}

function makeOutcome(
  decision: DecisionRecord,
  executed = true
): OutcomeRecord {
  return {
    recordId: `outcome:${decision.tick}`,
    ts: Date.now(),
    agentId: decision.agentId,
    tick: decision.tick,
    decisionRecordId: decision.recordId,
    decisionBlobId: `blob:decision:${decision.tick}`,
    status: executed ? "EXECUTED" : "FAILED_DEEPBOOK",
    executed,
    txDigest: executed ? "0xabc" : null,
    fillPrice: executed ? decision.intent.limitPrice : undefined,
    prevBlobId: null
  };
}

function makeMockJournal(): NarcJournal & {
  writtenFindings: FindingRecord[];
} {
  const writtenFindings: FindingRecord[] = [];
  return {
    writtenFindings,
    writeDecision: vi.fn().mockResolvedValue("mock:blob:decision"),
    writeOutcome: vi.fn().mockResolvedValue("mock:blob:outcome"),
    writeFinding: vi.fn().mockImplementation(async (r: FindingRecord) => {
      writtenFindings.push(r);
      return `mock:blob:finding:${r.tick}`;
    }),
    readAllDecisions: vi.fn().mockResolvedValue([]),
    readAllOutcomes: vi.fn().mockResolvedValue([]),
    readAllFindings: vi.fn().mockResolvedValue([])
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("auditTick", () => {
  // 1. Eight good decisions → PASS, actionTaken NONE
  it("returns PASS for 8 valid decisions", async () => {
    const decisions = Array.from({ length: 8 }, (_, i) =>
      makeDecision(validIntent, i)
    );
    const outcomes = decisions.map((d) => makeOutcome(d));

    const journal = makeMockJournal();
    const writeFinding = (r: FindingRecord) => journal.writeFinding(r);

    const result = await auditTick(
      {
        auditorId: "narc",
        agentId: "test-agent",
        tick: 8,
        mandate: sampleMandate,
        decisions,
        outcomes,
        narcPrevBlobId: null,
        traderPrevBlobId: null
      },
      { writeFinding }
    );

    expect(result.finding.verdict).toBe("PASS");
    expect(result.finding.actionTaken).toBe("NONE");
    expect(result.finding.selfCheckDisagreement).toBe(false);
    expect(result.findingBlobId).toMatch(/^mock:blob:finding:/);
  });

  // 2. Over-limit decision → BREACH
  it("returns BREACH for over-limit intent", async () => {
    const decisions = [
      makeDecision(validIntent, 0),
      makeDecision(overLimitIntent, 1)
    ];
    const outcomes = decisions.map((d) => makeOutcome(d));

    const journal = makeMockJournal();
    const writeFinding = (r: FindingRecord) => journal.writeFinding(r);
    const onBreach = vi.fn().mockResolvedValue({
      actionTaken: "PAUSED_ONCHAIN",
      pauseTxDigest: "0xtxdigest",
      pauseReasonBlobId: "blob:reason"
    });

    const result = await auditTick(
      {
        auditorId: "narc",
        agentId: "test-agent",
        tick: 2,
        mandate: sampleMandate,
        decisions,
        outcomes,
        narcPrevBlobId: null,
        traderPrevBlobId: null
      },
      { writeFinding, onBreach }
    );

    expect(result.finding.verdict).toBe("BREACH");
    expect(result.finding.actionTaken).toBe("PAUSED_ONCHAIN");
    expect(result.finding.pauseTxDigest).toBe("0xtxdigest");
    expect(onBreach).toHaveBeenCalledOnce();
  });

  // 3. selfCheckDisagreement detected
  it("detects selfCheckDisagreement when trader check disagrees with Narc recompute", async () => {
    // Build a decision where trader reported passed=true but Narc would compute passed=false
    const badDecision = DecisionRecordSchema.parse({
      recordId: "test:0",
      ts: Date.now(),
      agentId: "test-agent",
      tick: 0,
      observation: {
        pair: "SUI_USDC",
        midPrice: 1.0,
        signalInputs: {},
        priceFeedTs: Date.now(),
        stale: false,
        deepbookPoolId: "0xpool"
      },
      intent: overLimitIntent,       // this should FAIL
      reasoning: "test",
      mandateHash: hashMandate(sampleMandate),
      mandateCheck: {
        passed: true,                // trader INCORRECTLY reported passed
        checkedRules: [],
        loosenCheckEnabled: false
      },
      poolChecks: [],
      feeEstimate: {
        estimatedFeeBps: 10,
        feeAmountQuote: null,
        feeToken: null,
        source: "unavailable"
      },
      prevBlobId: null
    });

    const journal = makeMockJournal();
    const writeFinding = (r: FindingRecord) => journal.writeFinding(r);

    const result = await auditTick(
      {
        auditorId: "narc",
        agentId: "test-agent",
        tick: 1,
        mandate: sampleMandate,
        decisions: [badDecision],
        outcomes: [],
        narcPrevBlobId: null,
        traderPrevBlobId: null
      },
      { writeFinding }
    );

    // Narc recomputes: overLimitIntent fails → passed=false, trader said true → disagreement
    expect(result.finding.selfCheckDisagreement).toBe(true);
    expect(result.finding.verdict).toBe("BREACH");
  });

  // 4. Mandate hash mismatch → BREACH verdict
  it("returns BREACH on mandate hash mismatch", async () => {
    // Build a decision with the correct mandate hash
    const decision = makeDecision(validIntent, 0);

    // But pass a DIFFERENT mandate to the tick — so the stored hash won't match
    const alteredMandate: Mandate = {
      ...sampleMandate,
      maxNotionalQuote: 999  // different from what was hashed in the decision
    };

    const journal = makeMockJournal();
    const writeFinding = (r: FindingRecord) => journal.writeFinding(r);

    const result = await auditTick(
      {
        auditorId: "narc",
        agentId: "test-agent",
        tick: 1,
        mandate: alteredMandate,   // Narc uses the "current" mandate
        decisions: [decision],      // decision has hash of sampleMandate
        outcomes: [],
        narcPrevBlobId: null,
        traderPrevBlobId: null
      },
      { writeFinding }
    );

    expect(result.finding.verdict).toBe("BREACH");
  });

  // 5. Cumulative notional accumulates across multiple ticks
  it("accumulates cumulative notional from executed outcomes", async () => {
    // 4 decisions × sizeQuote=5 = cumulative=20 which is under limit=100
    const decisions = Array.from({ length: 4 }, (_, i) =>
      makeDecision(validIntent, i)
    );
    const outcomes = decisions.map((d) => makeOutcome(d, true));

    const journal = makeMockJournal();
    const writeFinding = (r: FindingRecord) => journal.writeFinding(r);

    const result = await auditTick(
      {
        auditorId: "narc",
        agentId: "test-agent",
        tick: 4,
        mandate: sampleMandate,
        decisions,
        outcomes,
        narcPrevBlobId: null,
        traderPrevBlobId: null
      },
      { writeFinding }
    );

    // With cumulative=20 and maxCumulativeNotionalQuote=100, should be PASS
    expect(result.finding.verdict).toBe("PASS");
  });

  // Cumulative that exceeds limit → BREACH
  it("breaches when cumulative notional exceeds mandate limit", async () => {
    // sampleMandate.maxCumulativeNotionalQuote = 100
    // 21 ticks × sizeQuote=5 = 105 > 100 → breach on last tick
    const decisions = Array.from({ length: 21 }, (_, i) =>
      makeDecision(validIntent, i)
    );
    const outcomes = decisions.map((d) => makeOutcome(d, true));

    const journal = makeMockJournal();
    const writeFinding = (r: FindingRecord) => journal.writeFinding(r);

    const result = await auditTick(
      {
        auditorId: "narc",
        agentId: "test-agent",
        tick: 21,
        mandate: sampleMandate,
        decisions,
        outcomes,
        narcPrevBlobId: null,
        traderPrevBlobId: null
      },
      { writeFinding }
    );

    expect(result.finding.verdict).toBe("BREACH");
  });

  // 6. FindingRecord output validates against FindingRecordSchema
  it("FindingRecord validates against FindingRecordSchema", async () => {
    const decisions = [makeDecision(validIntent, 0)];
    const journal = makeMockJournal();
    const writeFinding = (r: FindingRecord) => journal.writeFinding(r);

    const result = await auditTick(
      {
        auditorId: "narc",
        agentId: "test-agent",
        tick: 0,
        mandate: sampleMandate,
        decisions,
        outcomes: [],
        narcPrevBlobId: null,
        traderPrevBlobId: null
      },
      { writeFinding }
    );

    // Should not throw
    expect(() => FindingRecordSchema.parse(result.finding)).not.toThrow();
  });

  // Edge: no decisions → null-safe (returns PASS with placeholder)
  it("handles empty decisions gracefully (no decision records yet)", async () => {
    const journal = makeMockJournal();
    const writeFinding = (r: FindingRecord) => journal.writeFinding(r);

    const result = await auditTick(
      {
        auditorId: "narc",
        agentId: "test-agent",
        tick: 0,
        mandate: sampleMandate,
        decisions: [],
        outcomes: [],
        narcPrevBlobId: null,
        traderPrevBlobId: null
      },
      { writeFinding }
    );

    expect(result.finding.verdict).toBe("PASS");
    expect(result.finding.actionTaken).toBe("NONE");
  });

  // breach: onBreach not provided → actionTaken stays NONE even on breach
  it("keeps actionTaken NONE when no onBreach handler is provided (BREACH still recorded)", async () => {
    const decisions = [makeDecision(overLimitIntent, 0)];
    const journal = makeMockJournal();
    const writeFinding = (r: FindingRecord) => journal.writeFinding(r);

    const result = await auditTick(
      {
        auditorId: "narc",
        agentId: "test-agent",
        tick: 0,
        mandate: sampleMandate,
        decisions,
        outcomes: [],
        narcPrevBlobId: null,
        traderPrevBlobId: null
      },
      { writeFinding }
      // no onBreach
    );

    expect(result.finding.verdict).toBe("BREACH");
    expect(result.finding.actionTaken).toBe("NONE");
  });

  // narcPrevBlobId and traderPrevBlobId are stored in FindingRecord
  it("stores narcPrevBlobId and traderPrevBlobId in the FindingRecord", async () => {
    const decisions = [makeDecision(validIntent, 0, "prev:trader:blob")];
    const journal = makeMockJournal();
    const writeFinding = (r: FindingRecord) => journal.writeFinding(r);

    const result = await auditTick(
      {
        auditorId: "narc",
        agentId: "test-agent",
        tick: 1,
        mandate: sampleMandate,
        decisions,
        outcomes: [],
        narcPrevBlobId: "prev:narc:blob",
        traderPrevBlobId: "prev:trader:blob"
      },
      { writeFinding }
    );

    expect(result.finding.narcPrevBlobId).toBe("prev:narc:blob");
    expect(result.finding.traderPrevBlobId).toBe("prev:trader:blob");
  });
});
