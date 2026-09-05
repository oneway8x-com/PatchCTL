import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: [
    "@corely/contracts",
    "@corely/modules-todos",
    "@corely/modules-patches",
    "@corely/ui",
  ],
  outputFileTracingRoot: path.join(process.cwd(), "../.."),
};

export default nextConfig;
