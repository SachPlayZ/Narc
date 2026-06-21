import { SuiJsonRpcClient, getJsonRpcFullnodeUrl } from "@mysten/sui/jsonRpc";
import { DeepBookClient } from "@mysten/deepbook-v3";

export const dynamic = "force-dynamic";

const POOL_KEY = process.env.DEEPBOOK_POOL ?? "SUI_DBUSDC";

export async function GET() {
  try {
    const rpcUrl = process.env.SUI_RPC_URL || getJsonRpcFullnodeUrl("testnet");
    const suiClient = new SuiJsonRpcClient({ url: rpcUrl, network: "testnet" });
    const db = new DeepBookClient({ env: "testnet", client: suiClient as never });

    const midPrice = await db.deepbook.midPrice(POOL_KEY);
    return Response.json({ midPrice, ts: Date.now(), pair: POOL_KEY });
  } catch (err) {
    return Response.json({ error: String(err) }, { status: 500 });
  }
}
