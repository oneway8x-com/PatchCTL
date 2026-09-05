import { defineConfig } from "tsdown";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm", "cjs"],
  dts: true,
  outDir: "dist",
  clean: process.argv.includes("--watch") ? false : true,
  treeshake: true,
  external: [
    // Don't bundle common peer dependencies
    "class-transformer",
    "class-validator",
  ],
});
