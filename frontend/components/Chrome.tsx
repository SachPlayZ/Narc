import type { ReactNode } from "react";

export const appAsset = (name: string) => `/narc-app/${name}`;

/** NARC dot-matrix wordmark (Doto) + corner logo mark. */
export function Logo({ size = "md" }: { size?: "sm" | "md" }) {
  const mark = size === "sm" ? "h-6 w-6" : "h-7 w-7";
  const word = size === "sm" ? "text-[20px]" : "text-[24px]";
  return (
    <span className="inline-flex items-center gap-2.5">
      <img src={appAsset("logo-mark.svg")} alt="" className={mark} />
      <span className={`font-display ${word} font-medium leading-none tracking-[0.18em] text-zinc-50`}>
        NARC
      </span>
    </span>
  );
}

/** Bordered status pill: icon + label + optional status dot. */
export function Pill({
  icon,
  label,
  dotClassName,
  className = "",
}: {
  icon?: ReactNode;
  label: ReactNode;
  dotClassName?: string;
  className?: string;
}) {
  return (
    <div
      className={`inline-flex h-9 items-center gap-2 rounded-[8px] border border-white/15 bg-black/50 px-3 font-mono text-[11px] uppercase tracking-[0.12em] text-zinc-200 ${className}`}
    >
      {icon}
      <span>{label}</span>
      {dotClassName ? <span className={`h-2 w-2 rounded-full ${dotClassName}`} /> : null}
    </div>
  );
}

/** Agent state pill — drives color + icon from status. */
export function StatusPill({ status }: { status: "running" | "paused" | "stopped" }) {
  if (status === "running") {
    return (
      <Pill
        icon={<span className="h-2 w-2 animate-pulse rounded-full bg-[#36d46c]" />}
        label="Agent Live"
        dotClassName="bg-[#36d46c]"
        className="text-[#36d46c]"
      />
    );
  }
  if (status === "paused") {
    return (
      <Pill
        icon={<img src={appAsset("icon-stop-sm.svg")} alt="" className="h-3.5 w-3.5" />}
        label="Agent Paused"
        dotClassName="bg-[#ff3b1f]"
        className="text-[#ff7a66]"
      />
    );
  }
  return (
    <Pill
      icon={<img src={appAsset("icon-stop-sm.svg")} alt="" className="h-3.5 w-3.5" />}
      label="Agent Stopped"
      dotClassName="bg-[#ff3b1f]"
      className="text-[#ff7a66]"
    />
  );
}

/** Bottom instrument rail — Walrus evidence ↔ Sui enforcement. */
export function FooterRail({ right = "Sui Enforcement" }: { right?: string }) {
  return (
    <footer className="border-t border-white/10 px-4 py-3 sm:px-8">
      <div className="mx-auto flex w-full max-w-[1680px] items-center justify-between gap-4 font-mono text-[10px] uppercase tracking-[0.14em] text-zinc-400">
        <div className="flex items-center gap-3">
          <img src={appAsset("icon-walrus.svg")} alt="" className="h-4 w-4 opacity-80" />
          <span>Walrus Evidence</span>
          <span className="h-2 w-2 rounded-full bg-[#36d46c]" />
        </div>
        <div className="hidden items-center gap-3 md:flex">
          <div className="h-[1px] w-20 bg-[linear-gradient(90deg,transparent,rgba(255,255,255,0.4),transparent)]" />
          <div className="flex items-center gap-2.5">
            {Array.from({ length: 13 }).map((_, index) => (
              <span
                key={index}
                className={`block h-3.5 w-[1px] ${index === 6 ? "bg-[#ff3b1f]" : "bg-white/40"}`}
              />
            ))}
          </div>
          <div className="h-[1px] w-20 bg-[linear-gradient(90deg,transparent,rgba(255,255,255,0.4),transparent)]" />
        </div>
        <div className="flex items-center gap-3">
          <span className="h-2 w-2 rounded-full bg-[#ff3b1f]" />
          <span>{right}</span>
          <img src={appAsset("icon-sui.svg")} alt="" className="h-4 w-4 opacity-80" />
        </div>
      </div>
    </footer>
  );
}

/** Faint side dot-grid decoration (page edges). */
export function EdgeDots() {
  return (
    <>
      <div className="pointer-events-none absolute inset-y-0 left-0 hidden w-40 bg-[radial-gradient(circle,rgba(255,255,255,0.18)_1px,transparent_1.6px)] bg-[length:18px_18px] opacity-40 lg:block" />
      <div className="pointer-events-none absolute inset-y-0 right-0 hidden w-40 bg-[radial-gradient(circle,rgba(255,255,255,0.18)_1px,transparent_1.6px)] bg-[length:18px_18px] opacity-40 lg:block" />
    </>
  );
}
