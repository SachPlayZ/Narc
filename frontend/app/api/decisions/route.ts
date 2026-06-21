import { DecisionRecordSchema, loadRepoEnvFile } from "@narc/shared";
import { readJsonl } from "@/lib/journal";
import { supabase } from "@/lib/supabase";
import type { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

const repoEnv = loadRepoEnvFile(process.cwd());
const DEFAULT_AGENT_ID = process.env.NARC_AGENT_ID ?? repoEnv.NARC_AGENT_ID ?? "trader-a";

export async function GET(req: NextRequest) {
  const agentId = req.nextUrl.searchParams.get("agentId") ?? DEFAULT_AGENT_ID;
  if (supabase) {
    const { data, error } = await supabase
      .from("narc_decisions")
      .select("data")
      .eq("agent_id", agentId)
      .order("ts", { ascending: true });
    if (!error && data) {
      const records = data.flatMap((row) => {
        try { return [DecisionRecordSchema.parse(row.data)]; } catch { return []; }
      });
      return Response.json({ records, count: records.length });
    }
  }
  const records = readJsonl(`${agentId}-decisions.jsonl`, DecisionRecordSchema);
  return Response.json({ records, count: records.length });
}
