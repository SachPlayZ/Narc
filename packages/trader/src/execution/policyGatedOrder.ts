import { Transaction } from "@mysten/sui/transactions";
import { loadASideEnv, requirePolicyEnv, type ASideEnv, type Mandate, type TradeIntent } from "@narc/shared";
import { signAndExecuteWithRetry } from "../sui.js";
import { assertPoolChecksPass, checkPoolParameters } from "./poolChecks.js";
import { appendDeepBookLimitOrder, getRuntimeWithManager, type DeepBookOrderResult } from "./deepbook.js";

export function buildPolicyGate(tx: Transaction, env: ASideEnv): void {
  const policy = requirePolicyEnv(env);
  tx.moveCall({
    target: `${policy.NARC_POLICY_PACKAGE_ID}::narc_policy::assert_active`,
    arguments: [tx.object(policy.AGENT_POLICY_OBJECT_ID)]
  });
}

export async function placePolicyGatedOrder(
  intent: TradeIntent,
  mandate: Mandate,
  env: ASideEnv = loadASideEnv()
): Promise<DeepBookOrderResult> {
  const runtime = await getRuntimeWithManager(env);
  const checks = checkPoolParameters(intent, mandate, runtime.pool.address);
  assertPoolChecksPass(checks);
  requirePolicyEnv(env);

  const result = await signAndExecuteWithRetry(env, () => {
    const tx = new Transaction();
    buildPolicyGate(tx, env);
    appendDeepBookLimitOrder(tx, runtime, intent);
    return tx;
  }, { showEffects: true, showObjectChanges: true, showEvents: true }) as any;

  if (result.effects?.status?.status && result.effects.status.status !== "success") {
    throw new Error(JSON.stringify(result.effects.status.error));
  }
  return { digest: result.digest, raw: result };
}

export async function submitPolicyOnlyProbe(env: ASideEnv = loadASideEnv()): Promise<DeepBookOrderResult> {
  const result = await signAndExecuteWithRetry(env, () => {
    const tx = new Transaction();
    buildPolicyGate(tx, env);
    return tx;
  }, { showEffects: true, showEvents: true });
  return { digest: result.digest, raw: result };
}
