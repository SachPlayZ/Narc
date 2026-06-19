import { submitPolicyOnlyProbe } from "../src/execution/index.js";

const result = await submitPolicyOnlyProbe();

console.log(JSON.stringify(result, null, 2));
