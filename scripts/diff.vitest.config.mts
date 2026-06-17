// On-demand config for the ADVISORY live differential checks (all games).
// Kept separate from vitest.config.ts so the commit/CI gate (which uses the
// default config, include `src/**`) never runs these. Each diff test
// self-guards when its fixture or native trace binary is absent, so
// collecting them all under one config is safe. Usage:
//   ./scripts/build-native.sh <game>-trace   # for the games that shell a binary
//   npm run diff                              # run every advisory diff
//   npx vitest run -c scripts/diff.vitest.config.mts -t galaxies   # one game
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["scripts/diff-*.test.ts"],
    environment: "node",
  },
});
