import { createMandateArtifact, MandateArtifactSchema, MandateSchema } from "@narc/shared";
import { supabase } from "@/lib/supabase";
import type { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

const DEFAULT_AGENT_ID = process.env.NARC_AGENT_ID ?? "trader-a";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    const {
      agentId,
      maxNotionalQuote,
      maxCumulativeNotionalQuote,
      allowedPairs,
      allowedSide,
      maxSlippageBps,
      expiresInHours,
    } = body;

    const resolvedAgentId: string = agentId ?? DEFAULT_AGENT_ID;

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

    if (!supabase) {
      return Response.json({ error: "Supabase not configured" }, { status: 503 });
    }

    const { error } = await supabase.from("narc_mandates").upsert({
      agent_id: resolvedAgentId,
      ts: artifact.writtenAt,
      data: artifact,
    });
    if (error) throw new Error(error.message);

    return Response.json({ artifact, onChainTx: null });
  } catch (err) {
    return Response.json({ error: String(err) }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  const agentId = request.nextUrl.searchParams.get("agentId") ?? DEFAULT_AGENT_ID;

  if (!supabase) {
    return Response.json({ artifact: null, exists: false });
  }

  const { data, error } = await supabase
    .from("narc_mandates")
    .select("data")
    .eq("agent_id", agentId)
    .single();

  if (error || !data) return Response.json({ artifact: null, exists: false });

  try {
    const artifact = MandateArtifactSchema.parse(data.data);
    return Response.json({ artifact, exists: true });
  } catch {
    return Response.json({ artifact: null, exists: false });
  }
}
