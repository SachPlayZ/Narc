import type { FeeEstimate, TradeIntent } from "@narc/shared";
import { loadASideEnv, type ASideEnv } from "@narc/shared";
import { feeEstimateFromTradeParams, readTradeParams, unavailableFeeEstimate } from "./deepbook.js";

export async function estimateFee(intent: TradeIntent, env?: ASideEnv): Promise<FeeEstimate> {
  try {
    const runtimeEnv = env ?? loadASideEnv();
    const tradeParams = await readTradeParams(runtimeEnv);
    return feeEstimateFromTradeParams(intent, tradeParams);
  } catch {
    return unavailableFeeEstimate(intent);
  }
}
