import { loadASideEnv } from "@narc/shared";
import { getDeepBookClient, placeOrder } from "../src/execution/index.js";

const env = loadASideEnv();
const runtime = await getDeepBookClient(env);

const intent = {
  side: "ask" as const,
  pair: runtime.pool.pair,
  sizeQuote: 1,
  limitPrice: runtime.pool.baseCoin === "SUI" ? 10 : 1
};

const mandate = {
  mandateId: "deepbook-spike",
  maxNotionalQuote: 5,
  maxCumulativeNotionalQuote: 25,
  allowedPairs: [runtime.pool.pair],
  allowedSide: intent.side,
  maxSlippageBps: 100,
  expiresAt: Date.now() + 3_600_000,
  venue: "deepbook" as const,
  minOrderSizeQuote: 1,
  lotSizeQuote: 0.01,
  tickSize: 0.0001,
  expectedPoolId: runtime.pool.address,
  rules: []
};

try {
  const result = await placeOrder(intent, mandate, env);
  console.log(JSON.stringify({ status: "SUCCESS", pool: runtime.pool, result }, null, 2));
} catch (error) {
  console.error(
    JSON.stringify(
      {
        status: "FAILED",
        pool: runtime.pool,
        error: error instanceof Error ? error.message : String(error)
      },
      null,
      2
    )
  );
  process.exitCode = 1;
}
