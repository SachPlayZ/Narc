export { NarcAuditor } from "./auditor.js";
export { auditTick, computeCumulative, AUDITOR_VERSION } from "./tick.js";
export { executeBreach } from "./pause.js";
export type {
  AuditTickInput,
  AuditTickResult,
  BreachHandlerResult,
  NarcJournal
} from "./types.js";
export type { PauseBreachResult } from "./pause.js";
export type { AuditTickDeps } from "./tick.js";
