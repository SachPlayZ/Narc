export function decisionNamespace(agentId: string): string {
  return `agent:${agentId}:decisions`;
}

export function outcomeNamespace(agentId: string): string {
  return `agent:${agentId}:outcomes`;
}
