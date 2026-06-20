/**
 * pause.ts — Breach pause orchestration.
 *
 * Responsibilities:
 *  1. Call pausePolicy(findingBlobId, suiEnv) from @narc/trader — real testnet tx.
 *  2. Attempt to cancel open DeepBook orders (independent from pause success).
 *  3. Return honest status: PAUSED_ONCHAIN, PAUSE_FAILED, + cancel info separately.
 *
 * Design constraint: pause success and cancel success are INDEPENDENT.
 * PAUSED_ONCHAIN + cancel error is a valid, honest result that must be visible.
 */

import type { ASideEnv, BSideEnv } from "@narc/shared";
import type { BreachHandlerResult } from "./types.js";

export type PauseBreachResult = BreachHandlerResult & {
  cancelOpenOrdersStatus: "SUCCESS" | "FAILED" | "SKIPPED";
  cancelTxDigest?: string;
  cancelError?: string;
  openOrdersFound?: number;
};

/**
 * Execute the full breach response:
 *  1. pausePolicy on-chain (writes findingBlobId as the reason)
 *  2. cancelOpenOrders (independent; may fail without affecting pause status)
 *
 * @param findingBlobId   - blob_id of the FindingRecord already written to Walrus
 * @param env             - BSideEnv (holds NARC_PRIVATE_KEY, GUARDIAN_CAP_ID, etc.)
 * @param balanceManagerId - optional DeepBook BalanceManager object id; if absent,
 *                          cancel step is skipped
 */
export async function executeBreach(
  findingBlobId: string,
  env: BSideEnv,
  balanceManagerId?: string
): Promise<PauseBreachResult> {
  // -------------------------------------------------------------------------
  // Build a compatible ASideEnv from BSideEnv.
  // The trader helpers (pausePolicy, cancelOpenOrders) accept ASideEnv; the only
  // meaningful difference is the signer key field name (TRADER_PRIVATE_KEY vs
  // NARC_PRIVATE_KEY). We map it here at the boundary.
  // -------------------------------------------------------------------------
  const suiEnv = bsideToAside(env);

  // -------------------------------------------------------------------------
  // Step 1: Pause policy on-chain
  // -------------------------------------------------------------------------
  let pauseTxDigest: string | null = null;
  let pauseReasonBlobId: string | null = null;
  let actionTaken: BreachHandlerResult["actionTaken"] = "PAUSE_FAILED";

  try {
    // Dynamic import keeps this optional at compile time when @narc/trader isn't linked yet
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const traderMod = await import("@narc/trader" as any);
    const { pausePolicy } = traderMod as { pausePolicy: (reasonBlob: string, env: ASideEnv) => Promise<{ digest: string; explorer: string }> };
    const result = await pausePolicy(findingBlobId, suiEnv);
    pauseTxDigest = result.digest;
    pauseReasonBlobId = findingBlobId;
    actionTaken = "PAUSED_ONCHAIN";
    console.error(
      `[Narc] Policy paused on-chain. tx=${result.digest} explorer=${result.explorer}`
    );
  } catch (pauseErr) {
    const errMsg =
      pauseErr instanceof Error ? pauseErr.message : String(pauseErr);
    console.error(`[Narc] pausePolicy FAILED: ${errMsg}`);
    // actionTaken stays "PAUSE_FAILED"
  }

  // -------------------------------------------------------------------------
  // Step 2: Cancel open DeepBook orders (independent — may fail)
  // -------------------------------------------------------------------------
  let cancelStatus: PauseBreachResult["cancelOpenOrdersStatus"] = "SKIPPED";
  let cancelTxDigest: string | undefined;
  let cancelError: string | undefined;
  let openOrdersFound: number | undefined;

  if (balanceManagerId) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const traderMod2 = await import("@narc/trader" as any);
      const { cancelOpenOrders } = traderMod2 as {
        cancelOpenOrders: (
          balanceManagerId: string,
          env: ASideEnv
        ) => Promise<{ openOrdersFound: number; canceled: number; cancelTxDigest?: string; status: "SUCCESS" | "FAILED"; error?: string }>
      };
      const cancelResult = await cancelOpenOrders(balanceManagerId, suiEnv);
      openOrdersFound = cancelResult.openOrdersFound;
      cancelStatus = cancelResult.status;
      cancelTxDigest = cancelResult.cancelTxDigest;
      if (cancelResult.status === "FAILED") {
        cancelError = cancelResult.error;
        console.error(
          `[Narc] cancelOpenOrders FAILED (pause still counts): ${cancelResult.error}`
        );
      } else {
        console.error(
          `[Narc] cancelOpenOrders SUCCESS — canceled=${cancelResult.canceled}`
        );
      }
    } catch (cancelErr) {
      cancelStatus = "FAILED";
      cancelError =
        cancelErr instanceof Error ? cancelErr.message : String(cancelErr);
      console.error(
        `[Narc] cancelOpenOrders threw (pause still counts): ${cancelError}`
      );
    }
  }

  return {
    actionTaken,
    pauseTxDigest,
    pauseReasonBlobId,
    cancelOpenOrdersStatus: cancelStatus,
    cancelTxDigest,
    cancelError,
    openOrdersFound
  };
}

// ---------------------------------------------------------------------------
// Internal: bridge BSideEnv → ASideEnv
// ---------------------------------------------------------------------------

/**
 * Constructs a minimal ASideEnv from BSideEnv so we can call @narc/trader helpers.
 *
 * The Narc signs with NARC_PRIVATE_KEY.  The trader library's signAndExecuteWithRetry
 * reads TRADER_PRIVATE_KEY from the env — we map it here.
 */
function bsideToAside(env: BSideEnv): ASideEnv {
  return {
    SUI_NETWORK: env.SUI_NETWORK,
    SUI_RPC_URL: env.SUI_RPC_URL,
    TRADER_PRIVATE_KEY: env.NARC_PRIVATE_KEY,
    OWNER_ADDRESS: "0x0",  // not used by pausePolicy
    NARC_ADDRESS: "0x0",   // not used by pausePolicy
    DEEPBOOK_POOL: env.DEEPBOOK_POOL || "SUI_DBUSDC",
    NARC_POLICY_PACKAGE_ID: env.NARC_POLICY_PACKAGE_ID,
    AGENT_POLICY_OBJECT_ID: env.AGENT_POLICY_OBJECT_ID,
    GUARDIAN_CAP_ID: env.GUARDIAN_CAP_ID,
    // These are optional in ASideEnv and not needed for pause/cancel
    OWNER_CAP_ID: undefined,
    DEEPBOOK_BALANCE_MANAGER_ID: undefined,
    LOCAL_ACTIVITY_DIR: env.LOCAL_ACTIVITY_DIR
  } as ASideEnv;
}
