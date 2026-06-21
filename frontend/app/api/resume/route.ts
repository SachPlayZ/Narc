import { Transaction } from "@mysten/sui/transactions";
import { SuiJsonRpcClient, getJsonRpcFullnodeUrl } from "@mysten/sui/jsonRpc";
import { decodeSuiPrivateKey } from "@mysten/sui/cryptography";
import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import { loadRepoEnvFile } from "@narc/shared";

export const dynamic = "force-dynamic";

const repoEnv = loadRepoEnvFile(process.cwd());

const NARC_POLICY_PACKAGE_ID =
  process.env.NARC_POLICY_PACKAGE_ID ??
  repoEnv.NARC_POLICY_PACKAGE_ID ??
  "";

const AGENT_POLICY_OBJECT_ID =
  process.env.AGENT_POLICY_OBJECT_ID ??
  repoEnv.AGENT_POLICY_OBJECT_ID ??
  "";

const OWNER_CAP_ID =
  process.env.OWNER_CAP_ID ??
  repoEnv.OWNER_CAP_ID ??
  "";

function parseByteArgument(value: string): number[] {
  if (/^0x[0-9a-fA-F]*$/.test(value)) {
    const hex = value.slice(2);
    return [...Buffer.from(hex.length % 2 === 0 ? hex : `0${hex}`, "hex")];
  }
  return [...Buffer.from(value, "utf8")];
}

export async function POST(request: Request) {
  const traderKey = process.env.TRADER_PRIVATE_KEY ?? repoEnv.TRADER_PRIVATE_KEY;
  if (!traderKey) {
    return Response.json(
      { error: "TRADER_PRIVATE_KEY not configured — cannot sign resume tx" },
      { status: 400 }
    );
  }

  try {
    if (!NARC_POLICY_PACKAGE_ID || !AGENT_POLICY_OBJECT_ID || !OWNER_CAP_ID) {
      throw new Error("Policy package id, policy object id, or owner cap id is not configured.");
    }
    const body = await request.json().catch(() => ({}));
    const reason =
      typeof body?.reason === "string" && body.reason.trim().length > 0
        ? (body.reason as string).trim()
        : "dashboard-override-resume";

    const rpcUrl =
      process.env.SUI_RPC_URL ?? repoEnv.SUI_RPC_URL ?? getJsonRpcFullnodeUrl("testnet");
    const client = new SuiJsonRpcClient({ url: rpcUrl, network: "testnet" }) as any;

    const decoded = decodeSuiPrivateKey(traderKey);
    const signer = Ed25519Keypair.fromSecretKey(decoded.secretKey);

    const tx = new Transaction();
    tx.moveCall({
      target: `${NARC_POLICY_PACKAGE_ID}::narc_policy::override_resume`,
      // ABI: policy first, OwnerCap second.
      arguments: [
        tx.object(AGENT_POLICY_OBJECT_ID),
        tx.object(OWNER_CAP_ID),
        tx.pure.vector("u8", parseByteArgument(reason)),
      ],
    });

    const result = await client.signAndExecuteTransaction({
      signer,
      transaction: tx,
      options: { showEffects: true, showEvents: true },
    });

    const digest: string = result.digest;
    const explorer = `https://suiexplorer.com/txblock/${digest}?network=testnet`;

    return Response.json({ digest, explorer });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return Response.json({ error: message }, { status: 500 });
  }
}
