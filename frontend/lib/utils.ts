export function shortAddr(s: string): string {
  if (!s || s.length <= 16) return s;
  return `${s.slice(0, 8)}…${s.slice(-6)}`;
}

export function explorerUrl(digest: string): string {
  return `https://suiexplorer.com/txblock/${digest}?network=testnet`;
}

export function walrusUrl(blobId: string): string {
  return `https://walruscan.com/testnet/blob/${blobId}`;
}

export function verdictColor(v: string): string {
  if (v === "BREACH") return "text-red-400";
  if (v === "WARN") return "text-yellow-400";
  return "text-green-400";
}

export function verdictBg(v: string): string {
  if (v === "BREACH") return "bg-red-900/60 border-red-600";
  if (v === "WARN") return "bg-yellow-900/60 border-yellow-600";
  return "bg-green-900/30 border-green-700";
}

export function scoreColor(score: number): string {
  if (score >= 70) return "text-red-400";
  if (score >= 35) return "text-yellow-400";
  return "text-green-400";
}

export function timeAgo(tsMs: number): string {
  const diffMs = Date.now() - tsMs;
  const diffS = Math.floor(diffMs / 1000);
  if (diffS < 60) return `${diffS}s ago`;
  const diffM = Math.floor(diffS / 60);
  if (diffM < 60) return `${diffM}m ago`;
  return `${Math.floor(diffM / 60)}h ago`;
}

export function formatRelative(tsMs: number): string {
  const now = Date.now();
  const diff = tsMs - now;
  if (diff < 0) return "Expired";
  const diffS = Math.floor(diff / 1000);
  if (diffS < 3600) return `${Math.floor(diffS / 60)}m remaining`;
  const diffH = Math.floor(diffS / 3600);
  if (diffH < 48) return `${diffH}h remaining`;
  return `${Math.floor(diffH / 24)}d remaining`;
}
