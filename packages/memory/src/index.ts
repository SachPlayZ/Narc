export type { NarcJournal } from "./journal.js";
export { LocalFallbackJournal } from "./localJournal.js";
export { MemWalJournal } from "./memwalJournal.js";
export { checkMemWalHealth } from "./health.js";
export type { HealthCheckResult } from "./health.js";

import type { BSideEnv } from "@narc/shared";
import type { NarcJournal } from "./journal.js";
import { MemWalJournal } from "./memwalJournal.js";
import { LocalFallbackJournal } from "./localJournal.js";

/**
 * Factory — returns MemWalJournal when MemWal credentials are present,
 * otherwise falls back to LocalFallbackJournal (JSONL files).
 */
export function createJournal(env: BSideEnv): NarcJournal {
  if (env.MEMWAL_ACCOUNT_ID && env.MEMWAL_DELEGATE_KEY) {
    return new MemWalJournal(env);
  }
  return new LocalFallbackJournal(env.LOCAL_ACTIVITY_DIR);
}
