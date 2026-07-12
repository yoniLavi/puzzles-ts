import type { RandomState } from "../../random/index.ts";
import type { BridgesParams } from "./state.ts";

/** TODO: port the upstream generator (uniqueness/difficulty loop). */
export function newBridgesDesc(_p: BridgesParams, _rng: RandomState): { desc: string } {
  throw new Error("bridges generator: not implemented");
}
