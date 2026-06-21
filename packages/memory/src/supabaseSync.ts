import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { loadRepoEnvFile } from "@narc/shared";
import type { DecisionRecord, FindingRecord, OutcomeRecord } from "@narc/shared";

let _client: SupabaseClient | null | false = false;

function client(): SupabaseClient | null {
  if (_client !== false) return _client;
  // process.env is not populated from .env by loadBSideEnv — read the file directly
  const fileEnv = loadRepoEnvFile();
  const url = process.env.SUPABASE_URL || fileEnv.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_KEY || fileEnv.SUPABASE_SERVICE_KEY;
  _client = url && key ? createClient(url, key) : null;
  if (!_client) console.error("[supabase] client not initialised — SUPABASE_URL or SUPABASE_SERVICE_KEY missing");
  return _client;
}

async function upsert(table: string, row: Record<string, unknown>): Promise<void> {
  const sb = client();
  if (!sb) return;
  const { error } = await sb.from(table).upsert(row, { onConflict: "id" });
  if (error) console.error(`[supabase] ${table} upsert failed:`, error.message);
}

export function syncDecision(record: DecisionRecord): void {
  upsert("narc_decisions", {
    id: record.recordId,
    ts: record.ts,
    agent_id: record.agentId,
    tick: record.tick,
    data: record,
  }).catch(() => {});
}

export function syncOutcome(record: OutcomeRecord): void {
  upsert("narc_outcomes", {
    id: record.recordId,
    ts: record.ts,
    agent_id: record.agentId,
    tick: record.tick,
    data: record,
  }).catch(() => {});
}

export function syncFinding(record: FindingRecord): void {
  upsert("narc_findings", {
    id: record.findingId,
    ts: record.ts,
    auditor_id: record.auditorId,
    tick: record.tick,
    verdict: record.verdict,
    data: record,
  }).catch(() => {});
}
