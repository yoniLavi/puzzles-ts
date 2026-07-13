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

// --- keyboard modifier masks (upstream puzzles.h) ------------------

/** Set by the frontend on a press/drag/release that came from a finger or a
 * pen. The midend strips it before `interpretMove` unless the game sets
 * `wantsStylusModifier` — see `Game.wantsStylusModifier` for why the default is
 * inverted from upstream's. */
export const MOD_STYLUS = 0x0800;
export const MOD_CTRL = 0x1000;
export const MOD_SHFT = 0x2000;
export const MOD_NUM_KEYPAD = 0x4000;
/** All modifier bits — `button & ~MOD_MASK` recovers the base button. */
export const MOD_MASK = 0x7800;

/** Strip every keyboard modifier bit, returning the base button code. */
export function stripModifiers(button: number): number {
  return button & ~MOD_MASK;
}

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

/** True iff `button` is one of the four cursor-direction keys. */
export function isCursorMove(button: number): boolean {
  return (
    button === CURSOR_UP ||
    button === CURSOR_DOWN ||
    button === CURSOR_LEFT ||
    button === CURSOR_RIGHT
  );
}

/**
 * Move a cursor on an axis-aligned `w × h` grid by a cursor-direction
 * button. Returns the new coordinates, or `null` when `button` is not a
 * cursor key or the move is a no-op against a clamped edge.
 *
 * Position-only by design: this never owns or mutates a game's `ui`. The
 * per-game policy that genuinely varies — which field holds the cursor,
 * `changed`-tracking, the "first arrow-press only reveals the cursor"
 * idiom, the null-vs-`UI_UPDATE` return — stays in each game. Custom
 * traversal (obstacle-skipping, lock modes, paint-while-traversing,
 * rolling cursors) keeps using `cursorDelta` or its own logic.
 *
 * With `wrap` false (default) the result is clamped to `[0, w) × [0, h)`;
 * with `wrap` true it wraps toroidally (so an edge move never no-ops).
 */
export function gridCursorMove(
  button: number,
  x: number,
  y: number,
  w: number,
  h: number,
  wrap = false,
): { x: number; y: number } | null {
  const delta = cursorDelta(button);
  if (!delta) return null;
  let nx = x + delta.dx;
  let ny = y + delta.dy;
  if (wrap) {
    nx = ((nx % w) + w) % w;
    ny = ((ny % h) + h) % h;
  } else {
    nx = Math.max(0, Math.min(w - 1, nx));
    ny = Math.max(0, Math.min(h - 1, ny));
  }
  if (nx === x && ny === y) return null;
  return { x: nx, y: ny };
}
