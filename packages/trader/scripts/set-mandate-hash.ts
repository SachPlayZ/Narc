import { loadASideEnv } from "@narc/shared";
import { setPolicyMandateHash } from "../src/policy/index.js";

const env = loadASideEnv();
const mandateHash = process.argv[2];
if (!mandateHash) {
  throw new Error("Pass the mandate hash as the first argument. Hex with 0x prefix is supported.");
}

console.log(JSON.stringify(await setPolicyMandateHash(mandateHash, env), null, 2));
