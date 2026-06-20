import { DecisionRecordSchema, loadRepoEnvFile } from "@narc/shared";
import { readJsonl } from "@/lib/journal";

export const dynamic = "force-dynamic";

const repoEnv = loadRepoEnvFile(process.cwd());
const NARC_AGENT_ID = process.env.NARC_AGENT_ID ?? repoEnv.NARC_AGENT_ID ?? "trader-a";

export async function GET() {
  const records = readJsonl(
    `${NARC_AGENT_ID}-decisions.jsonl`,
    DecisionRecordSchema
  );
  return Response.json({ records, count: records.length });
}
