import http from "node:http";
import { loadRepoEnvFile } from "@narc/shared";
import { start, stop, status, restart } from "./processes.js";

// Load .env from repo root into process.env before anything else
const fileEnv = loadRepoEnvFile(process.cwd());
for (const [k, v] of Object.entries(fileEnv)) {
  if (!(k in process.env)) process.env[k] = v as string;
}

const PORT = Number(process.env.AGENT_SERVER_PORT ?? 4000);

function json(res: http.ServerResponse, statusCode: number, body: unknown) {
  const payload = JSON.stringify(body);
  res.writeHead(statusCode, {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
  });
  res.end(payload);
}

const server = http.createServer(async (req, res) => {
  const method = req.method ?? "GET";
  const url = req.url ?? "/";

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
      return json(res, result.alreadyRunning ? 409 : 200, result);
    }
    if (url === "/stop" && method === "POST") {
      return json(res, 200, stop());
    }
    if (url === "/restart" && method === "POST") {
      return json(res, 200, await restart());
    }

    json(res, 404, { error: "Not found" });
  } catch (err) {
    json(res, 500, { error: err instanceof Error ? err.message : String(err) });
  }
});

server.listen(PORT, () => {
  console.log(`[agent-server] listening on :${PORT}`);
});
