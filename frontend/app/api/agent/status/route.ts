import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { proxyToAgent } from "@/lib/agent-proxy";
import type { NextRequest } from "next/server";

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

export async function GET(request: NextRequest) {
  const agentId = request.nextUrl.searchParams.get("agentId") ?? process.env.NARC_AGENT_ID ?? "trader-a";

  const proxy = await proxyToAgent(`/status?agentId=${encodeURIComponent(agentId)}`, "GET");
  if (proxy) return new Response(proxy.body, { status: proxy.status, headers: { "Content-Type": "application/json" } });

  const pf = join(activityDir(), `agent-${agentId}.pid`);
  if (!existsSync(pf)) {
    return Response.json({ traderRunning: false, narcRunning: false, traderPid: null, narcPid: null });
  }

  try {
    const { traderPid, narcPid } = JSON.parse(readFileSync(pf, "utf8"));
    return Response.json({
      traderRunning: typeof traderPid === "number" && pidAlive(traderPid),
      narcRunning: typeof narcPid === "number" && pidAlive(narcPid),
      traderPid: traderPid ?? null,
      narcPid: narcPid ?? null,
    });
  } catch {
    return Response.json({ traderRunning: false, narcRunning: false, traderPid: null, narcPid: null });
  }
}
