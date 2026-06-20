"use client";

import { useState } from "react";

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
  submitLabel: string;
  isLoading: boolean;
  error?: string;
};

const DEFAULTS: MandateFormValues = {
  maxNotionalQuote: 5,
  maxCumulativeNotionalQuote: 25,
  allowedPairs: ["SUI_DBUSDC"],
  allowedSide: undefined,
  maxSlippageBps: 50,
  expiresInHours: 24,
};

export function MandateForm({ initialValues, onSubmit, submitLabel, isLoading, error }: Props) {
  const [values, setValues] = useState<MandateFormValues>({ ...DEFAULTS, ...initialValues });

  function set<K extends keyof MandateFormValues>(k: K, v: MandateFormValues[K]) {
    setValues((prev) => ({ ...prev, [k]: v }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    await onSubmit(values);
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="block text-sm text-zinc-300 mb-1">Max trade size</label>
        <div className="flex items-center gap-2">
          <input
            type="number"
            min={0.01}
            step={0.01}
            value={values.maxNotionalQuote}
            onChange={(e) => set("maxNotionalQuote", Number(e.target.value))}
            className="w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-zinc-100 font-mono focus:outline-none focus:border-zinc-500"
            required
          />
          <span className="text-zinc-400 text-sm whitespace-nowrap">USDC</span>
        </div>
      </div>

      <div>
        <label className="block text-sm text-zinc-300 mb-1">Max daily total</label>
        <div className="flex items-center gap-2">
          <input
            type="number"
            min={0.01}
            step={0.01}
            value={values.maxCumulativeNotionalQuote}
            onChange={(e) => set("maxCumulativeNotionalQuote", Number(e.target.value))}
            className="w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-zinc-100 font-mono focus:outline-none focus:border-zinc-500"
            required
          />
          <span className="text-zinc-400 text-sm whitespace-nowrap">USDC</span>
        </div>
      </div>

      <div>
        <label className="block text-sm text-zinc-300 mb-1">Allowed pairs</label>
        <select
          value={values.allowedPairs[0]}
          onChange={(e) => set("allowedPairs", [e.target.value])}
          className="w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-zinc-100 focus:outline-none focus:border-zinc-500"
        >
          <option value="SUI_DBUSDC">SUI/USDC</option>
        </select>
      </div>

      <div>
        <label className="block text-sm text-zinc-300 mb-1">Allowed side</label>
        <select
          value={values.allowedSide ?? ""}
          onChange={(e) => set("allowedSide", (e.target.value || undefined) as "bid" | "ask" | undefined)}
          className="w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-zinc-100 focus:outline-none focus:border-zinc-500"
        >
          <option value="">Both</option>
          <option value="ask">Ask only</option>
          <option value="bid">Bid only</option>
        </select>
      </div>

      <div>
        <label className="block text-sm text-zinc-300 mb-1">Max slippage</label>
        <div className="flex items-center gap-2">
          <input
            type="number"
            min={1}
            max={500}
            step={1}
            value={values.maxSlippageBps}
            onChange={(e) => set("maxSlippageBps", Number(e.target.value))}
            className="w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-zinc-100 font-mono focus:outline-none focus:border-zinc-500"
            required
          />
          <span className="text-zinc-400 text-sm whitespace-nowrap">bps</span>
        </div>
      </div>

      <div>
        <label className="block text-sm text-zinc-300 mb-1">Mandate expires in</label>
        <select
          value={values.expiresInHours}
          onChange={(e) => set("expiresInHours", Number(e.target.value))}
          className="w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-zinc-100 focus:outline-none focus:border-zinc-500"
        >
          <option value={1}>1 hour</option>
          <option value={8}>8 hours</option>
          <option value={24}>24 hours</option>
          <option value={168}>7 days</option>
        </select>
      </div>

      {error && (
        <p className="text-red-400 text-sm">{error}</p>
      )}

      <button
        type="submit"
        disabled={isLoading}
        className="w-full bg-orange-600 hover:bg-orange-500 disabled:opacity-50 text-white font-semibold py-2 px-4 rounded transition-colors"
      >
        {isLoading ? "Saving…" : submitLabel}
      </button>

      {/* Expose values to parent for live preview */}
      <input type="hidden" data-mandate-values={JSON.stringify(values)} />
    </form>
  );
}

export { DEFAULTS as mandateDefaults };
export type { MandateFormValues as MandateFormProps };
