"use client";

import type { ReactNode } from "react";
import type { MandateFormValues } from "./MandateForm";

type Props = {
  values: MandateFormValues;
};

export function MandatePreview({ values }: Props) {
  const expiresLabel =
    values.expiresInHours === 1 ? "1 hour" :
    values.expiresInHours < 24 ? `${values.expiresInHours} hours` :
    values.expiresInHours === 24 ? "24 hours" : "7 days";

  const sideLabel =
    values.allowedSide === "ask" ? "Sell only" :
    values.allowedSide === "bid" ? "Buy only" :
    "Both";

  return (
    <div className="space-y-2.5">
      <h3 className="text-[18px] leading-tight text-zinc-50 sm:text-[24px]">
        Your agent will
      </h3>

      <PreviewItem
        label="PAIR"
        icon={
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" className="h-6 w-6">
            <circle cx="12" cy="12" r="7" />
            <circle cx="12" cy="12" r="2.2" />
          </svg>
        }
        text={`Trade ${values.allowedPairs.join(", ").replace("_", "/")} on DeepBook`}
      />
      <PreviewItem
        label="PER TRADE"
        icon={
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" className="h-6 w-6">
            <rect x="5" y="5" width="14" height="14" rx="1.5" />
            <path d="M9 9h6v6H9z" />
          </svg>
        }
        text={`Place at most ${values.maxNotionalQuote} USDC per trade`}
        value={`${values.maxNotionalQuote}`}
      />
      <PreviewItem
        label="DAILY LIMIT"
        icon={
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" className="h-6 w-6">
            <rect x="5" y="5" width="14" height="14" rx="1.5" />
            <path d="M8 8h8v8H8z" />
          </svg>
        }
        text={`Trade at most ${values.maxCumulativeNotionalQuote} USDC total in ${expiresLabel}`}
        value={`${values.maxCumulativeNotionalQuote}`}
      />
      <PreviewItem
        label="SLIPPAGE"
        icon={
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" className="h-6 w-6">
            <path d="M3 14c2 0 2-4 4-4s2 4 4 4 2-4 4-4 2 4 4 4 2-4 4-4" />
          </svg>
        }
        text={`Accept at most ${values.maxSlippageBps} bps slippage`}
      />
      <PreviewItem
        label="SIDE"
        icon={
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" className="h-6 w-6">
            <path d="M8 5v14" />
            <path d="m4 9 4-4 4 4" />
            <path d="M16 19V5" />
            <path d="m12 15 4 4 4-4" />
          </svg>
        }
        text={`Allow ${sideLabel.toLowerCase()} trading`}
      />

      <div className="rounded-[12px] border border-[#ff4d24] bg-[#0d0403] px-3 py-2.5">
        <div className="flex items-center gap-2.5">
          <span className="grid h-7 w-7 place-items-center rounded-[7px] border border-[#ff4d24] text-[#ff4d24]">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-5 w-5">
              <path d="M6 6l12 12" />
              <path d="M18 6 6 18" />
            </svg>
          </span>
          <p className="font-mono text-[11px] uppercase tracking-[0.06em] text-[#ff5c3b] sm:text-[12px]">
            Any trade outside these rules will be blocked by NARC
          </p>
        </div>
      </div>

      <div className="flex items-center justify-between gap-3 rounded-[12px] border border-white/15 bg-black/30 px-3 py-2.5">
        <div className="flex items-center gap-2.5">
          <span className="grid h-7 w-7 place-items-center rounded-[7px] border border-white/15 text-zinc-100">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" className="h-5 w-5">
              <path d="m12 3 7 4v10l-7 4-7-4V7l7-4Z" />
              <path d="M5 7l7 4 7-4" />
              <path d="M12 11v10" />
            </svg>
          </span>
          <div>
            <div className="font-mono text-[11px] uppercase tracking-[0.06em] text-zinc-100">
              Evidence stored on Walrus
            </div>
            <div className="mt-0.5 font-mono text-[10px] uppercase tracking-[0.08em] text-zinc-500">
              Ready for on-chain enforcement
            </div>
          </div>
        </div>
        <div className="hidden items-center gap-3 sm:flex">
          <div className="h-3 w-18 bg-[radial-gradient(circle,rgba(255,255,255,0.65)_1px,transparent_1.5px)] bg-[length:8px_8px] bg-center bg-no-repeat opacity-80" />
          <span className="font-mono text-[11px] uppercase tracking-[0.06em] text-zinc-300">
            e37f...9a2b
          </span>
        </div>
      </div>
    </div>
  );
}

function PreviewItem({
  icon,
  text,
  label,
  value,
}: {
  icon: ReactNode;
  text: string;
  label: string;
  value?: string;
}) {
  return (
    <div className="flex items-center gap-2 rounded-[12px] border border-white/15 bg-black/25 px-3 py-2">
      <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full border border-[#36d46c] text-[#36d46c]">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4.5 w-4.5">
          <path d="m5 12 5 5L19 8" />
        </svg>
      </span>
      <div className="h-5 w-px shrink-0 bg-white/15" />
      <span className="grid h-6 w-6 shrink-0 place-items-center text-zinc-100">
        {icon}
      </span>
      {value ? (
        <span className="grid h-6 min-w-6 shrink-0 place-items-center rounded-[6px] border border-white/20 px-1 font-mono text-[11px] text-zinc-100">
          {value}
        </span>
      ) : null}
      <span className="min-w-0 flex-1 font-mono text-[11px] leading-relaxed text-zinc-100 sm:text-[12px]">
        {text}
      </span>
      <span className="hidden rounded-[8px] border border-white/10 px-2 py-0.5 font-mono text-[9px] uppercase tracking-[0.1em] text-zinc-400 lg:block">
        {label}
      </span>
      <span className="hidden h-2.5 w-10 bg-[radial-gradient(circle,rgba(255,255,255,0.55)_1px,transparent_1.5px)] bg-[length:8px_8px] bg-center bg-no-repeat opacity-70 lg:block" />
    </div>
  );
}
