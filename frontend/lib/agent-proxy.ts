const AGENT_SERVER_URL = process.env.AGENT_SERVER_URL;

export function agentServerUrl(): string | null {
  return AGENT_SERVER_URL ?? null;
}

export async function proxyToAgent(
  path: string,
  method: "GET" | "POST",
  body?: unknown
): Promise<Response | null> {
  const base = agentServerUrl();
  if (!base) return null;
  return fetch(`${base}${path}`, {
    method,
    headers: body ? { "Content-Type": "application/json" } : {},
    body: body ? JSON.stringify(body) : undefined,
  });
}
