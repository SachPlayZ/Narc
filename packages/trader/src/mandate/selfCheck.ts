import { evaluateMandate, type Mandate, type MandateEvaluation, type MandateState, type TradeIntent } from "@narc/shared";

export type SelfCheckOptions = {
  loosenCheck?: boolean;
};

export function runTraderSelfCheck(
  intent: TradeIntent,
  mandate: Mandate,
  state: MandateState = {},
  options: SelfCheckOptions = {}
): MandateEvaluation {
  const result = evaluateMandate(intent, mandate, state);
  if (!options.loosenCheck) return result;

  const checkedRules = result.checkedRules.map((rule) =>
    rule.ruleId === "max_notional"
      ? {
          ...rule,
          passed: true,
          message: `${rule.message} Loosened at trader call site for demo breach.`
        }
      : rule
  );

  return {
    checkedRules,
    passed: checkedRules.every((rule) => rule.passed),
    loosenCheckEnabled: true
  };
}
