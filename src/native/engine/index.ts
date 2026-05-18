/**
 * The native-TS engine: the `Game` interface every port implements,
 * the `Midend` that orchestrates it, the per-game registry that is the
 * runtime hybrid decision point, and the clean save codec.
 *
 * See `openspec/specs/ts-engine/spec.md` for the capability contract.
 */

export type {
  Game,
  GameDrawing,
  PresetMenu,
  SolveResult,
  UiUpdate,
} from "./game.ts";
export { UI_UPDATE } from "./game.ts";
export {
  type EngineCore,
  Midend,
  type NotifyChange,
  type NotifyTimerState,
} from "./midend.ts";
export {
  _resetRegistry,
  createTsEngine,
  hasTsGame,
  registerGame,
} from "./registry.ts";
export {
  decodeSave,
  encodeSave,
  type SaveEnvelope,
} from "./save.ts";
