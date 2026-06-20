import type { MemWalConfig } from "@mysten-incubation/memwal";
import type { BSideEnv } from "@narc/shared";

export type HealthCheckResult =
  | { ok: true; status: string; version?: string }
  | { ok: false; error: string };

/**
 * Check MemWal relayer health before starting the auditor loop.
 * Returns a typed result — callers decide whether to abort or fall back.
 *
 * NOTE: MemWalConfig (v0.0.7) has no suiNetwork field on the delegate-key
 * client (MemWal). Network selection only exists on MemWalManual. See BLOCKERS.md.
 */
export async function checkMemWalHealth(env: BSideEnv): Promise<HealthCheckResult> {
  if (!env.MEMWAL_ACCOUNT_ID || !env.MEMWAL_DELEGATE_KEY) {
    return {
      ok: false,
      error: "MEMWAL_ACCOUNT_ID or MEMWAL_DELEGATE_KEY not set — MemWal disabled"
    };
  }

  try {
    const { MemWal } = await import("@mysten-incubation/memwal");
    const config: MemWalConfig = {
      key: env.MEMWAL_DELEGATE_KEY,
      accountId: env.MEMWAL_ACCOUNT_ID,
      serverUrl: env.MEMWAL_RELAYER_URL
    };
    const mw = MemWal.create(config);
    const result = await mw.health();
    return { ok: true, status: result.status ?? "ok", version: result.version };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err)
    };
  }
}
