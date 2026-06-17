// On-demand config for the ADVISORY live Unruly differential check.
// Kept separate from vitest.config.ts so the commit/CI gate (which uses
// the default config, include `src/**`) never runs it. Usage:
//   cmake -B build/native -S puzzles -DUSE_TS_RANDOM=0
//   (cd build/native && make unruly-trace)
//   build/native/auxiliary/unruly-trace \
//     > src/native/games/unruly/__fixtures__/unruly-c-reference.json
//   npx vitest run --config scripts/diff-unruly.vitest.config.mts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["scripts/diff-unruly.test.ts"],
    environment: "node",
  },
});
