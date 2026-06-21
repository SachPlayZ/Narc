"use client";

import type { OutcomeRecord } from "@narc/shared";

type BalanceData = {
  suiBalance?: string;
  usdcBalance?: string;
  error?: string;
};

type Props = {
  balance: BalanceData | undefined;
  outcomes: OutcomeRecord[];
  currentPrice: number | undefined;
};

export function BalancePanel({ balance, outcomes, currentPrice }: Props) {
  const executed = outcomes.filter((o) => o.executed);

  // Approximate realized P&L: for each executed trade, compare fill price vs mid price at entry
  // Simplified: track net USDC flow (buys cost USDC, sells earn USDC)
  let netUsdcFlow = 0;
  let totalVolume = 0;

  for (const o of executed) {
    const size = (o as Record<string, unknown>).sizeQuote as number | undefined ?? 0;
    const side = (o as Record<string, unknown>).side as string | undefined;
    totalVolume += size;
    if (side === "bid") netUsdcFlow -= size;   // spent USDC
    if (side === "ask") netUsdcFlow += size;   // earned USDC
  }

  const suiVal = currentPrice && balance?.suiBalance
    ? (parseFloat(balance.suiBalance) * currentPrice).toFixed(2)
    : null;

  return (
    <div className="bg-zinc-800 border border-zinc-700 rounded-lg p-4 space-y-3">
      <h2 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider">Balance</h2>

      {balance?.error ? (
        <p className="text-zinc-500 text-xs">{balance.error}</p>
      ) : (
        <div className="grid grid-cols-2 gap-3">
          <div>
            <p className="text-xs text-zinc-500">SUI</p>
            <p className="font-mono text-zinc-100 text-sm">{balance?.suiBalance ?? "—"}</p>
            {suiVal && <p className="font-mono text-zinc-500 text-xs">≈ ${suiVal}</p>}
          </div>
          <div>
            <p className="text-xs text-zinc-500">USDC</p>
            <p className="font-mono text-zinc-100 text-sm">{balance?.usdcBalance ?? "—"}</p>
          </div>
          <div>
            <p className="text-xs text-zinc-500">Volume</p>
            <p className="font-mono text-zinc-100 text-sm">{totalVolume.toFixed(2)} USDC</p>
          </div>
          <div>
            <p className="text-xs text-zinc-500">Net flow</p>
            <p className={`font-mono text-sm ${netUsdcFlow >= 0 ? "text-green-400" : "text-red-400"}`}>
              {netUsdcFlow >= 0 ? "+" : ""}{netUsdcFlow.toFixed(2)} USDC
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
