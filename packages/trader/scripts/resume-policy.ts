import { Transaction } from "@mysten/sui/transactions";
import { loadASideEnv, requirePolicyEnv } from "@narc/shared";
import { explorerTxUrl, parseByteArgument } from "../src/policy/admin.js";
import { getSuiClient, keypairFromSuiPrivateKey } from "../src/sui.js";

const env = loadASideEnv();
const policy = requirePolicyEnv(env);

if (!env.OWNER_CAP_ID) {
  throw new Error("OWNER_CAP_ID is required to resume policy.");
}

const reason = process.argv[2] ?? "manual-resume";
const tx = new Transaction();
tx.moveCall({
  target: `${policy.NARC_POLICY_PACKAGE_ID}::narc_policy::override_resume`,
  arguments: [
    tx.object(env.OWNER_CAP_ID),
    tx.object(policy.AGENT_POLICY_OBJECT_ID),
    tx.pure.vector("u8", parseByteArgument(reason))
  ]
});

const client = getSuiClient(env);
const signer = keypairFromSuiPrivateKey(env.TRADER_PRIVATE_KEY);
const result = await client.signAndExecuteTransaction({
  signer,
  transaction: tx,
  options: { showEffects: true, showEvents: true }
});

console.log(JSON.stringify({ digest: result.digest, explorer: explorerTxUrl(result.digest) }, null, 2));
