import { loadASideEnv, requirePolicyEnv } from "@narc/shared";
import { getSuiClient } from "../src/sui.js";

const env = loadASideEnv();
const policy = requirePolicyEnv(env);
const client = getSuiClient(env);

const object = await client.getObject({
  id: policy.AGENT_POLICY_OBJECT_ID,
  options: { showContent: true, showOwner: true, showType: true }
});

console.log(JSON.stringify(object, null, 2));
