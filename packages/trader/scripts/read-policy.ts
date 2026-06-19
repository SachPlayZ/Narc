import { loadASideEnv } from "@narc/shared";
import { readPolicyState } from "../src/policy/index.js";

const env = loadASideEnv();
console.log(JSON.stringify(await readPolicyState(env), null, 2));
