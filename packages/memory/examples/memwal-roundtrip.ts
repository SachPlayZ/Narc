/**
 * memwal-roundtrip.ts — live round-trip demo for MemWal-backed NarcJournal.
 *
 * Requires a real MemWal relayer and valid env vars:
 *   NARC_PRIVATE_KEY, MEMWAL_ACCOUNT_ID, MEMWAL_DELEGATE_KEY,
 *   MEMWAL_RELAYER_URL (optional, defaults to https://relayer.memwal.ai)
 *
 * Run:
 *   pnpm --filter @narc/memory tsx examples/memwal-roundtrip.ts
 */

import { loadBSideEnv } from "@narc/shared";
import { createJournal, checkMemWalHealth } from "../src/index.js";
import type { DecisionRecord, FindingRecord } from "@narc/shared";

async function main() {
  const env = loadBSideEnv();
  console.log("[memwal-roundtrip] Network:", env.SUI_NETWORK);

  // 1. Health check
  const health = await checkMemWalHealth(env);
  if (!health.ok) {
    console.error("[memwal-roundtrip] MemWal health check failed:", health.error);
    console.warn("[memwal-roundtrip] Falling back to LocalFallbackJournal");
  } else {
    console.log(
      "[memwal-roundtrip] MemWal healthy — status:",
      health.status,
      "version:",
      health.version
    );
  }

  // 2. Create journal (factory picks MemWal or local based on env)
  const journal = createJournal(env);
  console.log("[memwal-roundtrip] Journal type:", journal.constructor.name);

  // 3. Write a decision record
  const now = Date.now();
  const decision: DecisionRecord = {
    recordId: `rec-roundtrip-${now}`,
    ts: now,
    agentId: env.NARC_AGENT_ID,
    tick: 0,
    observation: {
      pair: "SUI-USDC",
      midPrice: 1.5,
      signalInputs: { source: "roundtrip-test" },
      priceFeedTs: now,
      stale: false,
      deepbookPoolId: "0xdemo-pool"
    },
    intent: { side: "bid", pair: "SUI-USDC", sizeQuote: 5, limitPrice: 1.5 },
    reasoning: "Round-trip test — not a real trade",
    mandateHash: "demo-hash",
    mandateCheck: { passed: true, checkedRules: [], loosenCheckEnabled: false },
    poolChecks: [],
    feeEstimate: {
      estimatedFeeBps: 10,
      feeAmountQuote: null,
      feeToken: null,
      source: "unavailable"
    },
    prevBlobId: null
  };

  console.log("[memwal-roundtrip] Writing decision...");
  const decisionBlobId = await journal.writeDecision(decision);
  console.log("[memwal-roundtrip] Decision blob id:", decisionBlobId);

  // 4. Write a finding record
  const finding: FindingRecord = {
    findingId: `find-roundtrip-${now}`,
    ts: now,
    auditorId: env.NARC_AUDITOR_ID,
    tick: 0,
    reviewedDecisionBlobId: decisionBlobId,
    reviewedOutcomeBlobId: null,
    verdict: "PASS",
    riskScore: { score: 5, verdict: "PASS", triggeredRules: [] },
    triggeredRules: [],
    explanation: "Round-trip test finding",
    actionTaken: "NONE",
    pauseTxDigest: null,
    pauseTxExplorer: null,
    pauseReasonBlobId: null,
    narcPrevBlobId: null,
    traderPrevBlobId: null,
    selfCheckDisagreement: false,
    auditorVersion: "0.1.0",
    model: env.GROQ_MODEL
  };

  console.log("[memwal-roundtrip] Writing finding...");
  const findingBlobId = await journal.writeFinding(finding);
  console.log("[memwal-roundtrip] Finding blob id:", findingBlobId);

  // 5. Read all decisions back
  // NOTE: readAllDecisions uses recall() not restore() — see BLOCKERS.md B1-001
  console.log("[memwal-roundtrip] Reading all decisions...");
  const decisions = await journal.readAllDecisions(env.NARC_AGENT_ID);
  console.log(
    `[memwal-roundtrip] Found ${decisions.length} decision(s). Latest recordId:`,
    decisions[decisions.length - 1]?.recordId
  );

  // 6. Read all findings back
  console.log("[memwal-roundtrip] Reading all findings...");
  const findings = await journal.readAllFindings(env.NARC_AUDITOR_ID);
  console.log(
    `[memwal-roundtrip] Found ${findings.length} finding(s). Latest findingId:`,
    findings[findings.length - 1]?.findingId
  );

  console.log("[memwal-roundtrip] Done.");
}

main().catch((err) => {
  console.error("[memwal-roundtrip] Fatal:", err);
  process.exit(1);
});
