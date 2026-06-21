import { FindingRecordSchema, loadRepoEnvFile } from "@narc/shared";
import { readJsonl } from "@/lib/journal";
import { supabase } from "@/lib/supabase";
import type { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

const repoEnv = loadRepoEnvFile(process.cwd());
const DEFAULT_AUDITOR_ID = process.env.NARC_AUDITOR_ID ?? repoEnv.NARC_AUDITOR_ID ?? "narc";

export async function GET(req: NextRequest) {
  // When a wallet agentId is passed, the auditor runs with that same address as its ID.
  const auditorId = req.nextUrl.searchParams.get("agentId") ?? DEFAULT_AUDITOR_ID;
  if (supabase) {
    const { data, error } = await supabase
      .from("narc_findings")
      .select("data")
      .eq("auditor_id", auditorId)
      .order("ts", { ascending: true });
    if (!error && data) {
      const records = data.flatMap((row) => {
        try { return [FindingRecordSchema.parse(row.data)]; } catch { return []; }
      });
      return Response.json({ records, count: records.length });
    }
  }
  const records = readJsonl(`${auditorId}-findings.jsonl`, FindingRecordSchema);
  return Response.json({ records, count: records.length });
}
