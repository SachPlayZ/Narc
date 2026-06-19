import { loadASideEnv } from "@narc/shared";
import { resumePolicy } from "../src/policy/index.js";

const env = loadASideEnv();
const reason = process.argv[2] ?? "manual-resume";
console.log(JSON.stringify(await resumePolicy(reason, env), null, 2));
