import { SuiJsonRpcClient, getJsonRpcFullnodeUrl } from "@mysten/sui/jsonRpc";
import { Transaction } from "@mysten/sui/transactions";
import { bcs } from "@mysten/sui/bcs";
import { decodeSuiPrivateKey } from "@mysten/sui/cryptography";
import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import { Secp256k1Keypair } from "@mysten/sui/keypairs/secp256k1";
import { Secp256r1Keypair } from "@mysten/sui/keypairs/secp256r1";

function traderAddress(): string | null {
  const pk = process.env.TRADER_PRIVATE_KEY;
  if (!pk) return null;
  try {
    const decoded = decodeSuiPrivateKey(pk);
    if (decoded.scheme === "ED25519") return Ed25519Keypair.fromSecretKey(decoded.secretKey).toSuiAddress();
    if (decoded.scheme === "Secp256k1") return Secp256k1Keypair.fromSecretKey(decoded.secretKey).toSuiAddress();
    if (decoded.scheme === "Secp256r1") return Secp256r1Keypair.fromSecretKey(decoded.secretKey).toSuiAddress();
  } catch { /* ignore */ }
  return null;
}

export const dynamic = "force-dynamic";

// Testnet DeepBook package ID
const DEEPBOOK_PKG = "0x22be4cade64bf2d02412c7e8d0e8beea2f78828b948118d46735315409371a3c";
const SUI_TYPE = "0x0000000000000000000000000000000000000000000000000000000000000002::sui::SUI";
const DBUSDC_TYPE = "0xf7152c05930480cd740d7311b5b8b45c6f488e3a53a11c3f74a6fac36a52e0d7::DBUSDC::DBUSDC";

// Dummy sender — devInspect doesn't require a funded account
const DUMMY_SENDER = "0x0000000000000000000000000000000000000000000000000000000000000000";

export async function GET() {
  const bmId = process.env.DEEPBOOK_BALANCE_MANAGER_ID;
  if (!bmId) {
    return Response.json({ error: "DEEPBOOK_BALANCE_MANAGER_ID not configured" }, { status: 400 });
  }

  try {
    const rpcUrl = process.env.SUI_RPC_URL || getJsonRpcFullnodeUrl("testnet");
    const jsonRpc = new SuiJsonRpcClient({ url: rpcUrl, network: "testnet" });

    // BM balances via devInspect
    const tx = new Transaction();
    tx.setSender(DUMMY_SENDER);
    tx.moveCall({
      target: `${DEEPBOOK_PKG}::balance_manager::balance`,
      arguments: [tx.object(bmId)],
      typeArguments: [SUI_TYPE],
    });
    tx.moveCall({
      target: `${DEEPBOOK_PKG}::balance_manager::balance`,
      arguments: [tx.object(bmId)],
      typeArguments: [DBUSDC_TYPE],
    });

    const [bmResult, walletSuiRaw] = await Promise.all([
      jsonRpc.devInspectTransactionBlock({ sender: DUMMY_SENDER, transactionBlock: tx }),
      (async () => {
        const addr = traderAddress();
        if (!addr) return null;
        const b = await jsonRpc.getBalance({ owner: addr, coinType: "0x2::sui::SUI" });
        return Number(b.totalBalance);
      })(),
    ]);

    const suiRaw = parseU64Bcs(bmResult?.results?.[0]?.returnValues?.[0]?.[0]);
    const usdcRaw = parseU64Bcs(bmResult?.results?.[1]?.returnValues?.[0]?.[0]);

    const suiBalance = (suiRaw / 1_000_000_000).toFixed(4);
    const usdcBalance = (usdcRaw / 1_000_000).toFixed(4);
    const walletSuiBalance = walletSuiRaw != null ? (walletSuiRaw / 1_000_000_000).toFixed(4) : null;

    return Response.json({ suiBalance, usdcBalance, walletSuiBalance, balanceManagerId: bmId });
  } catch (err) {
    return Response.json({ error: String(err) }, { status: 500 });
  }
}

function parseU64Bcs(bytes: number[] | Uint8Array | undefined): number {
  if (!bytes) return 0;
  try {
    return Number(bcs.U64.parse(new Uint8Array(bytes)));
  } catch {
    return 0;
  }
}
