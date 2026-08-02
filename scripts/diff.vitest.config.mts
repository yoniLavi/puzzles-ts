// On-demand config for the ADVISORY, non-gating checks under scripts/.
// Kept separate from vitest.config.ts so the commit/CI gate (which uses the
// default config, include `src/**`) never runs these — they are slow, or they
// report rather than assert. Usage:
//   npm run diff                                                   # run them all
//   npx vitest run -c scripts/diff.vitest.config.mts -t collide    # one of them
//
// This used to also collect `scripts/diff-*.test.ts`, the per-game *live*
// differentials that generated boards from the C build and the TS port for the
// same seed. Those went game by game as each port landed, and the C build itself
// went with `retire-c-engine`; the frozen-fixture differentials in
// src/games/<game>/ are what survive, and they run in the gate. The glob went
// with them: a config entry that matches nothing is not where history goes, and
// it costs the next reader a trip to the filesystem to discover it is inert.
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: [
      "scripts/colour-inventory.test.ts",
      "scripts/colour-dark-check.test.ts",
      "scripts/colour-collide.test.ts",
    ],
    environment: "node",
  },
});
