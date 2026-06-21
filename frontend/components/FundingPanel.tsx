"use client";

import { shortAddr } from "../lib/utils";

type Props = {
  suiBalance: string;
  balanceManagerId: string;
  onStart: () => Promise<void>;
  isStarting: boolean;
  error?: string;
};

function DataRow({
  label,
  value,
  valueClassName = "text-zinc-100",
}: {
  label: string;
  value: string;
  valueClassName?: string;
}) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-white/10 py-3 last:border-b-0">
      <span className="font-mono text-[12px] uppercase tracking-[0.14em] text-zinc-500">
        {label}
      </span>
      <span className={`font-mono text-[15px] uppercase tracking-[0.08em] ${valueClassName}`}>
        {value}
      </span>
    </div>
  );
}

export function FundingPanel({ suiBalance, balanceManagerId, onStart, isStarting, error }: Props) {
  const balance = parseFloat(suiBalance);
  const hasEnough = balance > 0;

  return (
    <div className="space-y-4">
      <div className="grid gap-4 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
        <div className="rounded-[12px] border border-white/15 bg-black/25 p-4">
          <div className="mb-3 font-mono text-[13px] uppercase tracking-[0.14em] text-zinc-400">
            Balance Manager
          </div>
          <div className="rounded-[12px] border border-white/10 bg-black/35 px-4">
            <DataRow label="Policy object" value={shortAddr(balanceManagerId)} />
            <DataRow
              label="Current balance"
              value={`${suiBalance} SUI`}
              valueClassName={balance > 0.1 ? "text-[#36d46c]" : "text-[#ffb347]"}
            />
            <DataRow label="Minimum needed" value="0.10 SUI" valueClassName="text-zinc-300" />
          </div>
        </div>

        <div className="rounded-[12px] border border-white/15 bg-black/25 p-4">
          <div className="mb-3 font-mono text-[13px] uppercase tracking-[0.14em] text-zinc-400">
            Start Conditions
          </div>
          <div className="space-y-3 rounded-[12px] border border-white/10 bg-black/35 p-4">
            <div className="flex items-center justify-between gap-4">
              <span className="font-mono text-[14px] uppercase tracking-[0.08em] text-zinc-100">
                Mandate registered
              </span>
              <span className="flex items-center gap-3 font-mono text-[12px] uppercase tracking-[0.12em] text-[#36d46c]">
                <span className="h-2.5 w-2.5 rounded-full bg-[#36d46c]" />
                Ready
              </span>
            </div>
            <div className="flex items-center justify-between gap-4">
              <span className="font-mono text-[14px] uppercase tracking-[0.08em] text-zinc-100">
                Funding status
              </span>
              <span className={`flex items-center gap-3 font-mono text-[12px] uppercase tracking-[0.12em] ${hasEnough ? "text-[#36d46c]" : "text-[#ffb347]"}`}>
                <span className={`h-2.5 w-2.5 rounded-full ${hasEnough ? "bg-[#36d46c]" : "bg-[#ffb347]"}`} />
                {hasEnough ? "Sufficient" : "Needs funding"}
              </span>
            </div>
            <p className="font-mono text-[12px] leading-relaxed text-zinc-500">
              The agent can only start after the balance manager holds enough SUI to pay for enforcement transactions.
            </p>
          </div>
        </div>
      </div>

      {!hasEnough ? (
        <div className="rounded-[12px] border border-white/15 bg-black/25 p-4">
          <div className="mb-3 font-mono text-[13px] uppercase tracking-[0.14em] text-zinc-400">
            Fund via CLI
          </div>
          <div className="rounded-[12px] border border-white/10 bg-black/35 p-4">
            <p className="font-mono text-[13px] leading-relaxed text-zinc-300">
              Fund your balance manager by running:
            </p>
            <code className="mt-3 block rounded-[10px] border border-white/10 bg-[#090909] px-4 py-3 font-mono text-[12px] uppercase tracking-[0.08em] text-[#ffb347]">
              pnpm --filter @narc/trader deposit
            </code>
            <p className="mt-3 font-mono text-[12px] leading-relaxed text-zinc-500">
              A browser deposit flow is not part of this build. Use the CLI command above, then return here and start the agent.
            </p>
          </div>
        </div>
      ) : null}

      {error ? (
        <div className="rounded-[12px] border border-[#ff4d24]/40 bg-[#120604] px-4 py-3 font-mono text-[12px] uppercase tracking-[0.1em] text-[#ff4d24]">
          {error}
        </div>
      ) : null}

      <div className="flex justify-end">
        <button
          onClick={onStart}
          disabled={isStarting || !hasEnough}
          className="inline-flex min-h-16 min-w-[260px] items-center justify-center rounded-[12px] border border-[#ff4d24] bg-[#d91717] px-6 py-4 font-mono text-[20px] uppercase tracking-[0.12em] text-white transition hover:bg-[#ea2424] disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isStarting ? "Starting..." : "Start Agent"}
        </button>
      </div>
    </div>
  );
}
