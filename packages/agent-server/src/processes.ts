import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { spawn } from "node:child_process";

const repoRoot = resolve(new URL("../../..", import.meta.url).pathname);
const activityDir = resolve(repoRoot, process.env.LOCAL_ACTIVITY_DIR ?? ".narc/activity");
const pidFile = join(activityDir, "agent.pid");

function pidAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function readPids(): { traderPid: number | null; narcPid: number | null } {
  try {
    if (!existsSync(pidFile)) return { traderPid: null, narcPid: null };
    return JSON.parse(readFileSync(pidFile, "utf8"));
  } catch {
    return { traderPid: null, narcPid: null };
  }
}

export function status() {
  const { traderPid, narcPid } = readPids();
  return {
    traderRunning: typeof traderPid === "number" && pidAlive(traderPid),
    narcRunning: typeof narcPid === "number" && pidAlive(narcPid),
    traderPid: traderPid ?? null,
    narcPid: narcPid ?? null,
  };
}

export function start(): { traderPid: number | null; narcPid: number | null; alreadyRunning?: true } {
  const { traderPid, narcPid } = readPids();
  const traderAlive = typeof traderPid === "number" && pidAlive(traderPid);
  const narcAlive = typeof narcPid === "number" && pidAlive(narcPid);
  if (traderAlive || narcAlive) {
    return { traderPid, narcPid, alreadyRunning: true };
  }

  mkdirSync(activityDir, { recursive: true });

  const trader = spawn("pnpm", ["--filter", "@narc/trader", "a:loop"], {
    cwd: repoRoot,
    detached: true,
    stdio: "ignore",
    env: process.env,
  });
  trader.unref();

  const narc = spawn("pnpm", ["--filter", "@narc/auditor", "narc:run"], {
    cwd: repoRoot,
    detached: true,
    stdio: "ignore",
    env: process.env,
  });
  narc.unref();

  const pids = { traderPid: trader.pid ?? null, narcPid: narc.pid ?? null };
  writeFileSync(pidFile, JSON.stringify(pids));
  return pids;
}

export function stop(): { stopped: true } {
  const { traderPid, narcPid } = readPids();
  for (const pid of [traderPid, narcPid]) {
    if (typeof pid === "number") {
      try { process.kill(pid, "SIGTERM"); } catch { /* already dead */ }
    }
  }
  rmSync(pidFile, { force: true });
  return { stopped: true };
}

export async function restart(): Promise<{ traderPid: number | null; narcPid: number | null }> {
  stop();
  await new Promise((r) => setTimeout(r, 1000));
  const pids = start();
  return { traderPid: pids.traderPid, narcPid: pids.narcPid };
}
