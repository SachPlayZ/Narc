import { loadASideEnv, type ASideEnv } from "@narc/shared";

export type CancelOpenOrdersResult = {
  openOrdersFound: number;
  canceled: number;
  cancelTxDigest?: string;
  status: "SUCCESS" | "FAILED";
  error?: string;
};

export async function getOpenOrders(_balanceManagerId: string, _env: ASideEnv = loadASideEnv()): Promise<unknown[]> {
  return [];
}

export async function cancelOpenOrders(
  balanceManagerId: string,
  env: ASideEnv = loadASideEnv()
): Promise<CancelOpenOrdersResult> {
  try {
    const openOrders = await getOpenOrders(balanceManagerId, env);
    if (openOrders.length === 0) {
      return { openOrdersFound: 0, canceled: 0, status: "SUCCESS" };
    }

    return {
      openOrdersFound: openOrders.length,
      canceled: 0,
      status: "FAILED",
      error: "Cancel command needs the installed DeepBook SDK order-cancel builder wired."
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
