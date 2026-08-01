import path from "node:path";
import type { NextConfig } from "next";

const workspaceRoot = path.resolve(__dirname, "../..");

const nextConfig: NextConfig = {
  output: "standalone",
  transpilePackages: ["@riskdelta/config", "@riskdelta/types", "@riskdelta/shared", "@riskdelta/policy-engine", "@riskdelta/risk-engine", "@riskdelta/ui"],
  experimental: {
    externalDir: true,
  },
  turbopack: {
    root: workspaceRoot,
  },
};

export default nextConfig;
