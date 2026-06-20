import { FindingRecordSchema, loadRepoEnvFile } from "@narc/shared";
import { readJsonl } from "@/lib/journal";

export const dynamic = "force-dynamic";

export async function GET() {
  const repoEnv = loadRepoEnvFile(process.cwd());
  const auditorId = process.env.NARC_AUDITOR_ID ?? repoEnv.NARC_AUDITOR_ID ?? "narc";
  const records = readJsonl(`${auditorId}-findings.jsonl`, FindingRecordSchema);
  return Response.json({ records, count: records.length });
}
