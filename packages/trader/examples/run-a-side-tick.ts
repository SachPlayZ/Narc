import { buildRuntimeMandate, readMarketSnapshot } from "../src/agent/index.js";
import { createLocalJournal, runASideTick } from "../src/activity/index.js";
import { setPolicyMandateHash, waitForPolicyMandateHash } from "../src/policy/index.js";
import { loadASideEnv, writeMandateArtifact } from "@narc/shared";
import { join } from "node:path";

const loosenCheck = process.argv.includes("--loosen-check");
const breach = process.argv.includes("--breach");
const env = loadASideEnv();
const market = await readMarketSnapshot(env);
const mandate = buildRuntimeMandate(market, {
  allowedSide: "ask",
  maxNotionalQuote: Number(market.midPrice.toFixed(6))
});
const artifact = writeMandateArtifact(join(env.LOCAL_ACTIVITY_DIR, "trader-a-mandate.json"), mandate);
await setPolicyMandateHash(artifact.mandateHash, env);
await waitForPolicyMandateHash(artifact.mandateHash, env);

const result = await runASideTick({
  agentId: "trader-a",
  tick: Number(process.env.TICK ?? "0"),
  mandate,
  market,
  journal: createLocalJournal(env.LOCAL_ACTIVITY_DIR),
  loosenCheck,
  breach,
  prevDecisionBlobId: null,
  prevOutcomeBlobId: null
});

console.log(JSON.stringify(result, null, 2));
