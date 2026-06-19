import { createHash } from "node:crypto";
import type { Mandate, MandateEvaluation, RuleResult, TradeIntent } from "./schemas.js";

export type MandateState = {
  nowMs?: number;
  cumulativeNotionalQuote?: number;
};

export function hashMandate(mandate: Mandate): string {
  const canonical = JSON.stringify(sortValue(mandate));
  return createHash("sha256").update(canonical).digest("hex");
}

export function evaluateMandate(
  intent: TradeIntent,
  mandate: Mandate,
  state: MandateState = {}
): MandateEvaluation {
  const nowMs = state.nowMs ?? Date.now();
  const cumulative = state.cumulativeNotionalQuote ?? 0;
  const checkedRules: RuleResult[] = [
    {
      ruleId: "venue",
      passed: mandate.venue === "deepbook",
      severity: "BREACH",
      message: "Venue must be DeepBook.",
      observed: mandate.venue,
      limit: "deepbook"
    },
    {
      ruleId: "pair_allowed",
      passed: mandate.allowedPairs.includes(intent.pair),
      severity: "BREACH",
      message: "Pair must be allowed by mandate.",
      observed: intent.pair,
      limit: mandate.allowedPairs.join(",")
    },
    {
      ruleId: "side_allowed",
      passed: mandate.allowedSide === undefined || mandate.allowedSide === intent.side,
      severity: "BREACH",
      message: "Side must be allowed by mandate.",
      observed: intent.side,
      limit: mandate.allowedSide ?? "both"
    },
    {
      ruleId: "max_notional",
      passed: intent.sizeQuote <= mandate.maxNotionalQuote,
      severity: "BREACH",
      message: "Per-order notional must not exceed mandate maximum.",
      observed: intent.sizeQuote,
      limit: mandate.maxNotionalQuote
    },
    {
      ruleId: "max_cumulative_notional",
      passed: cumulative + intent.sizeQuote <= mandate.maxCumulativeNotionalQuote,
      severity: "BREACH",
      message: "Cumulative notional must not exceed mandate maximum.",
      observed: cumulative + intent.sizeQuote,
      limit: mandate.maxCumulativeNotionalQuote
    },
    {
      ruleId: "not_expired",
      passed: nowMs <= mandate.expiresAt,
      severity: "BREACH",
      message: "Mandate must not be expired.",
      observed: nowMs,
      limit: mandate.expiresAt
    }
  ];

  return {
    passed: checkedRules.every((rule) => rule.passed),
    checkedRules,
    loosenCheckEnabled: false
  };
}

function sortValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, child]) => [key, sortValue(child)])
    );
  }
  return value;
}
