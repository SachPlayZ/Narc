import { loadASideEnv } from "@narc/shared";
import { pausePolicy } from "../src/policy/index.js";

const env = loadASideEnv();
const reasonBlob = process.argv[2] ?? "manual-pause";
console.log(JSON.stringify(await pausePolicy(reasonBlob, env), null, 2));
