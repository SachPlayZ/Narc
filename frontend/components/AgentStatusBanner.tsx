"use client";

type Props = {
  running: boolean;
  paused: boolean;
  mandateSummary: string;
};

export function AgentStatusBanner({ running, paused, mandateSummary }: Props) {
  if (paused) {
    return (
      <div className="flex items-center gap-2 px-4 py-2 bg-red-900/40 border border-red-600 rounded-lg text-sm">
        <span className="text-red-400 text-base">⬛</span>
        <span className="text-red-300 font-semibold">AGENT PAUSED</span>
      </div>
    );
  }

  if (running) {
    return (
      <div className="flex items-center gap-2 px-4 py-2 bg-green-900/30 border border-green-700 rounded-lg text-sm">
        <span className="inline-block w-2 h-2 rounded-full bg-green-400 animate-pulse" />
        <span className="text-green-400 font-semibold">Agent Running</span>
        {mandateSummary && (
          <span className="text-zinc-400 ml-2">{mandateSummary}</span>
        )}
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2 px-4 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-sm">
      <span className="inline-block w-2 h-2 rounded-full bg-zinc-500" />
      <span className="text-zinc-400">Agent stopped</span>
    </div>
  );
}
