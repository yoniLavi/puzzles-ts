/**
 * The border-marking grid: the mechanic Palisade and Separate share.
 *
 * Both games divide a square grid into regions by marking the edges *between*
 * cells with a tri-state — wall / not-a-wall / undecided — and differ only in
 * what constrains the regions (Palisade counts each cell's walls, Separate fixes
 * region sizes and keeps marked cells apart). The mechanic the player operates
 * is one design, and before this module it existed as two byte-identical copies:
 * jscpd measured **466 duplicated lines** between the two games, the largest
 * cross-game duplication in the repository, including a 111-line `interpretMove`
 * that differed only in its type names.
 *
 * WHAT LIVES HERE is only what would have to change in both games at once to
 * keep them correct: the edge bit vocabulary, the geometry that turns a tile
 * size into a coordinate, and the input mechanic. Each game keeps its own clue
 * semantics, solver, generator, completion test and clue rendering — and its own
 * `Move` type, because the shared code reports *which edge and how its state
 * should cycle*, never a move. A shared move type would couple two save formats
 * that have no reason to be identical.
 *
 * WHAT DOES NOT live here is code that merely looks alike. A loop over `w*h`
 * that reads a flag and draws a line resembles its counterpart in any grid game
 * in this collection; unifying that would couple two renderers with no reason to
 * move together. The test is not "are these the same text" but *"would a change
 * here have to happen in both games at once?"*
 */
import { Dsf } from "./dsf.ts";
import {
  CURSOR_SELECT,
  CURSOR_SELECT2,
  cursorDelta,
  type GridCursor,
  LEFT_BUTTON,
  RIGHT_BUTTON,
} from "./pointer.ts";

// --- the edge bit vocabulary -----------------------------------------------
// A cell stores its four borders in the low nibble and their "definitely not a
// wall" companions in the high nibble, so one `number` per cell carries the
// whole tri-state. Upstream's encoding, kept because both games' descriptions
// and saves are written in terms of it.

export const BORDER_U = 1;
export const BORDER_R = 2;
export const BORDER_D = 4;
export const BORDER_L = 8;
export const BORDER_MASK = BORDER_U | BORDER_R | BORDER_D | BORDER_L;

/** The bit for direction `dir` (0=up, 1=right, 2=down, 3=left). */
export const BORDER = (dir: number): number => 1 << dir;

/** The "known not to be a wall" companion bit for a border bit. */
export const DISABLED = (border: number): number => border << 4;

/** The direction facing `dir` from the neighboring cell. */
export const FLIP = (dir: number): number => dir ^ 2;

export const DX = [0, +1, 0, -1] as const;
export const DY = [-1, 0, +1, 0] as const;

/** The tri-state a single edge can be in, as the input mechanic sees it. */
export const MAYBE = 0;
export const YES = 1;
export const NO = 2;

export function outOfBounds(x: number, y: number, w: number, h: number): boolean {
  return x < 0 || x >= w || y < 0 || y >= h;
}

export const clamp = (v: number, lo: number, hi: number): number =>
  v < lo ? lo : v > hi ? hi : v;

// --- geometry ---------------------------------------------------------------

/** Half a tile of slack around the grid, so a border on the outer edge is
 * clickable and drawable. */
export const margin = (ts: number): number => Math.floor(ts / 2);

/** Pixel coordinate → grid coordinate along one axis. */
export function fromCoord(coord: number, ts: number): number {
  return Math.floor((coord - margin(ts)) / ts);
}

// --- the input mechanic ------------------------------------------------------

/** The part of a game's state this mechanic reads. Both games' states satisfy
 * it structurally. */
export interface BorderGridState {
  w: number;
  h: number;
  borders: ArrayLike<number>;
}

/** The cursor state this mechanic maintains: the collection's shared
 * {@link GridCursor}, but read in HALF-cells — `(2x+1, 2y+1)` is the center of
 * cell `(x,y)`, so an even coordinate names an edge and both-even a corner.
 * That is what lets one cursor address cells and the edges between them without
 * a second state variable, and it is why the traversal below is this module's
 * own rather than `pointer.ts`'s `moveCursor`. */
export interface BorderGridUi {
  cursor: GridCursor;
}

/** One cell's worth of bits to toggle. An edge always produces two of these —
 * a wall belongs to both cells it separates, and they must agree. */
export interface BorderEdit {
  x: number;
  y: number;
  flag: number;
}

/** What `interpretBorderGridInput` decided. `null` means "nothing happened";
 * `"ui"` means the cursor moved and the caller should return its own
 * `UI_UPDATE`; otherwise the edits to apply. */
export type BorderGridInput = BorderEdit[] | "ui" | null;

/**
 * Which edge a pointer press targets, and how its state should cycle.
 *
 * Left button cycles undecided → wall → undecided; right button cycles
 * undecided → not-a-wall → undecided. Returns the paired edits for the two
 * cells the edge separates, or `null` if the press did not land on exactly one
 * edge (a corner, the center of a tile, or outside the grid).
 *
 * Mutates `ui` to park the cursor on the edge that was hit and hide it, which is
 * what makes a subsequent keyboard press continue from where the mouse was.
 */
export function pointerEdge(
  state: BorderGridState,
  ui: BorderGridUi,
  px0: number,
  py0: number,
  ts: number,
  isLeftButton: boolean,
): BorderEdit[] | null {
  const { w, h, borders } = state;
  const gx = fromCoord(px0, ts);
  const gy = fromCoord(py0, ts);
  if (outOfBounds(gx, gy, w, h)) return null;

  // Find the edge of cell (gx,gy) closest to the click: eliminate the far half
  // on each axis, then the axis the click is further from. Exactly one bit
  // *always* survives — the three masks are not independent. The first leaves
  // one of {L,R}, the second one of {U,D}, and the third clears exactly one of
  // those two surviving pairs. So every click inside a cell resolves to an
  // edge, including one exactly on a corner or a center (which the tie-break
  // test pins), and the `dir === 4` exit below is defensive, not a rejection.
  let possible = BORDER_MASK;
  let px = (px0 - margin(ts)) % ts;
  let py = (py0 - margin(ts)) % ts;
  possible &= ~(2 * px < ts ? BORDER(1) : BORDER(3)); // R : L
  possible &= ~(2 * py < ts ? BORDER(2) : BORDER(0)); // D : U
  px = Math.min(px, ts - px);
  py = Math.min(py, ts - py);
  possible &= ~(px < py ? BORDER(0) | BORDER(2) : BORDER(3) | BORDER(1));

  let dir = 0;
  for (; dir < 4 && BORDER(dir) !== possible; dir++);
  if (dir === 4) return null; // defensive: see above, unreachable

  ui.cursor.x = clamp(2 * gx + 1 + DX[dir], 1, 2 * w - 1);
  ui.cursor.y = clamp(2 * gy + 1 + DY[dir], 1, 2 * h - 1);

  const hx = gx + DX[dir];
  const hy = gy + DY[dir];
  if (outOfBounds(hx, hy, w, h)) return null;

  ui.cursor.visible = false;

  const i = gy * w + gx;
  const cur =
    borders[i] & BORDER(dir) ? YES : borders[i] & DISABLED(BORDER(dir)) ? NO : MAYBE;
  const next = isLeftButton ? (cur === YES ? MAYBE : YES) : cur === NO ? MAYBE : NO;

  let gdiff = 0;
  if ((cur === YES) !== (next === YES)) gdiff |= BORDER(dir);
  if ((cur === NO) !== (next === NO)) gdiff |= DISABLED(BORDER(dir));
  if (gdiff === 0) return null;

  // The neighbor's bits are the same toggles seen from the other side: shift
  // each nibble from `dir` to the facing direction.
  const hdiff =
    ((gdiff >> dir) << FLIP(dir)) | ((gdiff >> (dir + 4)) << (FLIP(dir) + 4));
  return [
    { x: gx, y: gy, flag: gdiff },
    { x: hx, y: hy, flag: hdiff },
  ];
}

/** Move the half-cell cursor by one step, clamped inside the grid. Named apart
 * from `pointer.ts`'s `moveCursor` because the traversal genuinely differs: a
 * step here crosses half a cell, from an edge to a center or back. */
export function moveBorderCursor(
  ui: BorderGridUi,
  d: { dx: number; dy: number },
  w: number,
  h: number,
): void {
  ui.cursor.visible = true;
  ui.cursor.x = clamp(ui.cursor.x + d.dx, 1, 2 * w - 1);
  ui.cursor.y = clamp(ui.cursor.y + d.dy, 1, 2 * h - 1);
}

/**
 * What a select keypress on the cursor's current position should do.
 *
 * The first press only reveals a hidden cursor. On an edge, `select` toggles the
 * wall and `select2` toggles the not-a-wall mark — except that either press on
 * an edge already marked the *other* way clears it, which is what the key table
 * below encodes. A corner or tile center means nothing.
 */
export function selectEdge(
  state: BorderGridState,
  ui: BorderGridUi,
  isSelect2: boolean,
): BorderGridInput {
  const { w, borders } = state;
  const px = ui.cursor.x % 2;
  const py = ui.cursor.y % 2;
  const gx = Math.floor(ui.cursor.x / 2);
  const gy = Math.floor(ui.cursor.y / 2);
  const dir = px === 0 ? 3 : 0; // left : up
  const hx = gx + DX[dir];
  const hy = gy + DY[dir];
  const i = gy * w + gx;

  if (!ui.cursor.visible) {
    ui.cursor.visible = true;
    return "ui";
  }
  if (px === py) return null; // a corner or center: no edge

  const key =
    (isSelect2 ? 1 : 0) |
    (((borders[i] & BORDER(dir)) >> dir) << 1) |
    (((borders[i] & DISABLED(BORDER(dir))) >> dir) >> 2);

  // key: MAYBE_LEFT=0, MAYBE_RIGHT=1, ON_LEFT=2, ON_RIGHT=3, OFF_LEFT=4, OFF_RIGHT=5
  if (key === 0 || key === 2 || key === 3) {
    return [
      { x: gx, y: gy, flag: BORDER(dir) },
      { x: hx, y: hy, flag: BORDER(FLIP(dir)) },
    ];
  }
  return [
    { x: gx, y: gy, flag: DISABLED(BORDER(dir)) },
    { x: hx, y: hy, flag: DISABLED(BORDER(FLIP(dir))) },
  ];
}

// --- border-array construction and connectivity ------------------------------

/** A fresh border byte array with only the grid-rim walls set. */
export function initBorders(w: number, h: number): Uint8Array {
  const borders = new Uint8Array(w * h);
  const wh = w * h;
  for (let c = 0; c < w; c++) {
    borders[c] |= BORDER_U;
    borders[wh - 1 - c] |= BORDER_D;
  }
  for (let r = 0; r < h; r++) {
    borders[r * w] |= BORDER_L;
    borders[wh - 1 - r * w] |= BORDER_R;
  }
  return borders;
}

/**
 * Connected components along `borders`.
 *
 * `black=true` merges across an edge with **no wall** — the regions the walls
 * actually divide the grid into. `black=false` merges only across an edge
 * explicitly marked *not* a wall — the components the player has committed to
 * being one region, which is what error highlighting needs, since a merely
 * undecided edge proves nothing.
 */
export function buildDsf(
  w: number,
  h: number,
  borders: Uint8Array,
  black: boolean,
): Dsf {
  const dsf = new Dsf(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (
        x + 1 < w &&
        (black ? !(borders[i] & BORDER_R) : borders[i] & DISABLED(BORDER_R))
      )
        dsf.merge(i, i + 1);
      if (
        y + 1 < h &&
        (black ? !(borders[i] & BORDER_D) : borders[i] & DISABLED(BORDER_D))
      )
        dsf.merge(i, i + w);
    }
  }
  return dsf;
}

/**
 * The whole input mechanic: dispatch a button press to the pointer, cursor or
 * select path and report what it decided.
 *
 * The caller supplies the tile size and turns the resulting edits into its own
 * `Move`. That split is deliberate — this module knows which edge was addressed
 * and how its tri-state should cycle; only the game knows what a move of its own
 * looks like, and coupling the two would couple two save formats.
 */
export function interpretBorderGridInput(
  state: BorderGridState,
  ui: BorderGridUi,
  p: { x: number; y: number },
  button: number,
  ts: number,
): BorderGridInput {
  if (button === LEFT_BUTTON || button === RIGHT_BUTTON) {
    return pointerEdge(state, ui, p.x, p.y, ts, button === LEFT_BUTTON);
  }

  const d = cursorDelta(button);
  if (d) {
    moveBorderCursor(ui, d, state.w, state.h);
    return "ui";
  }

  if (button === CURSOR_SELECT || button === CURSOR_SELECT2) {
    return selectEdge(state, ui, button === CURSOR_SELECT2);
  }

  return null;
}
