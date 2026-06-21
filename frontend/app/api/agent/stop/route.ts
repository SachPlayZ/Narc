import { existsSync, readFileSync, rmSync } from "node:fs";
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

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const agentId: string = body.agentId ?? request.nextUrl.searchParams.get("agentId") ?? process.env.NARC_AGENT_ID ?? "trader-a";

  const proxy = await proxyToAgent("/stop", "POST", { agentId });
  if (proxy) return new Response(proxy.body, { status: proxy.status, headers: { "Content-Type": "application/json" } });

  const pf = join(activityDir(), `agent-${agentId}.pid`);
  if (!existsSync(pf)) return Response.json({ stopped: true });

  try {
    const { traderPid, narcPid } = JSON.parse(readFileSync(pf, "utf8"));
    for (const pid of [traderPid, narcPid]) {
      if (typeof pid === "number") {
        try { process.kill(pid, "SIGTERM"); } catch { /* already dead */ }
      }
    }
    rmSync(pf, { force: true });
    return Response.json({ stopped: true });
  } catch (err) {
    return Response.json({ error: String(err) }, { status: 500 });
  }
}
