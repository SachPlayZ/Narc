import { OutcomeRecordSchema } from "@narc/shared";
import { readJsonl } from "@/lib/journal";

export const dynamic = "force-dynamic";

const NARC_AGENT_ID = process.env.NARC_AGENT_ID ?? "trader-a";

export async function GET() {
  const records = readJsonl(
    `${NARC_AGENT_ID}-outcomes.jsonl`,
    OutcomeRecordSchema
  );
  return Response.json({ records, count: records.length });
}
