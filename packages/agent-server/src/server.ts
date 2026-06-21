import http from "node:http";
import { loadRepoEnvFile } from "@narc/shared";
import { start, stop, status, restart } from "./processes.js";
import { readMandate, writeMandate } from "./mandate.js";

// Load .env from repo root into process.env before anything else
const fileEnv = loadRepoEnvFile(process.cwd());
for (const [k, v] of Object.entries(fileEnv)) {
  if (!(k in process.env)) process.env[k] = v as string;
}

const PORT = Number(process.env.AGENT_SERVER_PORT ?? 4000);

function json(res: http.ServerResponse, status: number, body: unknown) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
  });
  res.end(payload);
}

async function readBody(req: http.IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (chunk) => (data += chunk));
    req.on("end", () => {
      try { resolve(data ? JSON.parse(data) : {}); } catch { reject(new Error("Invalid JSON")); }
    });
    req.on("error", reject);
  });
}

const server = http.createServer(async (req, res) => {
  const method = req.method ?? "GET";
  const url = req.url ?? "/";

  // CORS preflight
  if (method === "OPTIONS") {
    res.writeHead(204, { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "Content-Type", "Access-Control-Allow-Methods": "GET,POST,OPTIONS" });
    res.end();
    return;
  }

  try {
    if (url === "/health" && method === "GET") {
      return json(res, 200, { ok: true });
    }

    if (url === "/status" && method === "GET") {
      return json(res, 200, status());
    }

    if (url === "/start" && method === "POST") {
      const result = start();
      const statusCode = result.alreadyRunning ? 409 : 200;
      return json(res, statusCode, result);
    }

    if (url === "/stop" && method === "POST") {
      return json(res, 200, stop());
    }

    if (url === "/restart" && method === "POST") {
      return json(res, 200, await restart());
    }

    if (url === "/mandate" && method === "GET") {
      const artifact = readMandate();
      return json(res, 200, { artifact, exists: Boolean(artifact) });
    }

    if (url === "/mandate" && method === "POST") {
      const body = await readBody(req);
      const artifact = await writeMandate(body);
      return json(res, 200, { artifact, onChainTx: null });
    }

    json(res, 404, { error: "Not found" });
  } catch (err) {
    json(res, 500, { error: err instanceof Error ? err.message : String(err) });
  }
});

server.listen(PORT, () => {
  console.log(`[agent-server] listening on :${PORT}`);
});
