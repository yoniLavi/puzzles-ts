import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
    environment: "node",
    // The heaviest suites (recording-solver / A* hint planners run across many
    // generated boards) take a few seconds each even unloaded, and far longer when
    // the machine is under heavy external load — the 5s default flakes the husky
    // pre-commit gate. A high per-test ceiling only costs wall-time on a genuinely
    // hung test (and the hint/solver loops are already bounded by `stepBudget`), so
    // raise it well clear of load spikes. Individual tests still set tighter explicit
    // timeouts where a fast bound is meaningful.
    testTimeout: 60_000,
    hookTimeout: 60_000,
  },
});
