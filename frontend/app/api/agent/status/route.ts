import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";

export const dynamic = "force-dynamic";

function activityDir(): string {
  const configured = process.env.LOCAL_ACTIVITY_DIR;
  const cwd = /*turbopackIgnore: true*/ process.cwd();
  if (configured) return resolve(cwd, "..", configured);
  return resolve(cwd, "../.narc/activity");
}

function pidAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

export async function GET() {
  const pidFile = join(activityDir(), "agent.pid");
  if (!existsSync(pidFile)) {
    return Response.json({
      traderRunning: false,
      narcRunning: false,
      traderPid: null,
      narcPid: null,
    });
  }

  try {
    const { traderPid, narcPid } = JSON.parse(readFileSync(pidFile, "utf8"));
    return Response.json({
      traderRunning: typeof traderPid === "number" && pidAlive(traderPid),
      narcRunning: typeof narcPid === "number" && pidAlive(narcPid),
      traderPid: traderPid ?? null,
      narcPid: narcPid ?? null,
    });
  } catch {
    return Response.json({
      traderRunning: false,
      narcRunning: false,
      traderPid: null,
      narcPid: null,
    });
  }
}
