/**
 * Shared pointer and key button codes, and the predicates and cursor helpers
 * built on them. The codes match `PuzzleButton` in `./types.ts`.
 */

import type { Point } from "./types.ts";

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
// triples, so upstream's `IS_MOUSE_*` macros are range checks on an already
// modifier-stripped button.

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
 * **"Rub this out"**: clear a cell, delete a typed digit.
 *
 * Shared because getting it wrong is invisible. Upstream writes
 * `button == '\b'`, and a faithful transcription is a **key that can never
 * fire**: this frontend maps Backspace to `127`, not `8`, so an `8`-only test
 * leaves a keyboard player no way to correct a typo.
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

// --- the digit keys ------------------------------------------------

/**
 * **"Which digit is this key?"**: `0`–`9` for a digit key, `null` for anything
 * else.
 *
 * One frontend fact, answered here so no game spells the character range
 * again; hand-written copies disagreed about whether it began at `0` or `1`.
 * The guard in `emittable-keys.test.ts` keys on the literal codes rather than
 * on this name, so a hand-written copy is still caught.
 *
 * What this deliberately does **not** answer is the game's own half of the
 * question: the **bound** (`<= w`, `< n`, the cell's region size) and the
 * **meaning of `0`** (a clear in Seismic and Crossing, ten in Guess, sixteen in
 * Bridges, one more typed digit in Ascent). Those differ between games for
 * reasons about the puzzle, so each game keeps them beside its call.
 *
 * Modifier bits are looked through, because a numpad digit with Num Lock on
 * arrives as `MOD_NUM_KEYPAD | '7'` and *is* a press of 7: the keypad is a
 * convenience route to the same digit, never a different key
 * (docs/games/input.md § "The numeric keypad never arrives"). A game that gives
 * the **numpad's** digits another meaning — Ascent, Bricks, Cube and Twiddle use
 * them as a direction pad — resolves those before asking, as each already does.
 */
export function digitOf(button: number): number | null {
  const base = stripModifiers(button);
  return base >= 0x30 && base <= 0x39 ? base - 0x30 : null;
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
): Point | null {
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

/**
 * Where a pointer drag started and where it is now, held under `ui.drag`.
 *
 * The **noun only**, exactly as {@link GridCursor} is. What the press picked,
 * what the release commits and how the two positions are read stay in the game:
 * Boats snaps the drag to an axis, Pattern fills the rectangle between them,
 * Bridges resolves a target island from the direction. None of that is here.
 *
 * **The coordinate space is the game's.** Most of these hold grid cells; Rect
 * works in half-grid coordinates (0..2w, 0..2h) because its rectangles are
 * edge-aligned. A shared type holding two pairs has no opinion about that, and
 * must not grow one.
 *
 * **A class rather than an interface**, which is the one place this diverges
 * from `GridCursor`, and the reason is the midend. Nothing outside a game reads
 * a cursor, but a drag has to be *cancelable by the engine* when the board
 * changes under it — and the engine finds one by `instanceof` on the `Ui`'s own
 * values. Recognizing it by its field names instead would be a scan keyed on a
 * name, which is the failure this collection has hit most often. A game joins by
 * **having** one; there is nothing to declare and nothing to forget.
 */
export class GridDrag {
  /** Whether a drag is in progress. The one question every game asked its own
   * way — a `dragOk`, a `dragging`, or a `-1` in a coordinate. */
  live = false;
  /** Where the drag started. Meaningless while `live` is false. */
  sx = -1;
  sy = -1;
  /** Where the pointer is now, in the same space as the anchor. */
  ex = -1;
  ey = -1;
}

/** A drag that is not running. */
export function newDrag(): GridDrag {
  return new GridDrag();
}

/** Begin a drag at `(x, y)`: both ends start there. */
export function startDrag(drag: GridDrag, x: number, y: number): void {
  drag.live = true;
  drag.sx = drag.ex = x;
  drag.sy = drag.ey = y;
}

/**
 * Move a live drag's near end to `(x, y)`, and report whether that changed
 * anything.
 *
 * The return value is not decoration: several games already hand-roll this
 * predicate to suppress a repaint for a drag event that landed on the cell it
 * was already on, and it is the same predicate every time. `false` for a drag
 * that is not running, so a stray move event cannot start one.
 */
export function moveDrag(drag: GridDrag, x: number, y: number): boolean {
  if (!drag.live || (drag.ex === x && drag.ey === y)) return false;
  drag.ex = x;
  drag.ey = y;
  return true;
}

/** End the drag. True iff one was running — the caller's cue that there is
 * something to commit, or something to repaint. */
export function endDrag(drag: GridDrag): boolean {
  if (!drag.live) return false;
  drag.live = false;
  return true;
}

/**
 * End every {@link GridDrag} a `Ui` carries, and report how many were running.
 *
 * This is how the midend cancels a drag the board changed under: a game joins
 * by **having** a `GridDrag`, never by declaring that it does, which is the
 * collection's enrollment rule. Finding one by `instanceof` rather than by its
 * field names is the whole reason `GridDrag` is a class — a scan keyed on names
 * is the failure this repo has hit most often, and it would fail *silently*,
 * reporting that there was nothing to cancel.
 *
 * Only the `Ui`'s own enumerable values are looked at, one level deep. A drag
 * nested inside another object is not found, which is deliberate: one level is
 * where every game keeps it, and a deep walk would be a contract nobody asked
 * for over data the engine does not own.
 *
 * A game need not have a `Ui` at all — `newUi` is optional and two games have
 * genuinely nothing to remember — so anything that is not an object is simply
 * nothing to cancel.
 */
export function cancelDrags(ui: unknown): number {
  if (typeof ui !== "object" || ui === null) return 0;
  let ended = 0;
  for (const value of Object.values(ui)) {
    if (value instanceof GridDrag && endDrag(value)) ended++;
  }
  return ended;
}
