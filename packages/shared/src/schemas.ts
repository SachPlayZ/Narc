import { z } from "zod";

export const SideSchema = z.enum(["bid", "ask"]);
export type Side = z.infer<typeof SideSchema>;

export const RuleSeveritySchema = z.enum(["WARN", "BREACH"]);
export type RuleSeverity = z.infer<typeof RuleSeveritySchema>;

export const RuleSpecSchema = z.object({
  id: z.string().min(1),
  description: z.string().min(1),
  severity: RuleSeveritySchema.default("BREACH")
});
export type RuleSpec = z.infer<typeof RuleSpecSchema>;

export const RuleResultSchema = z.object({
  ruleId: z.string().min(1),
  passed: z.boolean(),
  severity: RuleSeveritySchema,
  message: z.string(),
  observed: z.union([z.string(), z.number(), z.boolean(), z.null()]).optional(),
  limit: z.union([z.string(), z.number(), z.boolean(), z.null()]).optional()
});
export type RuleResult = z.infer<typeof RuleResultSchema>;

export const TradeIntentSchema = z.object({
  side: SideSchema,
  pair: z.string().min(3),
  sizeQuote: z.number().positive(),
  limitPrice: z.number().positive()
});
export type TradeIntent = z.infer<typeof TradeIntentSchema>;

export const MandateSchema = z.object({
  mandateId: z.string().min(1),
  maxNotionalQuote: z.number().positive(),
  maxCumulativeNotionalQuote: z.number().positive(),
  allowedPairs: z.array(z.string().min(3)).min(1),
  allowedSide: SideSchema.optional(),
  maxSlippageBps: z.number().nonnegative(),
  expiresAt: z.number().int().positive(),
  venue: z.literal("deepbook"),
  minOrderSizeQuote: z.number().positive(),
  lotSizeQuote: z.number().positive(),
  tickSize: z.number().positive(),
  expectedPoolId: z.string().min(1),
  rules: z.array(RuleSpecSchema)
});
export type Mandate = z.infer<typeof MandateSchema>;

export const MandateEvaluationSchema = z.object({
  passed: z.boolean(),
  checkedRules: z.array(RuleResultSchema),
  loosenCheckEnabled: z.boolean().default(false)
});
export type MandateEvaluation = z.infer<typeof MandateEvaluationSchema>;

export const PoolParameterCheckSchema = z.object({
  name: z.string(),
  passed: z.boolean(),
  message: z.string()
});
export type PoolParameterCheck = z.infer<typeof PoolParameterCheckSchema>;

export const FeeEstimateSchema = z.object({
  estimatedFeeBps: z.number().nonnegative(),
  feeAmountQuote: z.number().nonnegative().nullable(),
  feeToken: z.string().nullable(),
  source: z.enum(["deepbook", "static_fallback", "unavailable"])
});
export type FeeEstimate = z.infer<typeof FeeEstimateSchema>;

export const ObservationSchema = z.object({
  pair: z.string().min(3),
  midPrice: z.number().positive(),
  signalInputs: z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()])),
  priceFeedTs: z.number().int().positive(),
  stale: z.boolean(),
  deepbookPoolId: z.string().min(1)
});
export type Observation = z.infer<typeof ObservationSchema>;

export const DecisionRecordSchema = z.object({
  recordId: z.string().min(1),
  ts: z.number().int().positive(),
  agentId: z.string().min(1),
  tick: z.number().int().nonnegative(),
  observation: ObservationSchema,
  intent: TradeIntentSchema,
  reasoning: z.string(),
  mandateHash: z.string().min(1),
  mandateCheck: MandateEvaluationSchema,
  poolChecks: z.array(PoolParameterCheckSchema),
  feeEstimate: FeeEstimateSchema,
  prevBlobId: z.string().nullable()
});
export type DecisionRecord = z.infer<typeof DecisionRecordSchema>;

export const OutcomeStatusSchema = z.enum([
  "EXECUTED",
  "PARTIAL_FILL",
  "FAILED_DEEPBOOK",
  "FAILED_BALANCE",
  "FAILED_GAS",
  "ABORTED_POLICY_PAUSED",
  "ABORTED_SELF_CHECK"
]);
export type OutcomeStatus = z.infer<typeof OutcomeStatusSchema>;

export const OutcomeRecordSchema = z.object({
  recordId: z.string().min(1),
  ts: z.number().int().positive(),
  agentId: z.string().min(1),
  tick: z.number().int().nonnegative(),
  decisionRecordId: z.string().min(1),
  decisionBlobId: z.string().nullable(),
  status: OutcomeStatusSchema,
  executed: z.boolean(),
  txDigest: z.string().nullable(),
  fillPrice: z.number().positive().optional(),
  abortedBy: z.enum(["assert_active", "self_check"]).optional(),
  error: z.string().optional(),
  prevBlobId: z.string().nullable()
});
export type OutcomeRecord = z.infer<typeof OutcomeRecordSchema>;

export const RiskInputsSchema = z.object({
  mandateCheck: MandateEvaluationSchema,
  stalePrice: z.boolean(),
  cumulativeNotionalQuote: z.number().nonnegative(),
  currentNotionalQuote: z.number().nonnegative()
});
export type RiskInputs = z.infer<typeof RiskInputsSchema>;

export const RiskScoreSchema = z.object({
  score: z.number().min(0).max(100),
  verdict: z.enum(["PASS", "WARN", "BREACH"]),
  triggeredRules: z.array(RuleResultSchema)
});
export type RiskScore = z.infer<typeof RiskScoreSchema>;

export const FindingVerdictSchema = z.enum(["PASS", "WARN", "BREACH"]);
export type FindingVerdict = z.infer<typeof FindingVerdictSchema>;

export const FindingActionSchema = z.enum(["NONE", "PAUSED_ONCHAIN", "PAUSE_FAILED"]);
export type FindingAction = z.infer<typeof FindingActionSchema>;

export const FindingRecordSchema = z.object({
  findingId: z.string().min(1),
  ts: z.number().int().positive(),
  auditorId: z.string().min(1),
  tick: z.number().int().nonnegative(),
  reviewedDecisionBlobId: z.string().min(1),
  reviewedOutcomeBlobId: z.string().nullable(),
  verdict: FindingVerdictSchema,
  riskScore: RiskScoreSchema,
  triggeredRules: z.array(RuleResultSchema),
  explanation: z.string(),
  actionTaken: FindingActionSchema,
  pauseTxDigest: z.string().nullable(),
  pauseTxExplorer: z.string().nullable(),
  pauseReasonBlobId: z.string().nullable(),
  narcPrevBlobId: z.string().nullable(),
  traderPrevBlobId: z.string().nullable(),
  selfCheckDisagreement: z.boolean(),
  auditorVersion: z.string(),
  model: z.string()
});
export type FindingRecord = z.infer<typeof FindingRecordSchema>;
