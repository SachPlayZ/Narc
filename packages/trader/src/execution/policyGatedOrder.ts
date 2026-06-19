import { Transaction } from "@mysten/sui/transactions";
import { loadASideEnv, requirePolicyEnv, type ASideEnv, type Mandate, type TradeIntent } from "@narc/shared";
import { keypairFromSuiPrivateKey, getSuiClient } from "../sui.js";
import { assertPoolChecksPass, checkPoolParameters } from "./poolChecks.js";
import type { DeepBookOrderResult } from "./deepbook.js";

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
  const checks = checkPoolParameters(intent, mandate, env.DEEPBOOK_POOL);
  assertPoolChecksPass(checks);
  requirePolicyEnv(env);

  const tx = new Transaction();
  buildPolicyGate(tx, env);

  throw new Error(
    "Policy gate transaction is built, but DeepBook order command needs the installed SDK's order builder wired before submit."
  );

  // The submit path is intentionally below the throw until the DeepBook command is appended:
  // const client = getSuiClient(env);
  // const signer = keypairFromSuiPrivateKey(env.TRADER_PRIVATE_KEY);
  // const result = await client.signAndExecuteTransaction({ signer, transaction: tx, options: { showEffects: true } });
  // return { digest: result.digest, raw: result };
}

export async function submitPolicyOnlyProbe(env: ASideEnv = loadASideEnv()): Promise<DeepBookOrderResult> {
  const tx = new Transaction();
  buildPolicyGate(tx, env);
  const client = getSuiClient(env);
  const signer = keypairFromSuiPrivateKey(env.TRADER_PRIVATE_KEY);
  const result = await client.signAndExecuteTransaction({
    signer,
    transaction: tx,
    options: { showEffects: true, showEvents: true }
  });
  return { digest: result.digest, raw: result };
}
