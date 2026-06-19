import {
  formatPolicyEnv,
  parsePolicyPublishResponse,
  policyPackagePath,
  runCommand,
  savePolicyPublishArtifact
} from "../src/policy/admin.js";

const result = await runCommand("sui", [
  "client",
  "publish",
  "--json",
  "--gas-budget",
  "100000000",
  policyPackagePath()
]);
const parsed = JSON.parse(result);
const info = parsePolicyPublishResponse(parsed);
const artifactPath = await savePolicyPublishArtifact({
  publishedAt: new Date().toISOString(),
  publish: info,
  raw: parsed
});

console.log(
  JSON.stringify(
    {
      ...info,
      env: formatPolicyEnv(info),
      artifactPath
    },
    null,
    2
  )
);
