import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: [
    "@corely/api-client",
    "@corely/contracts",
    "@corely/modules-todos",
    "@corely/ui",
  ],
  outputFileTracingRoot: path.join(process.cwd(), "../.."),
};

export default nextConfig;
