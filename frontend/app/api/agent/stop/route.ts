import { existsSync, readFileSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";

export const dynamic = "force-dynamic";

function activityDir(): string {
  const configured = process.env.LOCAL_ACTIVITY_DIR;
  const cwd = /*turbopackIgnore: true*/ process.cwd();
  if (configured) return resolve(cwd, "..", configured);
  return resolve(cwd, "../.narc/activity");
}

export async function POST() {
  const pidFile = join(activityDir(), "agent.pid");

  if (!existsSync(pidFile)) {
    return Response.json({ stopped: true });
  }

  try {
    const { traderPid, narcPid } = JSON.parse(readFileSync(pidFile, "utf8"));
    for (const pid of [traderPid, narcPid]) {
      if (typeof pid === "number") {
        try {
          process.kill(pid, "SIGTERM");
        } catch {
          // already dead
        }
      }
    }
    rmSync(pidFile, { force: true });
    return Response.json({ stopped: true });
  } catch (err) {
    return Response.json({ error: String(err) }, { status: 500 });
  }
}
