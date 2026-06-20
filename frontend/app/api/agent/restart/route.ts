import { existsSync, readFileSync, rmSync, mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { spawn } from "node:child_process";

export const dynamic = "force-dynamic";

function activityDir(): string {
  const configured = process.env.LOCAL_ACTIVITY_DIR;
  const cwd = /*turbopackIgnore: true*/ process.cwd();
  if (configured) return resolve(cwd, "..", configured);
  return resolve(cwd, "../.narc/activity");
}

function repoRoot(): string {
  const cwd = /*turbopackIgnore: true*/ process.cwd();
  return resolve(cwd, "..");
}

export async function POST() {
  const dir = activityDir();
  const pidFile = join(dir, "agent.pid");

  // Stop existing processes
  if (existsSync(pidFile)) {
    try {
      const { traderPid, narcPid } = JSON.parse(readFileSync(pidFile, "utf8"));
      for (const pid of [traderPid, narcPid]) {
        if (typeof pid === "number") {
          try { process.kill(pid, "SIGTERM"); } catch { /* already dead */ }
        }
      }
    } catch { /* stale file */ }
    rmSync(pidFile, { force: true });
  }

  await new Promise((r) => setTimeout(r, 1000));

  // Start fresh
  mkdirSync(dir, { recursive: true });
  const root = repoRoot();

  const trader = spawn("pnpm", ["--filter", "@narc/trader", "a:loop"], {
    cwd: root,
    detached: true,
    stdio: "ignore",
    env: process.env,
  });
  trader.unref();

  const narc = spawn("pnpm", ["--filter", "@narc/auditor", "narc:run"], {
    cwd: root,
    detached: true,
    stdio: "ignore",
    env: process.env,
  });
  narc.unref();

  const pids = { traderPid: trader.pid ?? null, narcPid: narc.pid ?? null };
  writeFileSync(pidFile, JSON.stringify(pids));

  return Response.json(pids);
}
