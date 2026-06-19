import { loadASideEnv } from "@narc/shared";
import { getOrCreateBalanceManager, getOpenOrders } from "../src/execution/index.js";

const env = loadASideEnv();
const balanceManagerId = process.argv[2] || env.DEEPBOOK_BALANCE_MANAGER_ID || await getOrCreateBalanceManager(env);
const openOrders = await getOpenOrders(balanceManagerId, env);

console.log(
  JSON.stringify(
    {
      balanceManagerId,
      openOrdersFound: openOrders.length,
      orderIds: openOrders
    },
    null,
    2
  )
);
