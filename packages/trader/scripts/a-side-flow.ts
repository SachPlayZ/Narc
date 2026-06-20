import { explorerTxUrl } from "../src/policy/admin.js";
import { cancelOpenOrders } from "../src/execution/index.js";
import { createLocalJournal, runASideTick } from "../src/activity/index.js";
import { buildRuntimeMandate, readMarketSnapshot } from "../src/agent/index.js";
import { pausePolicy, readPolicyState, resumePolicy, setPolicyMandateHash, waitForPolicyMandateHash, waitForPolicyPauseState } from "../src/policy/index.js";
import { createJournal } from "@narc/memory";
import { loadASideEnv, loadBSideEnv, writeMandateArtifact } from "@narc/shared";
import { join } from "node:path";

const env = loadASideEnv();
const benv = loadBSideEnv();
// Use MemWal when credentials present; falls back to local JSONL automatically.
const journal = createJournal(benv);
const tickBase = Number(process.env.TICK ?? "0");
const mode = process.argv[2] === "pause-demo" ? "pause-demo" : "once";
const loosenCheck = process.argv.includes("--loosen-check");
const breach = process.argv.includes("--breach");
const cleanup = !process.argv.includes("--no-cleanup");

const market = await readMarketSnapshot(env);
const mandate = buildRuntimeMandate(market, {
  allowedSide: "ask",
  maxNotionalQuote: Number(market.midPrice.toFixed(6))
});
const mandateArtifact = writeMandateArtifact(join(env.LOCAL_ACTIVITY_DIR, "trader-a-mandate.json"), mandate);
const policyHashUpdate = await syncPolicyMandateHash();

if (mode === "pause-demo") {
  console.log(JSON.stringify(await runPauseDemo(), null, 2));
} else {
  console.log(JSON.stringify(await runOnce(), null, 2));
}

async function runOnce() {
  const before = await readPolicyState(env);
  const tick = await executeTick({
    tick: tickBase,
    prevDecisionBlobId: null,
    prevOutcomeBlobId: null,
    breach
  });
  const after = await readPolicyState(env);
  const cleanupResult = cleanup && tick.result.outcome.executed && env.DEEPBOOK_BALANCE_MANAGER_ID
    ? await cancelOpenOrders(env.DEEPBOOK_BALANCE_MANAGER_ID, env)
    : null;

  return {
    mode,
    market,
    mandate,
    mandateArtifact,
    policyHashUpdate,
    policyBefore: before,
    tick,
    policyAfter: after,
    cleanup: cleanupResult
  };
}

async function runPauseDemo() {
  const before = await readPolicyState(env);
  const first = await executeTick({
    tick: tickBase,
    prevDecisionBlobId: null,
    prevOutcomeBlobId: null
  });
  const afterFirstCleanup = first.result.outcome.executed && env.DEEPBOOK_BALANCE_MANAGER_ID
    ? await cancelOpenOrders(env.DEEPBOOK_BALANCE_MANAGER_ID, env)
    : null;
  const pause = await pausePolicy("a-side-flow-pause", env);
  const pausedState = await waitForPolicyPauseState(true, env);
  const blocked = await executeTick({
    tick: tickBase + 1,
    prevDecisionBlobId: first.result.decisionBlobId,
    prevOutcomeBlobId: first.result.outcomeBlobId
  });
  const resume = await resumePolicy("a-side-flow-resume", env);
  const resumedState = await waitForPolicyPauseState(false, env);
  const third = await executeTick({
    tick: tickBase + 2,
    prevDecisionBlobId: blocked.result.decisionBlobId,
    prevOutcomeBlobId: blocked.result.outcomeBlobId
  });
  const cleanupResult = cleanup && env.DEEPBOOK_BALANCE_MANAGER_ID
    ? await cancelOpenOrders(env.DEEPBOOK_BALANCE_MANAGER_ID, env)
    : null;

  return {
    mode,
    market,
    mandate,
    mandateArtifact,
    policyHashUpdate,
    policyBefore: before,
    steps: {
      first,
      afterFirstCleanup,
      pause,
      pausedState,
      blocked,
      resume,
      resumedState,
      third
    },
    cleanup: cleanupResult
  };
}

async function syncPolicyMandateHash() {
  const before = await readPolicyState(env);
  const expected = `0x${mandateArtifact.mandateHash}`;
  if (before.mandateHashHex.toLowerCase() === expected.toLowerCase()) {
    return {
      alreadyMatched: true,
      state: before
    };
  }

  const tx = await setPolicyMandateHash(mandateArtifact.mandateHash, env);
  const state = await waitForPolicyMandateHash(mandateArtifact.mandateHash, env);
  return {
    alreadyMatched: false,
    tx,
    state
  };
}

async function executeTick(input: {
  tick: number;
  prevDecisionBlobId: string | null;
  prevOutcomeBlobId: string | null;
  breach?: boolean;
}) {
  const result = await runASideTick({
    agentId: "trader-a",
    tick: input.tick,
    mandate,
    market,
    journal,
    loosenCheck,
    breach: input.breach,
    prevDecisionBlobId: input.prevDecisionBlobId,
    prevOutcomeBlobId: input.prevOutcomeBlobId
  });

  return {
    result,
    txExplorer: result.outcome.txDigest ? explorerTxUrl(result.outcome.txDigest) : null
  };
}
