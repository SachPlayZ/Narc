import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Transpile workspace packages so Next.js can handle their ESM output
  transpilePackages: ["@narc/shared", "@narc/trader"],
};

export default nextConfig;
