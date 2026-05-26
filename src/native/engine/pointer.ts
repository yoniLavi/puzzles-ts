/**
 * Shared pointer button codes and action categorisation.
 *
 * Button codes mirror `PuzzleButton` in `src/puzzle/types.ts` but are
 * exported as plain `const` values (not an enum) so advisory diff
 * scripts can import them under Node's strip-only TS loader.
 *
 * `PointerAction` and `parsePointerAction` let games consume typed
 * press/drag/release events instead of raw button-number switches.
 * The "deliberately not handled" cases (e.g. Galaxies ignoring
 * `LEFT_DRAG`) become a discriminated case the compiler tracks.
 */

// --- button codes (matching PuzzleButton values) -------------------

export const LEFT_BUTTON = 0x0200;
export const MIDDLE_BUTTON = 0x0201;
export const RIGHT_BUTTON = 0x0202;
export const LEFT_DRAG = 0x0203;
export const MIDDLE_DRAG = 0x0204;
export const RIGHT_DRAG = 0x0205;
export const LEFT_RELEASE = 0x0206;
export const MIDDLE_RELEASE = 0x0207;
export const RIGHT_RELEASE = 0x0208;
export const CURSOR_UP = 0x0209;
export const CURSOR_DOWN = 0x020a;
export const CURSOR_LEFT = 0x020b;
export const CURSOR_RIGHT = 0x020c;
export const CURSOR_SELECT = 0x020d;
export const CURSOR_SELECT2 = 0x020e;

// --- PointerAction discriminated union ----------------------------

export type PointerButton = "left" | "middle" | "right";
export type CursorDirection = "up" | "down" | "left" | "right";

export type PointerAction =
  | { type: "press"; button: PointerButton }
  | { type: "drag"; button: PointerButton }
  | { type: "release"; button: PointerButton }
  | { type: "cursor"; direction: CursorDirection }
  | { type: "select" }
  | { type: "select2" }
  | { type: "other" };

/**
 * Categorise a raw button code into a typed `PointerAction`.
 * Games destructure on `action.type` instead of switching on
 * magic numbers. Unrecognised codes fall through to `{ type: "other" }`.
 */
export function parsePointerAction(button: number): PointerAction {
  if (button === LEFT_BUTTON) return { type: "press", button: "left" };
  if (button === MIDDLE_BUTTON) return { type: "press", button: "middle" };
  if (button === RIGHT_BUTTON) return { type: "press", button: "right" };
  if (button === LEFT_DRAG) return { type: "drag", button: "left" };
  if (button === MIDDLE_DRAG) return { type: "drag", button: "middle" };
  if (button === RIGHT_DRAG) return { type: "drag", button: "right" };
  if (button === LEFT_RELEASE) return { type: "release", button: "left" };
  if (button === MIDDLE_RELEASE) return { type: "release", button: "middle" };
  if (button === RIGHT_RELEASE) return { type: "release", button: "right" };
  if (button === CURSOR_UP) return { type: "cursor", direction: "up" };
  if (button === CURSOR_DOWN) return { type: "cursor", direction: "down" };
  if (button === CURSOR_LEFT) return { type: "cursor", direction: "left" };
  if (button === CURSOR_RIGHT) return { type: "cursor", direction: "right" };
  if (button === CURSOR_SELECT) return { type: "select" };
  if (button === CURSOR_SELECT2) return { type: "select2" };
  return { type: "other" };
}
