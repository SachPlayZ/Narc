import { z } from "zod";

const optionalId = z.string().min(1).optional();

export const ASideEnvSchema = z.object({
  SUI_NETWORK: z.literal("testnet"),
  SUI_RPC_URL: z.string().url().optional(),
  TRADER_PRIVATE_KEY: z.string().min(1),
  OWNER_ADDRESS: z.string().min(1),
  NARC_ADDRESS: z.string().min(1),
  DEEPBOOK_POOL: z.string().min(1),
  DEEPBOOK_BALANCE_MANAGER_ID: optionalId,
  NARC_POLICY_PACKAGE_ID: optionalId,
  AGENT_POLICY_OBJECT_ID: optionalId,
  GUARDIAN_CAP_ID: optionalId,
  OWNER_CAP_ID: optionalId,
  LOCAL_ACTIVITY_DIR: z.string().min(1).default(".narc/activity")
});
export type ASideEnv = z.infer<typeof ASideEnvSchema>;

export function loadASideEnv(source: NodeJS.ProcessEnv = process.env): ASideEnv {
  const normalized = {
    ...source,
    SUI_NETWORK: source.SUI_NETWORK || "testnet",
    SUI_RPC_URL: source.SUI_RPC_URL || undefined,
    DEEPBOOK_BALANCE_MANAGER_ID: source.DEEPBOOK_BALANCE_MANAGER_ID || undefined,
    NARC_POLICY_PACKAGE_ID: source.NARC_POLICY_PACKAGE_ID || undefined,
    AGENT_POLICY_OBJECT_ID: source.AGENT_POLICY_OBJECT_ID || undefined,
    GUARDIAN_CAP_ID: source.GUARDIAN_CAP_ID || undefined,
    OWNER_CAP_ID: source.OWNER_CAP_ID || undefined,
    LOCAL_ACTIVITY_DIR: source.LOCAL_ACTIVITY_DIR || ".narc/activity"
  };

  return ASideEnvSchema.parse(normalized);
}

export function requirePolicyEnv(env: ASideEnv): Required<Pick<ASideEnv, "NARC_POLICY_PACKAGE_ID" | "AGENT_POLICY_OBJECT_ID">> {
  if (!env.NARC_POLICY_PACKAGE_ID || !env.AGENT_POLICY_OBJECT_ID) {
    throw new Error("NARC_POLICY_PACKAGE_ID and AGENT_POLICY_OBJECT_ID are required for policy-gated execution.");
  }
  return {
    NARC_POLICY_PACKAGE_ID: env.NARC_POLICY_PACKAGE_ID,
    AGENT_POLICY_OBJECT_ID: env.AGENT_POLICY_OBJECT_ID
  };
}
