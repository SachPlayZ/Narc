import { Transaction } from "@mysten/sui/transactions";
import { hashMandate, loadASideEnv, requirePolicyEnv, type ASideEnv, type Mandate } from "@narc/shared";
import { explorerTxUrl, parseByteArgument, parsePolicyStateResponse, type PolicyState } from "./admin.js";
import { retryTransient } from "../network.js";
import { getSuiClient, signAndExecuteWithRetry } from "../sui.js";

export type PolicyTxResult = {
  digest: string;
  explorer: string;
};

export async function readPolicyState(env: ASideEnv = loadASideEnv()): Promise<PolicyState> {
  const policy = requirePolicyEnv(env);
  const client = getSuiClient(env);
  const object = await retryTransient(
    () =>
      client.getObject({
        id: policy.AGENT_POLICY_OBJECT_ID,
        options: { showContent: true, showOwner: true, showType: true }
      }),
    { label: "readPolicyState", maxAttempts: 4, baseDelayMs: 500 }
  );
  return parsePolicyStateResponse(object);
}

export async function pausePolicy(reasonBlob = "manual-pause", env: ASideEnv = loadASideEnv()): Promise<PolicyTxResult> {
  if (!env.GUARDIAN_CAP_ID) {
    throw new Error("GUARDIAN_CAP_ID is required to pause policy.");
  }

  return executePolicyTx("pause", [
    env.GUARDIAN_CAP_ID,
    requirePolicyEnv(env).AGENT_POLICY_OBJECT_ID,
    parseByteArgument(reasonBlob)
  ], env);
}

export async function resumePolicy(reason = "manual-resume", env: ASideEnv = loadASideEnv()): Promise<PolicyTxResult> {
  if (!env.OWNER_CAP_ID) {
    throw new Error("OWNER_CAP_ID is required to resume policy.");
  }

  return executePolicyTx("override_resume", [
    env.OWNER_CAP_ID,
    requirePolicyEnv(env).AGENT_POLICY_OBJECT_ID,
    parseByteArgument(reason)
  ], env);
}

export async function setPolicyMandateHash(
  mandateOrHash: Mandate | string,
  env: ASideEnv = loadASideEnv()
): Promise<PolicyTxResult> {
  if (!env.OWNER_CAP_ID) {
    throw new Error("OWNER_CAP_ID is required to set mandate hash.");
  }

  const mandateHash = typeof mandateOrHash === "string" ? mandateOrHash : hashMandate(mandateOrHash);
  return executePolicyTx("set_mandate_hash", [
    env.OWNER_CAP_ID,
    requirePolicyEnv(env).AGENT_POLICY_OBJECT_ID,
    parseByteArgument(mandateHash.startsWith("0x") ? mandateHash : `0x${mandateHash}`)
  ], env);
}

export async function waitForPolicyPauseState(
  expectedPaused: boolean,
  env: ASideEnv = loadASideEnv(),
  maxAttempts = 8,
  delayMs = 500
): Promise<PolicyState> {
  let lastState: PolicyState | null = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    lastState = await readPolicyState(env);
    if (lastState.paused === expectedPaused) {
      return lastState;
    }

    if (attempt < maxAttempts) {
      await sleep(delayMs);
    }
  }

  throw new Error(
    `Policy state did not reach paused=${expectedPaused} after ${maxAttempts} attempts. Last observed paused=${lastState?.paused}.`
  );
}

export async function waitForPolicyMandateHash(
  expectedHash: string,
  env: ASideEnv = loadASideEnv(),
  maxAttempts = 8,
  delayMs = 500
): Promise<PolicyState> {
  const normalized = expectedHash.startsWith("0x") ? expectedHash : `0x${expectedHash}`;
  let lastState: PolicyState | null = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    lastState = await readPolicyState(env);
    if (lastState.mandateHashHex.toLowerCase() === normalized.toLowerCase()) {
      return lastState;
    }

    if (attempt < maxAttempts) {
      await sleep(delayMs);
    }
  }

  throw new Error(
    `Policy mandate hash did not reach ${normalized} after ${maxAttempts} attempts. Last observed ${lastState?.mandateHashHex}.`
  );
}

async function executePolicyTx(
  fn: "pause" | "override_resume" | "set_mandate_hash",
  [capId, policyId, bytes]: [string, string, number[]],
  env: ASideEnv
): Promise<PolicyTxResult> {
  const policy = requirePolicyEnv(env);
  const result = await signAndExecuteWithRetry(env, () => {
    const tx = new Transaction();
    tx.moveCall({
      target: `${policy.NARC_POLICY_PACKAGE_ID}::narc_policy::${fn}`,
      // ABI: object first, capability second (Move 2024 method-associativity convention).
      arguments: [
        tx.object(policyId),
        tx.object(capId),
        tx.pure.vector("u8", bytes)
      ]
    });
    return tx;
  }, { showEffects: true, showEvents: true });

  return { digest: result.digest, explorer: explorerTxUrl(result.digest) };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
