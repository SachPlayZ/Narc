import { buildRuntimeMandate, readMarketSnapshot } from "../src/agent/index.js";
import { createLocalJournal, runASideTick } from "../src/activity/index.js";

const loosenCheck = process.argv.includes("--loosen-check");
const breach = process.argv.includes("--breach");
const market = await readMarketSnapshot();
const mandate = buildRuntimeMandate(market, {
  allowedSide: "ask",
  maxNotionalQuote: Number(market.midPrice.toFixed(6))
});

const result = await runASideTick({
  agentId: "trader-a",
  tick: Number(process.env.TICK ?? "0"),
  mandate,
  market,
  journal: createLocalJournal(process.env.LOCAL_ACTIVITY_DIR ?? ".narc/activity"),
  loosenCheck,
  breach,
  prevDecisionBlobId: null,
  prevOutcomeBlobId: null
});

console.log(JSON.stringify(result, null, 2));
