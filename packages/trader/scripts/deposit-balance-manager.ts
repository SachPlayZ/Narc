import { loadASideEnv } from "@narc/shared";
import { depositIntoBalanceManager } from "../src/execution/deepbook.js";

const env = loadASideEnv();
const balanceManagerId = env.DEEPBOOK_BALANCE_MANAGER_ID;
if (!balanceManagerId) {
  console.error("DEEPBOOK_BALANCE_MANAGER_ID not set");
  process.exit(1);
}

const amountMist = Number(process.env.AMOUNT_MIST ?? "200000000"); // 0.2 SUI default
const coinKey = process.env.COIN_KEY ?? "SUI";

console.log(`Depositing ${amountMist / 1e9} SUI into BalanceManager ${balanceManagerId}...`);
const result = await depositIntoBalanceManager(balanceManagerId, coinKey, amountMist, env);
console.log(JSON.stringify({ digest: result.digest, explorer: `https://suiexplorer.com/txblock/${result.digest}?network=testnet` }, null, 2));
