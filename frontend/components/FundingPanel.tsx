"use client";

import { shortAddr } from "../lib/utils";

type Props = {
  suiBalance: string;
  balanceManagerId: string;
  onStart: () => Promise<void>;
  isStarting: boolean;
  error?: string;
};

export function FundingPanel({ suiBalance, balanceManagerId, onStart, isStarting, error }: Props) {
  const balance = parseFloat(suiBalance);
  const hasEnough = balance > 0;

  return (
    <div className="space-y-4">
      <div className="bg-zinc-800 border border-zinc-700 rounded-lg p-4 space-y-2 font-mono text-sm">
        <div className="flex justify-between">
          <span className="text-zinc-400">Balance manager</span>
          <span className="text-zinc-100">{shortAddr(balanceManagerId)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-zinc-400">Current balance</span>
          <span className={balance > 0.1 ? "text-green-400" : "text-yellow-400"}>{suiBalance} SUI</span>
        </div>
        <div className="flex justify-between">
          <span className="text-zinc-400">Minimum needed</span>
          <span className="text-zinc-300">0.10 SUI</span>
        </div>
      </div>

      {!hasEnough && (
        <div className="bg-zinc-800 border border-zinc-700 rounded-lg p-4">
          <p className="text-zinc-300 text-sm mb-2">Fund your balance manager by running:</p>
          <code className="block bg-zinc-900 rounded p-2 text-orange-300 text-xs">
            pnpm --filter @narc/trader deposit
          </code>
          <p className="text-zinc-500 text-xs mt-2">
            A proper in-browser deposit flow is out of scope for this release — use the CLI command above.
          </p>
        </div>
      )}

      <button
        onClick={onStart}
        disabled={isStarting || !hasEnough}
        className="w-full bg-orange-600 hover:bg-orange-500 disabled:opacity-50 text-white font-semibold py-3 px-4 rounded transition-colors"
      >
        {isStarting ? "Starting…" : "Start Agent"}
      </button>

      {error && <p className="text-red-400 text-sm">{error}</p>}
    </div>
  );
}
