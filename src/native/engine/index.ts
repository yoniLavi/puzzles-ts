/**
 * The native-TS engine: the `Game` interface every port implements,
 * the `Midend` that orchestrates it, the per-game registry that is the
 * runtime hybrid decision point, and the clean save codec.
 *
 * See `openspec/specs/ts-engine/spec.md` for the capability contract.
 */

export { mkhighlight, mkhighlightBackground } from "./colour-mkhighlight.ts";
export { Dsf } from "./dsf.ts";
export type {
  ActiveHint,
  Game,
  GameDrawing,
  HintResult,
  HintStep,
  HintTrackVerdict,
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
export { parseLeadingInt } from "./params.ts";
export {
  CURSOR_DOWN,
  CURSOR_LEFT,
  CURSOR_RIGHT,
  CURSOR_SELECT,
  CURSOR_SELECT2,
  CURSOR_UP,
  LEFT_BUTTON,
  LEFT_DRAG,
  LEFT_RELEASE,
  MIDDLE_BUTTON,
  MIDDLE_DRAG,
  MIDDLE_RELEASE,
  RIGHT_BUTTON,
  RIGHT_DRAG,
  RIGHT_RELEASE,
} from "./pointer.ts";
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
