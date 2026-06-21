import { getJsonRpcFullnodeUrl, SuiJsonRpcClient } from "@mysten/sui/jsonRpc";
import { deepbook, testnetPools } from "@mysten/deepbook-v3";

export const dynamic = "force-dynamic";

const POOL_KEY = process.env.DEEPBOOK_POOL ?? "SUI_DBUSDC";
const RUNTIME_KEY = "PRICE_POOL";

export async function GET() {
  try {
    const pool = testnetPools[POOL_KEY];
    if (!pool) {
      return Response.json({ error: `Unknown pool: ${POOL_KEY}` }, { status: 400 });
    }

    const rpcUrl = process.env.SUI_RPC_URL || getJsonRpcFullnodeUrl("testnet");
    const client = new SuiJsonRpcClient({ url: rpcUrl, network: "testnet" }).$extend(
      deepbook({
        address: "0x0000000000000000000000000000000000000000000000000000000000000000",
        pools: {
          [RUNTIME_KEY]: {
            address: pool.address,
            baseCoin: pool.baseCoin,
            quoteCoin: pool.quoteCoin,
          },
        },
      })
    );

    const midPrice = await client.deepbook.midPrice(RUNTIME_KEY);
    return Response.json({ midPrice, ts: Date.now(), pair: `${pool.baseCoin}_${pool.quoteCoin}` });
  } catch (err) {
    return Response.json({ error: String(err) }, { status: 500 });
  }
}
