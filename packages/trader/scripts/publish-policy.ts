import { spawn } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

const policyPath = resolve("..", "narc_policy");
const outputPath = resolve("..", "..", ".narc", "policy-publish.json");
const result = await run("sui", ["client", "publish", "--json", "--gas-budget", "100000000", policyPath]);
const parsed = JSON.parse(result);
const ids = extractIds(parsed);

await mkdir(dirname(outputPath), { recursive: true });
await writeFile(outputPath, JSON.stringify({ raw: parsed, ids }, null, 2), "utf8");

console.log(JSON.stringify(ids, null, 2));
console.log(`Saved raw publish output to ${outputPath}`);

function extractIds(value: unknown): Record<string, string[]> {
  const text = JSON.stringify(value);
  const matches = text.match(/0x[a-fA-F0-9]{32,}/g) ?? [];
  return { objectIds: [...new Set(matches)] };
}

function run(command: string, args: string[]): Promise<string> {
  return new Promise((resolveRun, reject) => {
    const child = spawn(command, args, { stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += String(chunk);
    });
    child.stderr.on("data", (chunk) => {
      stderr += String(chunk);
    });
    child.on("close", (code) => {
      if (code === 0) resolveRun(stdout);
      else reject(new Error(`${command} exited ${code}: ${stderr || stdout}`));
    });
  });
}
