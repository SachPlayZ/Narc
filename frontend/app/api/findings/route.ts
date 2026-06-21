import { FindingRecordSchema, loadRepoEnvFile } from "@narc/shared";
import { readJsonl } from "@/lib/journal";
import { supabase } from "@/lib/supabase";

export const dynamic = "force-dynamic";

const repoEnv = loadRepoEnvFile(process.cwd());
const NARC_AUDITOR_ID = process.env.NARC_AUDITOR_ID ?? repoEnv.NARC_AUDITOR_ID ?? "narc";

export async function GET() {
  if (supabase) {
    const { data, error } = await supabase
      .from("narc_findings")
      .select("data")
      .eq("auditor_id", NARC_AUDITOR_ID)
      .order("ts", { ascending: true });
    if (!error && data) {
      const records = data.flatMap((row) => {
        try { return [FindingRecordSchema.parse(row.data)]; } catch { return []; }
      });
      return Response.json({ records, count: records.length });
    }
  }
  const records = readJsonl(`${NARC_AUDITOR_ID}-findings.jsonl`, FindingRecordSchema);
  return Response.json({ records, count: records.length });
}
