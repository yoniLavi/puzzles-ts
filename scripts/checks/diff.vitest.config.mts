// On-demand config for the ADVISORY, non-gating checks in this directory.
// Kept separate from vitest.config.ts so the commit/CI gate (which uses the
// default config, include `src/**`) never runs these — they are slow, or they
// report rather than assert. That exclusion is by construction rather than by
// luck: the gate's include is `src/**/*.test.ts`, and nothing here is under
// `src/`, which is the whole reason these four files sit in `scripts/checks/`
// instead of beside the tests they resemble. Usage:
//   npm run diff                                                          # all
//   npx vitest run -c scripts/checks/diff.vitest.config.mts -t collide    # one
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
      "scripts/checks/color-inventory.test.ts",
      "scripts/checks/color-dark-check.test.ts",
      "scripts/checks/color-collide.test.ts",
      "scripts/checks/hint-deixis.test.ts",
    ],
    environment: "node",
  },
});
