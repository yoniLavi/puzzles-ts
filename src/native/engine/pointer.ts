/**
 * Shared pointer button codes.
 *
 * Button codes mirror `PuzzleButton` in `src/puzzle/types.ts` but are
 * exported as plain `const` values (not an enum) so advisory diff
 * scripts can import them under Node's strip-only TS loader.
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

// --- cursor movement -----------------------------------------------

/** Unit grid delta for a cursor-direction button, or `null` for any
 * other button. Per-game clamping, bounds, obstacle-skipping, and lock
 * modes stay local to each game; only the button→delta mapping is
 * shared. */
export function cursorDelta(button: number): { dx: number; dy: number } | null {
  switch (button) {
    case CURSOR_UP:
      return { dx: 0, dy: -1 };
    case CURSOR_DOWN:
      return { dx: 0, dy: 1 };
    case CURSOR_LEFT:
      return { dx: -1, dy: 0 };
    case CURSOR_RIGHT:
      return { dx: 1, dy: 0 };
    default:
      return null;
  }
}
