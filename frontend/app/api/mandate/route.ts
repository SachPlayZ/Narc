import { createMandateArtifact, MandateArtifactSchema, MandateSchema } from "@narc/shared";
import { supabase } from "@/lib/supabase";
import { proxyToAgent } from "@/lib/agent-proxy";

export const dynamic = "force-dynamic";

const AGENT_ID = process.env.NARC_AGENT_ID ?? "trader-a";

export async function POST(request: Request) {
  try {
    const body = await request.json();

    // When agent server is configured, it handles disk write + Supabase sync
    const proxy = await proxyToAgent("/mandate", "POST", body);
    if (proxy) return new Response(proxy.body, { status: proxy.status, headers: { "Content-Type": "application/json" } });

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
      if (error) console.error("[mandate POST] supabase upsert failed:", error);
    }

    return Response.json({ artifact, onChainTx: null });
  } catch (err) {
    return Response.json({ error: String(err) }, { status: 500 });
  }
}

export async function GET() {
  // Prefer Supabase for reads (works from both Vercel and local)
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

  // Local fallback: ask the agent server
  const proxy = await proxyToAgent("/mandate", "GET");
  if (proxy) return new Response(proxy.body, { status: proxy.status, headers: { "Content-Type": "application/json" } });

  return Response.json({ artifact: null, exists: false });
}
