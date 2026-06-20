import { Transaction } from "@mysten/sui/transactions";
import { SuiJsonRpcClient, getJsonRpcFullnodeUrl } from "@mysten/sui/jsonRpc";
import { decodeSuiPrivateKey } from "@mysten/sui/cryptography";
import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";

export const dynamic = "force-dynamic";

const NARC_POLICY_PACKAGE_ID =
  process.env.NARC_POLICY_PACKAGE_ID ??
  "0xb99544e895e5cd66fe06c09ca5ebd5d8fe731b04829c1db88def6c63e416bcd8";

const AGENT_POLICY_OBJECT_ID =
  process.env.AGENT_POLICY_OBJECT_ID ??
  "0x2f738d6b04d5804516c160e432f6059e7da196419be62a856801dd9b57441920";

const OWNER_CAP_ID =
  process.env.OWNER_CAP_ID ??
  "0x2863606f73ffd915295280283f116258d9da51091bfb21e28f1d26713d76afe8";

function parseByteArgument(value: string): number[] {
  if (/^0x[0-9a-fA-F]*$/.test(value)) {
    const hex = value.slice(2);
    return [...Buffer.from(hex.length % 2 === 0 ? hex : `0${hex}`, "hex")];
  }
  return [...Buffer.from(value, "utf8")];
}

export async function POST(request: Request) {
  const traderKey = process.env.TRADER_PRIVATE_KEY;
  if (!traderKey) {
    return Response.json(
      { error: "TRADER_PRIVATE_KEY not configured — cannot sign resume tx" },
      { status: 400 }
    );
  }

  try {
    const body = await request.json().catch(() => ({}));
    const reason =
      typeof body?.reason === "string" && body.reason.trim().length > 0
        ? (body.reason as string).trim()
        : "dashboard-override-resume";

    const rpcUrl =
      process.env.SUI_RPC_URL ?? getJsonRpcFullnodeUrl("testnet");
    const client = new SuiJsonRpcClient({ url: rpcUrl, network: "testnet" }) as any;

    const decoded = decodeSuiPrivateKey(traderKey);
    const signer = Ed25519Keypair.fromSecretKey(decoded.secretKey);

    const tx = new Transaction();
    tx.moveCall({
      target: `${NARC_POLICY_PACKAGE_ID}::narc_policy::override_resume`,
      arguments: [
        tx.object(OWNER_CAP_ID),
        tx.object(AGENT_POLICY_OBJECT_ID),
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
