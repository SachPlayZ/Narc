import { Transaction } from "@mysten/sui/transactions";
import { loadASideEnv, requirePolicyEnv } from "@narc/shared";
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
  arguments: [tx.object(env.OWNER_CAP_ID), tx.object(policy.AGENT_POLICY_OBJECT_ID), tx.pure.vector("u8", bytes(reason))]
});

const client = getSuiClient(env);
const signer = keypairFromSuiPrivateKey(env.TRADER_PRIVATE_KEY);
const result = await client.signAndExecuteTransaction({
  signer,
  transaction: tx,
  options: { showEffects: true, showEvents: true }
});

console.log(JSON.stringify({ digest: result.digest, explorer: explorer(result.digest) }, null, 2));

function bytes(value: string): number[] {
  return [...Buffer.from(value, "utf8")];
}

function explorer(digest: string): string {
  return `https://suiexplorer.com/txblock/${digest}?network=testnet`;
}
