import { mkdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { createClient } from "@supabase/supabase-js";
import { createMandateArtifact, MandateSchema, type MandateArtifact, writeMandateArtifact, readMandateArtifact } from "@narc/shared";

const repoRoot = resolve(new URL("../../..", import.meta.url).pathname);
const activityDir = resolve(repoRoot, process.env.LOCAL_ACTIVITY_DIR ?? ".narc/activity");
const mandatePath = join(activityDir, "trader-a-mandate.json");

const AGENT_ID = process.env.NARC_AGENT_ID ?? "trader-a";

function supabase() {
  const url = process.env.SUPABASE_URL ?? "";
  const key = process.env.SUPABASE_SERVICE_KEY ?? "";
  return url && key ? createClient(url, key) : null;
}

export function readMandate(): MandateArtifact | null {
  return readMandateArtifact(mandatePath);
}

export async function writeMandate(body: unknown): Promise<MandateArtifact> {
  const {
    maxNotionalQuote,
    maxCumulativeNotionalQuote,
    allowedPairs,
    allowedSide,
    maxSlippageBps,
    expiresInHours,
  } = body as Record<string, unknown>;

  const mandate = MandateSchema.parse({
    mandateId: "user-mandate-v1",
    maxNotionalQuote,
    maxCumulativeNotionalQuote,
    allowedPairs,
    allowedSide: allowedSide ?? undefined,
    maxSlippageBps,
    expiresAt: Date.now() + (expiresInHours as number) * 60 * 60 * 1000,
    venue: "deepbook",
    minOrderSizeQuote: 0.003,
    lotSizeQuote: 0.001,
    tickSize: 0.001,
    expectedPoolId: "0x1c19362ca52b8ffd7a33cee805a67d40f31e6ba303753fd3a4cfdfacea7163a5",
    rules: [
      { id: "max_notional", description: "Single order must stay under quote notional.", severity: "BREACH" },
      { id: "pair_allowed", description: "Only the configured DeepBook pair may be traded.", severity: "BREACH" },
    ],
  });

  mkdirSync(activityDir, { recursive: true });
  const artifact = writeMandateArtifact(mandatePath, mandate);

  const db = supabase();
  if (db) {
    await db.from("narc_mandates").upsert({ agent_id: AGENT_ID, ts: artifact.writtenAt, data: artifact });
  }

  return artifact;
}
