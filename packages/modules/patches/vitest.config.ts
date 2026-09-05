import { defineConfig } from "vitest/config";
export default defineConfig({ test: { name: "patches", environment: "node", include: ["src/**/*.test.ts"] } });
