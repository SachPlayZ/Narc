"use client";

import dynamic from "next/dynamic";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const WalletProviders = dynamic(
  () => import("./wallet-providers").then((m) => m.WalletProviders),
  { ssr: false }
);

const queryClient = new QueryClient();

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>
      <WalletProviders>
        {children}
      </WalletProviders>
    </QueryClientProvider>
  );
}
