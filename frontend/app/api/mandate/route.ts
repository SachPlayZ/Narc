import { createMandateArtifact, MandateArtifactSchema, MandateSchema } from "@narc/shared";
import { supabase } from "@/lib/supabase";

export const dynamic = "force-dynamic";

const AGENT_ID = process.env.NARC_AGENT_ID ?? "trader-a";

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

    const artifact = createMandateArtifact(mandate);

    if (supabase) {
      const { error } = await supabase.from("narc_mandates").upsert({
        agent_id: AGENT_ID,
        ts: artifact.writtenAt,
        data: artifact,
      });
      if (error) {
        console.error("[mandate POST] supabase upsert failed:", error);
      }
    }

    // On-chain mandate hash update — only available when running locally with pnpm/tsx
    let onChainTx: { digest: string; explorer: string } | null = null;
    if (process.env.NARC_POLICY_PACKAGE_ID && process.env.OWNER_CAP_ID && !process.env.VERCEL) {
      try {
        const { execFile } = await import("node:child_process");
        const { promisify } = await import("node:util");
        const { resolve } = await import("node:path");
        const execFileAsync = promisify(execFile);
        const root = resolve(process.cwd(), "..");
        const { stdout } = await execFileAsync(
          "pnpm",
          ["--filter", "@narc/trader", "exec", "tsx", "scripts/set-mandate-hash.ts", `0x${artifact.mandateHash}`],
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
  if (supabase) {
    const { data, error } = await supabase
      .from("narc_mandates")
      .select("data")
      .eq("agent_id", AGENT_ID)
      .single();
    if (!error && data) {
      try {
        const artifact = MandateArtifactSchema.parse(data.data);
        return Response.json({ artifact, exists: true });
      } catch {
        // fall through
      }
    }
  }
  return Response.json({ artifact: null, exists: false });
}
