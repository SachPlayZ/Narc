import { loadASideEnv, type ASideEnv } from "@narc/shared";
import { cancelLiveOrdersForManager, getOpenOrders } from "./deepbook.js";

export type CancelOpenOrdersResult = {
  openOrdersFound: number;
  canceled: number;
  cancelTxDigest?: string;
  status: "SUCCESS" | "FAILED";
  error?: string;
};

export async function cancelOpenOrders(
  balanceManagerId: string,
  env: ASideEnv = loadASideEnv()
): Promise<CancelOpenOrdersResult> {
  try {
    const openOrders = await getOpenOrders(balanceManagerId, env);
    if (openOrders.length === 0) {
      return { openOrdersFound: 0, canceled: 0, status: "SUCCESS" };
    }

    const result = await cancelLiveOrdersForManager(balanceManagerId, openOrders, env);
    return {
      openOrdersFound: openOrders.length,
      canceled: openOrders.length,
      cancelTxDigest: result.digest,
      status: "SUCCESS"
    };
  } catch (error) {
    return {
      openOrdersFound: 0,
      canceled: 0,
      status: "FAILED",
      error: error instanceof Error ? error.message : String(error)
    };
  }
}
