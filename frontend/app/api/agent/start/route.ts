import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { spawn } from "node:child_process";
import { proxyToAgent } from "@/lib/agent-proxy";

export const dynamic = "force-dynamic";

function activityDir(): string {
  const configured = process.env.LOCAL_ACTIVITY_DIR;
  const cwd = /*turbopackIgnore: true*/ process.cwd();
  if (configured) return resolve(cwd, "..", configured);
  return resolve(cwd, "../.narc/activity");
}

function pidAlive(pid: number): boolean {
  try { process.kill(pid, 0); return true; } catch { return false; }
}

export async function POST() {
  const proxy = await proxyToAgent("/start", "POST");
  if (proxy) return new Response(proxy.body, { status: proxy.status, headers: { "Content-Type": "application/json" } });

  const dir = activityDir();
  const pidFile = join(dir, "agent.pid");

  if (existsSync(pidFile)) {
    try {
      const existing = JSON.parse(readFileSync(pidFile, "utf8"));
      const traderAlive = typeof existing.traderPid === "number" && pidAlive(existing.traderPid);
      const narcAlive = typeof existing.narcPid === "number" && pidAlive(existing.narcPid);
      if (traderAlive || narcAlive) {
        return Response.json(
          { error: "Agent already running", traderPid: existing.traderPid, narcPid: existing.narcPid },
          { status: 409 }
        );
      }
    } catch {
      // stale pid file — proceed
    }
  }

  mkdirSync(dir, { recursive: true });
  const root = resolve(/*turbopackIgnore: true*/ process.cwd(), "..");

  const trader = spawn("pnpm", ["--filter", "@narc/trader", "a:loop"], {
    cwd: root, detached: true, stdio: "ignore", env: process.env,
  });
  trader.unref();

  const narc = spawn("pnpm", ["--filter", "@narc/auditor", "narc:run"], {
    cwd: root, detached: true, stdio: "ignore", env: process.env,
  });
  narc.unref();

  const pids = { traderPid: trader.pid ?? null, narcPid: narc.pid ?? null };
  writeFileSync(pidFile, JSON.stringify(pids));
  return Response.json(pids);
}
