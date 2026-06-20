import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { mkdtemp, rm, appendFile, mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import { LocalFallbackJournal } from "../src/localJournal.js";
import type { DecisionRecord, OutcomeRecord, FindingRecord } from "@narc/shared";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeDecisionRecord(overrides?: Partial<DecisionRecord>): DecisionRecord {
  return {
    recordId: "rec-001",
    ts: 1700000000000,
    agentId: "trader-a",
    tick: 1,
    observation: {
      pair: "SUI-USDC",
      midPrice: 1.5,
      signalInputs: { rsi: 45 },
      priceFeedTs: 1700000000000,
      stale: false,
      deepbookPoolId: "0xpool"
    },
    intent: {
      side: "bid",
      pair: "SUI-USDC",
      sizeQuote: 10,
      limitPrice: 1.5
    },
    reasoning: "Momentum signal",
    mandateHash: "abc123",
    mandateCheck: {
      passed: true,
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
    prevBlobId: null,
    ...overrides
  };
}

function makeOutcomeRecord(overrides?: Partial<OutcomeRecord>): OutcomeRecord {
  return {
    recordId: "out-001",
    ts: 1700000001000,
    agentId: "trader-a",
    tick: 1,
    decisionRecordId: "rec-001",
    decisionBlobId: null,
    status: "EXECUTED",
    executed: true,
    txDigest: "0xdigest",
    prevBlobId: null,
    ...overrides
  };
}

function makeFindingRecord(overrides?: Partial<FindingRecord>): FindingRecord {
  return {
    findingId: "find-001",
    ts: 1700000002000,
    auditorId: "narc",
    tick: 1,
    reviewedDecisionBlobId: "blob-001",
    reviewedOutcomeBlobId: null,
    verdict: "PASS",
    riskScore: {
      score: 10,
      verdict: "PASS",
      triggeredRules: []
    },
    triggeredRules: [],
    explanation: "All good",
    actionTaken: "NONE",
    pauseTxDigest: null,
    pauseTxExplorer: null,
    pauseReasonBlobId: null,
    narcPrevBlobId: null,
    traderPrevBlobId: null,
    selfCheckDisagreement: false,
    auditorVersion: "0.1.0",
    model: "test-model",
    ...overrides
  };
}

// ---------------------------------------------------------------------------
// LocalFallbackJournal tests
// ---------------------------------------------------------------------------

describe("LocalFallbackJournal", () => {
  let tmpDir: string;
  let journal: LocalFallbackJournal;

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), "narc-memory-test-"));
    journal = new LocalFallbackJournal(tmpDir);
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  // Test 1: writeDecision writes valid JSON line and returns local: prefixed id
  it("writeDecision writes a JSONL line and returns local:-prefixed blob id", async () => {
    const record = makeDecisionRecord();
    const id = await journal.writeDecision(record);

    expect(id).toMatch(/^local:/);
    expect(id).toContain("rec-001");
    expect(id).toContain("trader-a-decisions.jsonl");
  });

  // Test 2: readAllDecisions parses and validates records
  it("readAllDecisions returns parsed and validated DecisionRecords", async () => {
    const r1 = makeDecisionRecord({ recordId: "rec-001" });
    const r2 = makeDecisionRecord({ recordId: "rec-002", tick: 2 });

    await journal.writeDecision(r1);
    await journal.writeDecision(r2);

    const all = await journal.readAllDecisions("trader-a");
    expect(all).toHaveLength(2);
    expect(all[0].recordId).toBe("rec-001");
    expect(all[1].recordId).toBe("rec-002");
  });

  // Test 3: writeFinding writes FindingRecord correctly
  it("writeFinding writes a FindingRecord and returns local:-prefixed blob id", async () => {
    const record = makeFindingRecord();
    const id = await journal.writeFinding(record);

    expect(id).toMatch(/^local:/);
    expect(id).toContain("find-001");
    expect(id).toContain("narc-findings.jsonl");

    const all = await journal.readAllFindings("narc");
    expect(all).toHaveLength(1);
    expect(all[0].findingId).toBe("find-001");
    expect(all[0].verdict).toBe("PASS");
    expect(all[0].auditorId).toBe("narc");
  });

  // Test 4 (per spec): writeOutcome + readAllOutcomes roundtrip
  it("writeOutcome and readAllOutcomes round-trip correctly", async () => {
    const record = makeOutcomeRecord();
    const id = await journal.writeOutcome(record);

    expect(id).toMatch(/^local:/);
    expect(id).toContain("out-001");

    const all = await journal.readAllOutcomes("trader-a");
    expect(all).toHaveLength(1);
    expect(all[0].status).toBe("EXECUTED");
    expect(all[0].txDigest).toBe("0xdigest");
  });

  // Test 5: Schema validation — invalid record throws ZodError on read
  it("readAllDecisions throws ZodError when a stored record is invalid", async () => {
    const path = join(tmpDir, "trader-a-decisions.jsonl");
    await mkdir(dirname(path), { recursive: true });
    // Write a JSON line that is missing required fields
    await appendFile(path, `{"recordId":"bad","ts":12345}\n`, "utf8");

    await expect(journal.readAllDecisions("trader-a")).rejects.toThrow();
  });

  // Test 6: readAllDecisions returns empty array when file does not exist
  it("readAllDecisions returns empty array when no file exists yet", async () => {
    const all = await journal.readAllDecisions("no-such-agent");
    expect(all).toEqual([]);
  });

  // Test 7: readAllFindings returns empty array when file does not exist
  it("readAllFindings returns empty array when no file exists yet", async () => {
    const all = await journal.readAllFindings("no-such-auditor");
    expect(all).toEqual([]);
  });

  // Test 8: multiple agents are isolated
  it("decisions for different agentIds are stored separately", async () => {
    const ra = makeDecisionRecord({ agentId: "agent-alpha", recordId: "a-001" });
    const rb = makeDecisionRecord({ agentId: "agent-beta", recordId: "b-001" });

    await journal.writeDecision(ra);
    await journal.writeDecision(rb);

    const alpha = await journal.readAllDecisions("agent-alpha");
    const beta = await journal.readAllDecisions("agent-beta");

    expect(alpha).toHaveLength(1);
    expect(alpha[0].recordId).toBe("a-001");
    expect(beta).toHaveLength(1);
    expect(beta[0].recordId).toBe("b-001");
  });
});

// ---------------------------------------------------------------------------
// MemWalJournal constructor — verifies init config is correct
// ---------------------------------------------------------------------------

describe("MemWalJournal", () => {
  // Test (per spec): constructor captures the correct MemWal config options
  // We verify _initOpts (exposed for testing) rather than mocking the dynamic import,
  // because vi.mock with dynamic imports in ESM requires complex setup.
  // The key assertion: the config passed to MemWal.create does NOT include suiNetwork
  // (MemWalConfig v0.0.7 does not have that field — documented in BLOCKERS.md).
  it("constructor captures correct MemWal config options (key, accountId, serverUrl)", async () => {
    // Mock @mysten-incubation/memwal to avoid real network calls
    vi.mock("@mysten-incubation/memwal", () => ({
      MemWal: {
        create: vi.fn(() => ({
          rememberAndWait: vi.fn(),
          recall: vi.fn(),
          health: vi.fn()
        }))
      }
    }));

    const { MemWalJournal } = await import("../src/memwalJournal.js");

    const fakeEnv = {
      SUI_NETWORK: "testnet" as const,
      NARC_PRIVATE_KEY: "dummy-key",
      NARC_AGENT_ID: "trader-a",
      NARC_AUDITOR_ID: "narc",
      MEMWAL_ACCOUNT_ID: "acc-123",
      MEMWAL_DELEGATE_KEY: "del-key-456",
      MEMWAL_RELAYER_URL: "http://localhost:8000",
      GROQ_MODEL: "qwen/qwen3-32b",
      LOCAL_ACTIVITY_DIR: ".narc/activity"
    };

    const journal = new MemWalJournal(fakeEnv);

    // Verify the config captured in _initOpts
    expect(journal._initOpts.key).toBe("del-key-456");
    expect(journal._initOpts.accountId).toBe("acc-123");
    expect(journal._initOpts.serverUrl).toBe("http://localhost:8000");
    // suiNetwork must NOT be set (not in MemWalConfig v0.0.7 for delegate-key client)
    expect((journal._initOpts as unknown as Record<string, unknown>).suiNetwork).toBeUndefined();
  });
});
