import { loadASideEnv, type ASideEnv } from "@narc/shared";
import { getDeepBookClient } from "../execution/deepbook.js";
import { retryTransient } from "../network.js";

export type MarketSnapshot = {
  pair: string;
  midPrice: number;
  priceFeedTs: number;
  deepbookPoolId: string;
  signalInputs: Record<string, string | number | boolean | null>;
};

export async function readMarketSnapshot(env: ASideEnv = loadASideEnv()): Promise<MarketSnapshot> {
  const runtime = await getDeepBookClient(env);
  const [midPrice, bookParams, tradeParams] = await retryTransient(
    () =>
      Promise.all([
        runtime.client.deepbook.midPrice(runtime.pool.runtimePoolKey),
        runtime.client.deepbook.poolBookParams(runtime.pool.runtimePoolKey),
        runtime.client.deepbook.poolTradeParams(runtime.pool.runtimePoolKey)
      ]),
    { label: "readMarketSnapshot", maxAttempts: 4, baseDelayMs: 750 }
  );

  return {
    pair: runtime.pool.pair,
    midPrice,
    priceFeedTs: Date.now(),
    deepbookPoolId: runtime.pool.address,
    signalInputs: {
      source: "deepbook_testnet",
      tickSize: bookParams.tickSize,
      lotSize: bookParams.lotSize,
      minSize: bookParams.minSize,
      takerFeeBps: Number((tradeParams.takerFee * 10_000).toFixed(6)),
      makerFeeBps: Number((tradeParams.makerFee * 10_000).toFixed(6)),
      stakeRequired: tradeParams.stakeRequired
    }
  };
}
