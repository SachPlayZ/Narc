"use client";

import { useState } from "react";

type Props = {
  onOverrideResume: (reason: string) => Promise<{ digest: string }>;
  onAdjustMandate: () => void;
  onKeepPaused: () => void;
  isLoading: boolean;
  error?: string;
};

export function ResumeActions({ onOverrideResume, onAdjustMandate, onKeepPaused, isLoading, error }: Props) {
  const [reason, setReason] = useState("Manual override — reviewed incident");

  return (
    <div className="space-y-3">
      <div>
        <label className="block text-xs text-zinc-400 mb-1">Override reason</label>
        <input
          type="text"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          className="w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-zinc-100 text-sm focus:outline-none focus:border-zinc-500"
          placeholder="Reason for resuming…"
        />
      </div>

      <div className="flex flex-col gap-2">
        <button
          onClick={() => onOverrideResume(reason)}
          disabled={isLoading || !reason.trim()}
          className="w-full bg-orange-600 hover:bg-orange-500 disabled:opacity-50 text-white font-semibold py-2 px-4 rounded transition-colors"
        >
          {isLoading ? "Signing…" : "Override & Resume"}
        </button>

        <button
          onClick={onAdjustMandate}
          disabled={isLoading}
          className="w-full bg-zinc-700 hover:bg-zinc-600 disabled:opacity-50 text-zinc-100 font-medium py-2 px-4 rounded transition-colors"
        >
          Adjust mandate first
        </button>

        <button
          onClick={onKeepPaused}
          disabled={isLoading}
          className="w-full text-zinc-400 hover:text-zinc-300 text-sm py-2 transition-colors"
        >
          Keep paused — I&apos;ll investigate
        </button>
      </div>

      {error && <p className="text-red-400 text-sm">{error}</p>}
    </div>
  );
}
