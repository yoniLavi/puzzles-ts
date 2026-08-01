// On-demand config for the ADVISORY, non-gating checks under scripts/.
// Kept separate from vitest.config.ts so the commit/CI gate (which uses the
// default config, include `src/**`) never runs these — they are slow, or they
// report rather than assert. Usage:
//   npm run diff                                                   # run them all
//   npx vitest run -c scripts/diff.vitest.config.mts -t collide    # one of them
//
// This used to also collect the per-game live differential checks
// (`scripts/diff-*.test.ts`), which generated boards from the C build and the
// TS port for the same seed. Those went game by game as each port landed, and
// the C build itself went with `retire-c-engine`; the *frozen-fixture*
// differentials in src/native/games/<game>/ are what survive, and they run in
// the gate. The glob is kept because it costs nothing and reads as the history.
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: [
      "scripts/diff-*.test.ts",
      "scripts/colour-inventory.test.ts",
      "scripts/colour-dark-check.test.ts",
      "scripts/colour-collide.test.ts",
    ],
    environment: "node",
  },
});
