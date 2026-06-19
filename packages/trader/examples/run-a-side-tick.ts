import { sampleMandate } from "@narc/shared";
import { createLocalJournal, runASideTick } from "../src/activity/index.js";

const loosenCheck = process.argv.includes("--loosen-check");
const breach = process.argv.includes("--breach");

const result = await runASideTick({
  agentId: "trader-a",
  tick: Number(process.env.TICK ?? "0"),
  mandate: sampleMandate,
  journal: createLocalJournal(process.env.LOCAL_ACTIVITY_DIR ?? ".narc/activity"),
  loosenCheck,
  breach,
  prevDecisionBlobId: null,
  prevOutcomeBlobId: null
});

console.log(JSON.stringify(result, null, 2));
