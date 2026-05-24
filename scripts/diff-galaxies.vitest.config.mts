// On-demand config for the ADVISORY live Galaxies differential check.
// Kept separate from vitest.config.ts so the commit/CI gate (which
// uses the default config, include `src/**`) never runs it. Usage:
//   ./scripts/build-native.sh galaxies-trace
//   npx vitest run --config scripts/diff-galaxies.vitest.config.mts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["scripts/diff-galaxies.test.ts"],
    environment: "node",
  },
});
