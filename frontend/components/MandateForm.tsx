"use client";

import type { ReactNode } from "react";
import { useEffect, useState } from "react";

export type MandateFormValues = {
  maxNotionalQuote: number;
  maxCumulativeNotionalQuote: number;
  allowedPairs: string[];
  allowedSide: "bid" | "ask" | undefined;
  maxSlippageBps: number;
  expiresInHours: number;
};

type Props = {
  initialValues?: Partial<MandateFormValues>;
  onSubmit: (values: MandateFormValues) => Promise<void>;
  onChangeValues?: (values: MandateFormValues) => void;
  submitLabel: string;
  isLoading: boolean;
  error?: string;
};

const DEFAULTS: MandateFormValues = {
  maxNotionalQuote: 5,
  maxCumulativeNotionalQuote: 25,
  allowedPairs: ["SUI_DBUSDC"],
  allowedSide: "bid",
  maxSlippageBps: 50,
  expiresInHours: 24,
};

function FieldIcon({ children }: { children: ReactNode }) {
  return (
    <span className="grid h-8 w-8 shrink-0 place-items-center rounded-[8px] border border-white/15 bg-black/40 text-zinc-100">
      {children}
    </span>
  );
}

function FieldRow({
  icon,
  label,
  children,
}: {
  icon: ReactNode;
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="grid gap-1.5 md:grid-cols-[40px_minmax(132px,182px)_minmax(0,1fr)] md:items-center">
      <FieldIcon>{icon}</FieldIcon>
      <div className="flex items-center gap-2.5">
        <span className="font-mono text-[10px] uppercase tracking-[0.1em] text-zinc-400">
          {label}
        </span>
        <span className="hidden h-[1px] flex-1 bg-[linear-gradient(90deg,rgba(255,255,255,0.2),transparent)] md:block" />
      </div>
      {children}
    </div>
  );
}

function NumericInput({
  value,
  onChange,
  suffix,
  min,
  max,
  step,
}: {
  value: number;
  onChange: (value: number) => void;
  suffix: string;
  min: number;
  max?: number;
  step: number;
}) {
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_60px] rounded-[10px] border border-white/15 bg-black/35">
      <input
        type="number"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="min-w-0 border-r border-white/10 bg-transparent px-3 py-2 font-mono text-[13px] text-zinc-100 outline-none placeholder:text-zinc-600 focus:bg-white/[0.03]"
        required
      />
      <div className="grid place-items-center px-1.5 font-mono text-[9px] uppercase tracking-[0.08em] text-zinc-400">
        {suffix}
      </div>
    </div>
  );
}

export function MandateForm({
  initialValues,
  onSubmit,
  onChangeValues,
  submitLabel,
  isLoading,
  error,
}: Props) {
  const [values, setValues] = useState<MandateFormValues>({ ...DEFAULTS, ...initialValues });

  useEffect(() => {
    onChangeValues?.(values);
  }, [onChangeValues, values]);

  function set<K extends keyof MandateFormValues>(key: K, value: MandateFormValues[K]) {
    setValues((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    await onSubmit(values);
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-2.5">
      <FieldRow
        label="Max trade size"
        icon={
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" className="h-4.5 w-4.5">
            <circle cx="12" cy="12" r="7" />
            <circle cx="12" cy="12" r="1.5" />
          </svg>
        }
      >
        <NumericInput
          value={values.maxNotionalQuote}
          onChange={(value) => set("maxNotionalQuote", value)}
          suffix="USDC"
          min={0.01}
          step={0.01}
        />
      </FieldRow>

      <FieldRow
        label="Max daily total"
        icon={
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" className="h-4.5 w-4.5">
            <path d="M5 18V13" />
            <path d="M10 18V9" />
            <path d="M15 18V5" />
            <path d="M20 18V11" />
          </svg>
        }
      >
        <NumericInput
          value={values.maxCumulativeNotionalQuote}
          onChange={(value) => set("maxCumulativeNotionalQuote", value)}
          suffix="USDC"
          min={0.01}
          step={0.01}
        />
      </FieldRow>

      <FieldRow
        label="Allowed pairs"
        icon={
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" className="h-4.5 w-4.5">
            <path d="M7 7h10" />
            <path d="M7 17h10" />
            <path d="M9 5 5 9l4 4" />
            <path d="m15 11 4 4-4 4" />
          </svg>
        }
      >
        <div className="relative">
          <select
            value={values.allowedPairs[0]}
            onChange={(e) => set("allowedPairs", [e.target.value])}
            className="w-full appearance-none rounded-[10px] border border-white/15 bg-black/35 px-3 py-2 font-mono text-[13px] text-zinc-100 outline-none transition focus:bg-white/[0.03]"
          >
            <option value="SUI_DBUSDC">SUI/USDC</option>
          </select>
          <span className="pointer-events-none absolute inset-y-0 right-3.5 flex items-center text-zinc-500">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" className="h-3.5 w-3.5">
              <path d="m6 9 6 6 6-6" />
            </svg>
          </span>
        </div>
      </FieldRow>

      <FieldRow
        label="Allowed side"
        icon={
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" className="h-4.5 w-4.5">
            <path d="M8 5v14" />
            <path d="m4 9 4-4 4 4" />
            <path d="M16 19V5" />
            <path d="m12 15 4 4 4-4" />
          </svg>
        }
      >
        <div className="grid grid-cols-3 rounded-[10px] border border-white/15 bg-black/35">
          {[
            { label: "BUY", value: "bid" as const },
            { label: "SELL", value: "ask" as const },
            { label: "BOTH", value: undefined },
          ].map((option) => {
            const active = values.allowedSide === option.value || (!values.allowedSide && option.value === undefined);
            return (
              <button
                key={option.label}
                type="button"
                onClick={() => set("allowedSide", option.value)}
                className={`border-r border-white/10 px-2 py-2 font-mono text-[12px] tracking-[0.07em] transition last:border-r-0 ${
                  active ? "bg-white/[0.06] text-zinc-100" : "text-zinc-500 hover:text-zinc-300"
                }`}
              >
                {option.label}
              </button>
            );
          })}
        </div>
      </FieldRow>

      <FieldRow
        label="Max slippage"
        icon={
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" className="h-4.5 w-4.5">
            <path d="M3 14c2 0 2-4 4-4s2 4 4 4 2-4 4-4 2 4 4 4 2-4 4-4" />
          </svg>
        }
      >
        <NumericInput
          value={values.maxSlippageBps}
          onChange={(value) => set("maxSlippageBps", value)}
          suffix="BPS"
          min={1}
          max={500}
          step={1}
        />
      </FieldRow>

      <FieldRow
        label="Mandate expires in"
        icon={
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" className="h-4.5 w-4.5">
            <circle cx="12" cy="12" r="8" />
            <path d="M12 7v5l3 2" />
          </svg>
        }
      >
        <div className="relative">
          <select
            value={values.expiresInHours}
            onChange={(e) => set("expiresInHours", Number(e.target.value))}
            className="w-full appearance-none rounded-[10px] border border-white/15 bg-black/35 px-3 py-2 font-mono text-[13px] text-zinc-100 outline-none transition focus:bg-white/[0.03]"
          >
            <option value={1}>1 hour</option>
            <option value={8}>8 hours</option>
            <option value={24}>24 hours</option>
            <option value={168}>7 days</option>
          </select>
          <span className="pointer-events-none absolute inset-y-0 right-3.5 flex items-center text-zinc-500">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" className="h-3.5 w-3.5">
              <path d="m6 9 6 6 6-6" />
            </svg>
          </span>
        </div>
      </FieldRow>

      {error ? (
        <div className="rounded-[12px] border border-[#ff4d24]/40 bg-[#120604] px-3 py-2 font-mono text-[10px] uppercase tracking-[0.07em] text-[#ff4d24]">
          {error}
        </div>
      ) : null}

      <div className="flex justify-end pt-2">
        <button
          type="submit"
          disabled={isLoading}
          className="inline-flex min-h-12 min-w-[200px] items-center justify-center rounded-[12px] border border-[#ff4d24] bg-[#d91717] px-4 py-2.5 font-mono text-[14px] uppercase tracking-[0.09em] text-white transition hover:bg-[#ea2424] disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isLoading ? "Saving..." : submitLabel}
        </button>
      </div>

      <input type="hidden" data-mandate-values={JSON.stringify(values)} />
    </form>
  );
}

export { DEFAULTS as mandateDefaults };
export type { MandateFormValues as MandateFormProps };
