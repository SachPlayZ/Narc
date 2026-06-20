import { FindingRecordSchema } from "@narc/shared";
import { readJsonl } from "@/lib/journal";

export const dynamic = "force-dynamic";

export async function GET() {
  const auditorId = process.env.NARC_AUDITOR_ID ?? "narc";
  const records = readJsonl(`${auditorId}-findings.jsonl`, FindingRecordSchema);
  return Response.json({ records, count: records.length });
}
