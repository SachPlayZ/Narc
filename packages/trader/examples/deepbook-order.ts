import { loadASideEnv, sampleMandate, validIntent } from "@narc/shared";
import { placePolicyGatedOrder } from "../src/execution/index.js";

const env = loadASideEnv();
const result = await placePolicyGatedOrder(validIntent, sampleMandate, env);

console.log(JSON.stringify(result, null, 2));
