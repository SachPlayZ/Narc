import { createClient } from "@supabase/supabase-js";
import type { NextRequest } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const url = process.env.SUPABASE_URL ?? "";
  const key = process.env.SUPABASE_SERVICE_KEY ?? "";

  if (!url || !key) {
    return new Response("Supabase not configured", { status: 503 });
  }

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    start(controller) {
      const sb = createClient(url, key);

      const send = (event: string, data: unknown) => {
        try {
          controller.enqueue(
            encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
          );
        } catch {}
      };

      // Keep-alive heartbeat every 25s
      const heartbeat = setInterval(() => {
        try { controller.enqueue(encoder.encode(": heartbeat\n\n")); } catch {}
      }, 25_000);

      const channel = sb
        .channel("narc-stream")
        .on("postgres_changes", { event: "INSERT", schema: "public", table: "narc_decisions" },
          (p) => send("decision", p.new))
        .on("postgres_changes", { event: "INSERT", schema: "public", table: "narc_outcomes" },
          (p) => send("outcome", p.new))
        .on("postgres_changes", { event: "INSERT", schema: "public", table: "narc_findings" },
          (p) => send("finding", p.new))
        .subscribe();

      request.signal.addEventListener("abort", () => {
        clearInterval(heartbeat);
        sb.removeChannel(channel).catch(() => {});
        try { controller.close(); } catch {}
      });
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
