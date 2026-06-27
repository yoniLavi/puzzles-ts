import type { RandomState } from "../../random/index.ts";
import type { SoloParams } from "./state.ts";

/** TODO: port the upstream generator (uniqueness/difficulty loop). */
export function newSoloDesc(_p: SoloParams, _rng: RandomState): { desc: string } {
  throw new Error("solo generator: not implemented");
}
