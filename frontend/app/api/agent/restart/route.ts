import { existsSync, readFileSync, rmSync, mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { spawn } from "node:child_process";
import { proxyToAgent } from "@/lib/agent-proxy";
import type { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

function activityDir(): string {
  const configured = process.env.LOCAL_ACTIVITY_DIR;
  const cwd = /*turbopackIgnore: true*/ process.cwd();
  if (configured) return resolve(cwd, "..", configured);
  return resolve(cwd, "../.narc/activity");
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const agentId: string = body.agentId ?? process.env.NARC_AGENT_ID ?? "trader-a";

  const proxy = await proxyToAgent("/restart", "POST", { agentId });
  if (proxy) return new Response(proxy.body, { status: proxy.status, headers: { "Content-Type": "application/json" } });

  const dir = activityDir();
  const pidFile = join(dir, `agent-${agentId}.pid`);

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

  mkdirSync(dir, { recursive: true });
  const root = resolve(/*turbopackIgnore: true*/ process.cwd(), "..");
  const agentEnv = { ...process.env, NARC_AGENT_ID: agentId, NARC_AUDITOR_ID: agentId };

  const trader = spawn("pnpm", ["--filter", "@narc/trader", "a:loop"], {
    cwd: root, detached: true, stdio: "ignore", env: agentEnv,
  });
  trader.unref();

  const narc = spawn("pnpm", ["--filter", "@narc/auditor", "narc:run"], {
    cwd: root, detached: true, stdio: "ignore", env: agentEnv,
  });
  narc.unref();

  const pids = { traderPid: trader.pid ?? null, narcPid: narc.pid ?? null, agentId };
  writeFileSync(pidFile, JSON.stringify(pids));
  return Response.json(pids);
}
