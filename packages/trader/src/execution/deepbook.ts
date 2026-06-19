import { loadASideEnv, type ASideEnv, type Mandate, type TradeIntent } from "@narc/shared";
import { checkPoolParameters } from "./poolChecks.js";

export type DeepBookOrderResult = {
  digest: string;
  raw: unknown;
};

export type DeepBookRuntime = {
  env: ASideEnv;
  client: unknown;
};

export async function getDeepBookClient(env: ASideEnv = loadASideEnv()): Promise<DeepBookRuntime> {
  const mod = await import("@mysten/deepbook-v3");
  const clientFactory = (mod as Record<string, unknown>).DeepBookClient;
  if (typeof clientFactory === "function") {
    const { getSuiClient } = await import("../sui.js");
    const suiClient = getSuiClient(env);
    return {
      env,
      client: new (clientFactory as new (args: unknown) => unknown)({
        address: env.OWNER_ADDRESS,
        env: "testnet",
        client: suiClient
      })
    };
  }

  const extensionFactory = (mod as Record<string, unknown>).deepbook;
  if (typeof extensionFactory === "function") {
    return { env, client: extensionFactory({ network: "testnet" }) };
  }

  throw new Error("@mysten/deepbook-v3 did not expose DeepBookClient or deepbook(). Check installed SDK version.");
}

export async function getOrCreateBalanceManager(env: ASideEnv = loadASideEnv()): Promise<string> {
  if (env.DEEPBOOK_BALANCE_MANAGER_ID) return env.DEEPBOOK_BALANCE_MANAGER_ID;
  throw new Error("DEEPBOOK_BALANCE_MANAGER_ID is required until the BalanceManager creation flow is wired for the installed SDK.");
}

export async function placeOrder(intent: TradeIntent, mandate: Mandate, env: ASideEnv = loadASideEnv()): Promise<DeepBookOrderResult> {
  const checks = checkPoolParameters(intent, mandate, env.DEEPBOOK_POOL);
  const failed = checks.filter((item) => !item.passed);
  if (failed.length > 0) {
    throw new Error(`Refusing DeepBook order; pool checks failed: ${failed.map((item) => item.name).join(", ")}`);
  }

  await getOrCreateBalanceManager(env);
  await getDeepBookClient(env);
  throw new Error("Use placePolicyGatedOrder() for live orders; direct ungated DeepBook placement is intentionally disabled.");
}
