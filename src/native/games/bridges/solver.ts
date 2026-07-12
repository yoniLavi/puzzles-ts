/**
 * Bridges solver. STUB — the faithful multi-stage deductive solver
 * (stage1/2/3, map_group/map_group_check, dsf subgroup + loop-avoidance) that
 * both the generator's difficulty grading and the fork's `findMistakes`/`solve`
 * depend on lands in task 3 of add-bridges-ts-port.
 */
import type { BridgesState } from "./state.ts";

/**
 * Solve `state` in place from the clue-only position at `difficulty` (0/1/2).
 * Returns 1 if fully solved, 0 otherwise (C `solve_from_scratch`).
 */
export function solveFromScratch(_state: BridgesState, _difficulty: number): number {
  throw new Error("bridges solver: not implemented");
}
