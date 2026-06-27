import type { GameDrawing } from "../../engine/game.ts";
import type { SoloDrawState, SoloState } from "./state.ts";

/** TODO: imperative redraw with a per-tile cache + first-draw bg fill. */
export function redrawSolo(
  _dr: GameDrawing,
  _ds: SoloDrawState | null,
  _prev: SoloState | null,
  _s: SoloState,
): void {
  throw new Error("solo render: not implemented");
}
