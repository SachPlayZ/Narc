import { join } from "node:path";
import {
  loadASideEnv,
  loadBSideEnv,
  MandateArtifactSchema,
  readMandateArtifact,
  sampleMandate,
} from "@narc/shared";
import { buildRuntimeMandate, readMarketSnapshot } from "../src/agent/index.js";
import { createLocalJournal, runASideTick } from "../src/activity/index.js";
import { cancelOpenOrders } from "../src/execution/index.js";
import { createJournal } from "@narc/memory";
import { createClient } from "@supabase/supabase-js";

const env = loadASideEnv();
const benv = loadBSideEnv();
const journal = createJournal(benv);
const localJournal = createLocalJournal(env.LOCAL_ACTIVITY_DIR);

const intervalMs = (() => {
  const idx = process.argv.indexOf("--tick-interval");
  return idx !== -1 ? Number(process.argv[idx + 1]) : 30_000;
})();

let tick = 0;
let prevDecisionBlobId: string | null = null;
let prevOutcomeBlobId: string | null = null;
let stopping = false;

const supabaseClient = (() => {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_KEY;
  return url && key ? createClient(url, key) : null;
})();

const AGENT_ID = process.env.NARC_AGENT_ID ?? "trader-a";

async function loadMandate() {
  if (supabaseClient) {
    const { data, error } = await supabaseClient
      .from("narc_mandates")
      .select("data")
      .eq("agent_id", AGENT_ID)
      .single();
    if (!error && data) {
      try {
        return MandateArtifactSchema.parse(data.data).mandate;
      } catch {
        // fall through to disk
      }
    }
  }
  const path = join(env.LOCAL_ACTIVITY_DIR, "trader-a-mandate.json");
  const artifact = readMandateArtifact(path);
  return artifact ? artifact.mandate : sampleMandate;
}

process.on("SIGTERM", () => {
  stopping = true;
});
process.on("SIGINT", () => {
  stopping = true;
});

async function runLoop() {
  while (!stopping) {
    const market = await readMarketSnapshot(env);
    const mandate = await loadMandate();

    try {
      const result = await runASideTick({
        agentId: "trader-a",
        tick,
        mandate,
        market,
        journal,
        loosenCheck: false,
        prevDecisionBlobId,
        prevOutcomeBlobId,
      });
      prevDecisionBlobId = result.decisionBlobId;
      prevOutcomeBlobId = result.outcomeBlobId;

      if (result.outcome.executed && env.DEEPBOOK_BALANCE_MANAGER_ID) {
        await cancelOpenOrders(env.DEEPBOOK_BALANCE_MANAGER_ID, env).catch(() => {});
      }
    } catch (err) {
      console.error(`[trader-loop] tick ${tick} error:`, err);
    }

    tick++;
    await new Promise<void>((r) => setTimeout(r, intervalMs));
  }

  console.error("[trader-loop] stopped.");
  process.exit(0);
}

runLoop().catch((err) => {
  console.error("[trader-loop] fatal:", err);
  process.exit(1);
});
