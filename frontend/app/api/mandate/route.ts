import { readMandateArtifact, writeMandateArtifact, MandateSchema } from "@narc/shared";
import { existsSync, mkdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export const dynamic = "force-dynamic";

function activityDir(): string {
  const configured = process.env.LOCAL_ACTIVITY_DIR;
  const cwd = /*turbopackIgnore: true*/ process.cwd();
  if (configured) {
    return resolve(cwd, "..", configured);
  }
  return resolve(cwd, "../.narc/activity");
}

function repoRoot(): string {
  const cwd = /*turbopackIgnore: true*/ process.cwd();
  return resolve(cwd, "..");
}

export async function POST(request: Request) {
  try {
    const body = await request.json();

    const {
      maxNotionalQuote,
      maxCumulativeNotionalQuote,
      allowedPairs,
      allowedSide,
      maxSlippageBps,
      expiresInHours,
    } = body;

    if (
      typeof maxNotionalQuote !== "number" ||
      typeof maxCumulativeNotionalQuote !== "number" ||
      !Array.isArray(allowedPairs) ||
      typeof maxSlippageBps !== "number" ||
      typeof expiresInHours !== "number"
    ) {
      return Response.json({ error: "Invalid or missing fields" }, { status: 400 });
    }

    const mandate = MandateSchema.parse({
      mandateId: "user-mandate-v1",
      maxNotionalQuote,
      maxCumulativeNotionalQuote,
      allowedPairs,
      allowedSide: allowedSide ?? undefined,
      maxSlippageBps,
      expiresAt: Date.now() + expiresInHours * 60 * 60 * 1000,
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

    const dir = activityDir();
    mkdirSync(dir, { recursive: true });
    const path = join(dir, "trader-a-mandate.json");
    const artifact = writeMandateArtifact(path, mandate);

    let onChainTx: { digest: string; explorer: string } | null = null;
    if (process.env.NARC_POLICY_PACKAGE_ID && process.env.OWNER_CAP_ID) {
      try {
        const root = repoRoot();
        const { stdout } = await execFileAsync(
          "pnpm",
          [
            "--filter", "@narc/trader",
            "exec", "tsx", "scripts/set-mandate-hash.ts",
            `0x${artifact.mandateHash}`,
          ],
          { cwd: root, env: process.env, timeout: 30_000 }
        );
        onChainTx = JSON.parse(stdout.trim());
      } catch (err) {
        console.error("[mandate POST] set-mandate-hash failed:", err);
        onChainTx = null;
      }
    }

    return Response.json({ artifact, onChainTx });
  } catch (err) {
    return Response.json({ error: String(err) }, { status: 500 });
  }
}

export async function GET() {
  const path = join(activityDir(), "trader-a-mandate.json");
  if (!existsSync(path)) {
    return Response.json({ artifact: null, exists: false });
  }

  const artifact = readMandateArtifact(path);
  return Response.json({ artifact, exists: Boolean(artifact) });
}
