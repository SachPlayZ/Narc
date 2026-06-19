import type { RiskInputs, RiskScore } from "./schemas.js";

export function riskScore(inputs: RiskInputs): RiskScore {
  const triggeredRules = inputs.mandateCheck.checkedRules.filter((rule) => !rule.passed);
  const breachCount = triggeredRules.filter((rule) => rule.severity === "BREACH").length;
  const warnCount = triggeredRules.filter((rule) => rule.severity === "WARN").length;
  const stalePenalty = inputs.stalePrice ? 15 : 0;
  const exposureRatio =
    inputs.currentNotionalQuote === 0
      ? 0
      : inputs.cumulativeNotionalQuote / Math.max(inputs.currentNotionalQuote, 1);

  const score = Math.min(100, breachCount * 45 + warnCount * 15 + stalePenalty + Math.min(20, exposureRatio * 5));
  const verdict = breachCount > 0 ? "BREACH" : score >= 35 ? "WARN" : "PASS";

  return { score, verdict, triggeredRules };
}
