/**
 * Shared pointer button codes.
 *
 * Button codes mirror `PuzzleButton` in `./types.ts` but are
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

// --- mouse button class predicates (upstream IS_MOUSE_* macros) ----

// LEFT/MIDDLE/RIGHT are contiguous within each of the down/drag/release
// triples, so upstream's `IS_MOUSE_*` macros are a range check. Reproduced
// here so a drag game classifies a (already modifier-stripped) button without
// re-listing the three constants (27 ports had each written their own copy).

/** True for `LEFT_BUTTON` / `MIDDLE_BUTTON` / `RIGHT_BUTTON` (a press). */
export function isMouseDown(button: number): boolean {
  return button >= LEFT_BUTTON && button <= RIGHT_BUTTON;
}

/** True for `LEFT_DRAG` / `MIDDLE_DRAG` / `RIGHT_DRAG`. */
export function isMouseDrag(button: number): boolean {
  return button >= LEFT_DRAG && button <= RIGHT_DRAG;
}

/** True for `LEFT_RELEASE` / `MIDDLE_RELEASE` / `RIGHT_RELEASE`. */
export function isMouseRelease(button: number): boolean {
  return button >= LEFT_RELEASE && button <= RIGHT_RELEASE;
}

// --- the erase and cancel keys -------------------------------------

/** Upstream's `'\b'`. **This frontend never sends it** — see {@link isEraseKey}. */
export const BACKSPACE = 8;
/** Escape, delivered whenever no pointer gesture is in flight (`app-shell` spec,
 * "Escape reaches the puzzle when there is no gesture to cancel"). */
export const ESCAPE = 27;
/** What `puzzleKeyMap` actually sends for Backspace, Delete **and** Clear. */
export const DELETE = 127;

/**
 * **"Rub this out"** — clear a cell, delete a typed digit.
 *
 * Shared because getting it wrong is invisible and has happened seven times.
 * Upstream writes `button == '\b'`, and a faithful transcription is a **key that
 * can never fire**: this frontend maps Backspace to `127`, not `8`. Ascent,
 * Clusters, Sticks and Unruly each shipped an `8`-only test — Ascent's cost a
 * keyboard player any way to correct a typo mid-number — and Pearl and
 * Rectangles the same in their cancel arms.
 *
 * Both codes are accepted: `8` costs nothing and keeps upstream's binding true
 * for any frontend that does send it. The point is that no game decides this
 * again from memory (docs/games/input.md § "The numeric keypad never arrives").
 */
export function isEraseKey(button: number): boolean {
  return button === BACKSPACE || button === DELETE;
}

/**
 * **"Put it back down"** — abandon a drag or a keyboard selection, without
 * erasing anything.
 *
 * The erase keys plus Escape. A game with both an erase and a cancel meaning
 * tests them in separate branches; a game with only one of them uses only that
 * predicate. Exemplars: `slide` (cancel a keyboard grab), `pearl` and `rect`
 * (abandon a drag).
 */
export function isCancelKey(button: number): boolean {
  return button === ESCAPE || isEraseKey(button);
}

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

// --- the shared keyboard cursor --------------------------------------

/**
 * Where a game's keyboard cursor sits, and whether the player can see it.
 * One shape for the whole collection, held under `ui.cursor`.
 *
 * This is the **noun only**. What a game does while the cursor moves is its own
 * verb and stays in the game: Tents paints as it traverses, Boats drags a fill
 * along with it, Ascent remembers whether a mouse or the keyboard revealed it.
 * A genuinely different traversal — Palisade's and Separate's half-cell
 * coordinates, a lock mode, obstacle-skipping — likewise stays put; those keep
 * their own movement and share only the shape.
 */
export interface GridCursor {
  x: number;
  y: number;
  visible: boolean;
}

/** A cursor parked at `(x, y)`, hidden until the player asks for it. */
export function newCursor(x = 0, y = 0, visible = false): GridCursor {
  return { x, y, visible };
}

/**
 * Move `cursor` by one cursor-direction key on an axis-aligned `w × h` grid,
 * revealing it in the same press, and report whether anything changed.
 *
 * One press both reveals and moves, everywhere, so a keyboard player never
 * spends a keypress on the reveal (`ts-engine`, "One keyboard-cursor vocabulary
 * across games"). `wrap` moves toroidally instead of clamping, so an edge press
 * never no-ops.
 *
 * Returns `false` for a non-cursor button, and for a clamped edge press on an
 * already-visible cursor — the caller's cue to return `null` rather than a
 * `UI_UPDATE` for a press that did nothing.
 */
export function moveCursor(
  cursor: GridCursor,
  button: number,
  w: number,
  h: number,
  wrap = false,
): boolean {
  const moved = gridCursorMove(button, cursor.x, cursor.y, w, h, wrap);
  if (!moved) return isCursorMove(button) ? showCursor(cursor) : false;
  cursor.x = moved.x;
  cursor.y = moved.y;
  cursor.visible = true;
  return true;
}

/** Reveal `cursor` where it already is. True iff it was hidden. */
export function showCursor(cursor: GridCursor): boolean {
  if (cursor.visible) return false;
  cursor.visible = true;
  return true;
}

/** Hide `cursor` — a pointer press took over. True iff it was visible. */
export function hideCursor(cursor: GridCursor): boolean {
  if (!cursor.visible) return false;
  cursor.visible = false;
  return true;
}
