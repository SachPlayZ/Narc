/**
 * run-narc.ts — live Narc auditor loop.
 *
 * Usage:
 *   corepack pnpm --filter @narc/auditor narc:run
 *
 * Requires a populated .env in the repo root with at minimum:
 *   NARC_PRIVATE_KEY, SUI_NETWORK=testnet,
 *   NARC_POLICY_PACKAGE_ID, AGENT_POLICY_OBJECT_ID, GUARDIAN_CAP_ID
 *
 * Optional (for MemWal):
 *   MEMWAL_RELAYER_URL, MEMWAL_ACCOUNT_ID, MEMWAL_DELEGATE_KEY
 *
 * Without MemWal credentials, falls back to local JSONL files.
 */

import { join } from "node:path";
import { createMandateArtifact, loadBSideEnv, readMandateArtifact, sampleMandate } from "@narc/shared";
import { NarcAuditor } from "../src/auditor.js";

async function main() {
  const env = loadBSideEnv();

  console.error("[Narc] Environment loaded.");
  console.error(`[Narc] Network: ${env.SUI_NETWORK}`);
  console.error(`[Narc] Watching agent: ${env.NARC_AGENT_ID}`);
  console.error(`[Narc] Auditor id:     ${env.NARC_AUDITOR_ID}`);
  console.error(
    `[Narc] Policy pkg:    ${env.NARC_POLICY_PACKAGE_ID ?? "(not set — pause disabled)"}`
  );
  console.error(
    `[Narc] Guardian cap:  ${env.GUARDIAN_CAP_ID ?? "(not set — pause disabled)"}`
  );

  // Reload mandate from file on each tick so the Narc always uses the mandate
  // that the trader wrote for the current session (prices change between runs).
  const mandatePath = join(env.LOCAL_ACTIVITY_DIR, "trader-a-mandate.json");
  let cachedArtifact = createMandateArtifact(sampleMandate, 1);

  function loadMandate() {
    const parsed = readMandateArtifact(mandatePath);
    if (!parsed) return cachedArtifact;
    cachedArtifact = parsed;
    return parsed;
  }

  // Log initial mandate state
  const initialMandate = loadMandate();
  if (initialMandate.mandate.mandateId === "demo-mandate") {
    console.error(`[Narc] No mandate file at ${mandatePath} — using sampleMandate (run a:flow first)`);
  } else {
    console.error(`[Narc] Loaded live mandate from ${mandatePath} (reloads each tick)`);
  }

  const auditor = new NarcAuditor(env, loadMandate);

  // Graceful shutdown
  let stopping = false;
  async function shutdown() {
    if (stopping) return;
    stopping = true;
    console.error("\n[Narc] Shutting down...");
    await auditor.stop();
    process.exit(0);
  }

  process.on("SIGINT", () => { void shutdown(); });
  process.on("SIGTERM", () => { void shutdown(); });

  // 30s interval matches the trader loop cadence and keeps MemWal request rate
  // well under the 500 weighted-requests/hour account limit.
  await auditor.start(30_000);
}

main().catch((err) => {
  console.error("[Narc] Fatal error:", err);
  process.exit(1);
});
