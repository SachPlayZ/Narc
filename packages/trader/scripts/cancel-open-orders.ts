import { loadASideEnv } from "@narc/shared";
import { cancelOpenOrders, getOrCreateBalanceManager } from "../src/execution/index.js";

const env = loadASideEnv();
const balanceManagerId = process.argv[2] || env.DEEPBOOK_BALANCE_MANAGER_ID || await getOrCreateBalanceManager(env);
const result = await cancelOpenOrders(balanceManagerId, env);

console.log(
  JSON.stringify(
    {
      balanceManagerId,
      ...result
    },
    null,
    2
  )
);
