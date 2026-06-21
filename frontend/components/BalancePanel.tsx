"use client";

import { useState, useEffect } from "react";
import type { OutcomeRecord } from "@narc/shared";
import { getDeposits, type DepositRecord } from "../lib/deposits";
import { explorerUrl, shortAddr, timeAgo } from "../lib/utils";

type BalanceData = {
  suiBalance?: string;
  usdcBalance?: string;
  walletSuiBalance?: string | null;
  error?: string;
};

type Props = {
  balance: BalanceData | undefined;
  outcomes: OutcomeRecord[];
  currentPrice: number | undefined;
  walletAddress?: string;
};

export function BalancePanel({ balance, outcomes, currentPrice, walletAddress }: Props) {
  const [deposits, setDeposits] = useState<DepositRecord[]>([]);
  const [showDeposits, setShowDeposits] = useState(false);

  useEffect(() => {
    if (walletAddress) setDeposits(getDeposits(walletAddress));
  }, [walletAddress]);

  const executed = outcomes.filter((o) => o.executed);
  let netUsdcFlow = 0;
  let totalVolume = 0;
  for (const o of executed) {
    const size = (o as Record<string, unknown>).sizeQuote as number ?? 0;
    const side = (o as Record<string, unknown>).side as string | undefined;
    totalVolume += size;
    if (side === "bid") netUsdcFlow -= size;
    if (side === "ask") netUsdcFlow += size;
  }

  const totalDeposited = deposits.reduce((s, d) => s + d.amount, 0);
  const suiVal = currentPrice && balance?.suiBalance
    ? (parseFloat(balance.suiBalance) * currentPrice).toFixed(2)
    : null;
  const walletSui = balance?.walletSuiBalance ? parseFloat(balance.walletSuiBalance) : null;

  return (
    <div className="bg-zinc-800 border border-zinc-700 rounded-lg p-4 space-y-3">
      <h2 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider">Balance</h2>

      {balance?.error ? (
        <p className="text-zinc-500 text-xs">{balance.error}</p>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <p className="text-xs text-zinc-500">DeepBook SUI</p>
              <p className="font-mono text-zinc-100 text-sm">{balance?.suiBalance ?? "—"}</p>
              {suiVal && <p className="font-mono text-zinc-500 text-xs">≈ ${suiVal}</p>}
            </div>
            <div>
              <p className="text-xs text-zinc-500">DeepBook USDC</p>
              <p className="font-mono text-zinc-100 text-sm">{balance?.usdcBalance ?? "—"}</p>
            </div>
            {walletSui != null && (
              <div>
                <p className="text-xs text-zinc-500">Agent wallet (gas)</p>
                <p className="font-mono text-zinc-100 text-sm">{walletSui.toFixed(4)} SUI</p>
              </div>
            )}
            <div>
              <p className="text-xs text-zinc-500">Volume</p>
              <p className="font-mono text-zinc-100 text-sm">{totalVolume.toFixed(2)} USDC</p>
            </div>
          </div>

          {/* Net flow */}
          <div className="border-t border-zinc-700 pt-3 space-y-1">
            <div className="flex justify-between text-xs">
              <span className="text-zinc-500">Net USDC flow</span>
              <span className={`font-mono ${netUsdcFlow >= 0 ? "text-green-400" : "text-red-400"}`}>
                {netUsdcFlow >= 0 ? "+" : ""}{netUsdcFlow.toFixed(2)}
              </span>
            </div>
            {walletAddress && (
              <div className="flex justify-between text-xs">
                <span className="text-zinc-500">You deposited</span>
                <span className="font-mono text-zinc-300">{totalDeposited.toFixed(4)} SUI</span>
              </div>
            )}
          </div>

          {/* Deposit history toggle */}
          {walletAddress && deposits.length > 0 && (
            <div>
              <button
                onClick={() => setShowDeposits((v) => !v)}
                className="text-xs text-zinc-400 hover:text-zinc-200 transition-colors"
              >
                {showDeposits ? "▲ Hide deposits" : `▼ ${deposits.length} deposit${deposits.length > 1 ? "s" : ""}`}
              </button>

              {showDeposits && (
                <div className="mt-2 space-y-1">
                  {[...deposits].reverse().map((d) => (
                    <div key={d.digest} className="flex items-center justify-between text-xs gap-2">
                      <span className="text-zinc-400">{timeAgo(d.ts)}</span>
                      <span className="font-mono text-zinc-200">{d.amount.toFixed(4)} SUI</span>
                      <a
                        href={explorerUrl(d.digest)}
                        target="_blank"
                        rel="noreferrer"
                        className="font-mono text-blue-400 hover:underline"
                      >
                        {shortAddr(d.digest)} →
                      </a>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
