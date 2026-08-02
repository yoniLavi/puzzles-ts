/**
 * Spokes — types, the hub/spoke model, and the description codec.
 *
 * Port of the state half of `puzzles/unreleased/spokes.c` (© 2014 Lennard
 * Sprong). The whole game turns on one representation the C header states:
 * **a hub is eight spokes, each a 2-bit state** ({@link SPOKE_HIDDEN} = no line
 * is possible, {@link SPOKE_EMPTY} = undecided, {@link SPOKE_LINE} = drawn,
 * {@link SPOKE_MARKED} = ruled out) over the eight compass directions, packed
 * into one 16-bit word per cell. A spoke and its inverse on the neighbouring
 * hub are always kept in lock-step ({@link spokesPlace}), so an edge has one
 * state no matter which end you read it from.
 *
 * The clue on a hub is the number of `LINE` spokes it must end with; a clue of
 * `0` means "no hub here" (a hole).
 *
 * Two board shapes live here, and the distinction matters:
 * - {@link SpokesBoard} is the **mutable** working board the solver and the
 *   generator scribble on (upstream's `game_state` used as scratch);
 * - {@link SpokesState} is the game's **immutable** state — it structurally
 *   *is* a board, but `executeMove` clones before touching it, and `numbers`
 *   is shared by reference across every clone because clues never change
 *   after `newState` (the playbook's "shared frozen array" pattern; note
 *   `Object.freeze` throws on a populated typed array, so the `readonly` type
 *   is the whole guarantee).
 */

// --- spoke states -----------------------------------------------------------

/** No line is possible here (a board edge, or a hole's neighbour). */
export const SPOKE_HIDDEN = 0;
/** Default state: a line or a mark can be placed. */
export const SPOKE_EMPTY = 1;
/** Connected to the neighbouring hub. */
export const SPOKE_LINE = 2;
/** Ruled out by the player or the solver. */
export const SPOKE_MARKED = 3;

/** Every spoke `SPOKE_EMPTY` — upstream's `SPOKES_DEFAULT`. */
const SPOKES_DEFAULT = 0x5555;

// --- directions -------------------------------------------------------------

export const DIR_RIGHT = 0;
export const DIR_BOTRIGHT = 1;
export const DIR_BOT = 2;
export const DIR_BOTLEFT = 3;
export const DIR_LEFT = 4;
export const DIR_TOPLEFT = 5;
export const DIR_TOP = 6;
export const DIR_TOPRIGHT = 7;

/** The opposite direction — upstream's `INV_DIR`. */
export function invDir(d: number): number {
  return d ^ 4;
}

/** Grid step per direction, in `DIR_*` order. */
export const SPOKE_DIRS: readonly { readonly dx: number; readonly dy: number }[] = [
  { dx: 1, dy: 0 },
  { dx: 1, dy: 1 },
  { dx: 0, dy: 1 },
  { dx: -1, dy: 1 },
  { dx: -1, dy: 0 },
  { dx: -1, dy: -1 },
  { dx: 0, dy: -1 },
  { dx: 1, dy: -1 },
];

// --- difficulty -------------------------------------------------------------

export type SpokesDiff = "easy" | "tricky" | "hard";

/** Difficulty levels as the solver sees them (upstream's `DIFF_*` enum). The
 * solver compares and decrements these, so they stay numeric there even though
 * the params carry the readable string form. */
export const DIFF_EASY = 0;
export const DIFF_TRICKY = 1;
export const DIFF_HARD = 2;
export const DIFFCOUNT = 3;
/** `DIFF_EASY - 1`: the internal bounded tier the Tricky look-ahead recurses
 * at — an Easy pass capped at `ACTION_LIMIT` deductions. */
export const DIFF_LIMITED = DIFF_EASY - 1;

export const DIFFS: readonly SpokesDiff[] = ["easy", "tricky", "hard"];
export const DIFF_NAMES: readonly string[] = ["Easy", "Tricky", "Hard"];
const DIFF_CHARS = "eth";

export function diffToLevel(d: SpokesDiff): number {
  return DIFFS.indexOf(d);
}
export function diffFromLevel(level: number): SpokesDiff {
  return DIFFS[level] ?? "easy";
}
export function diffName(d: SpokesDiff): string {
  return DIFF_NAMES[diffToLevel(d)];
}

// --- params -----------------------------------------------------------------

export interface SpokesParams {
  w: number;
  h: number;
  diff: SpokesDiff;
}

/** Upstream `spokes_presets`; `DEFAULT_PRESET` is index 3. */
export const PRESETS: readonly SpokesParams[] = [
  { w: 4, h: 4, diff: "easy" },
  { w: 4, h: 4, diff: "tricky" },
  { w: 4, h: 4, diff: "hard" },
  { w: 6, h: 6, diff: "easy" },
  { w: 6, h: 6, diff: "tricky" },
  { w: 6, h: 6, diff: "hard" },
];

export function defaultParams(): SpokesParams {
  return { ...PRESETS[3] };
}

export function encodeParams(p: SpokesParams, full: boolean): string {
  const base = `${p.w}x${p.h}`;
  return full ? `${base}d${DIFF_CHARS[diffToLevel(p.diff)]}` : base;
}

export function decodeParams(s: string): SpokesParams {
  const p = defaultParams();
  let i = 0;
  const digits = (): number => {
    const start = i;
    while (i < s.length && s[i] >= "0" && s[i] <= "9") i++;
    return Number.parseInt(s.slice(start, i) || "0", 10);
  };
  p.w = digits();
  if (s[i] === "x") {
    i++;
    p.h = digits();
  } else {
    p.h = p.w;
  }
  if (s[i] === "d") {
    i++;
    // An unrecognised (or missing) letter leaves the difficulty invalid, which
    // `validateParams` rejects. Upstream stores an out-of-range integer here
    // and then never checks it (its `validate_params` tests only w and h), so
    // a game id like `6x6dz` would index `spokes_diffchars` out of bounds; the
    // extra check is a deliberate divergence, inert on the generator path.
    const idx = i < s.length ? DIFF_CHARS.indexOf(s[i]) : -1;
    p.diff = idx >= 0 ? diffFromLevel(idx) : ("invalid" as SpokesDiff);
    if (i < s.length) i++;
  }
  return p;
}

export function validateParams(p: SpokesParams, _full: boolean): string | null {
  if (p.w < 2) return "Width must be at least 2";
  if (p.h < 2) return "Height must be at least 2";
  if (DIFFS.indexOf(p.diff) < 0) return "Unknown difficulty rating";
  return null;
}

// --- boards -----------------------------------------------------------------

/** The mutable working board the solver and generator operate on. */
export interface SpokesBoard {
  readonly w: number;
  readonly h: number;
  /** Clue per cell: `0` = a hole (no hub), `1..8` = the required line count. */
  numbers: Int8Array;
  /** Packed hub per cell: eight 2-bit spokes, in `DIR_*` order. */
  spokes: Uint16Array;
}

/** Read spoke `d` out of a packed hub word. */
export function getSpoke(hub: number, d: number): number {
  return (hub >>> (d * 2)) & 3;
}

/** Write spoke `d` of cell `i` (one end only — see {@link spokesPlace}). */
export function setSpoke(spokes: Uint16Array, i: number, d: number, v: number): void {
  spokes[i] = (spokes[i] & ~(3 << (d * 2))) | (v << (d * 2));
}

/**
 * For each byte of a packed hub (four 2-bit spokes), how many of those four
 * are in each state, packed one count per byte:
 * `HIDDEN | EMPTY << 8 | LINE << 16 | MARKED << 24`.
 *
 * Two lookups and an add therefore give all four counts of a whole hub, with
 * no carry between the fields (each is at most 8). This matters: the solver's
 * recount runs three of these per cell, on every pass of a fixpoint that the
 * contradiction look-ahead re-enters `8 · 2 · cells` times per call, so it is
 * the hottest arithmetic in generation.
 */
const HALF_HUB_COUNTS = ((): Int32Array => {
  const t = new Int32Array(256);
  for (let b = 0; b < 256; b++) {
    let v = 0;
    for (let d = 0; d < 4; d++) v += 1 << (((b >>> (d * 2)) & 3) * 8);
    t[b] = v;
  }
  return t;
})();

/** All four of a hub's spoke-state counts at once, one per byte of the result
 * (see {@link HALF_HUB_COUNTS}). Read a single count with
 * `(spokeCounts(hub) >>> (state * 8)) & 0xff`. */
export function spokeCounts(hub: number): number {
  return HALF_HUB_COUNTS[hub & 0xff] + HALF_HUB_COUNTS[(hub >>> 8) & 0xff];
}

/** How many of a hub's eight spokes are in state `s`. */
export function spokesCount(hub: number, s: number): number {
  return (spokeCounts(hub) >>> (s * 8)) & 0xff;
}

/**
 * Set spoke `dir` of cell `i` **and its inverse on the neighbour**, so the two
 * ends of an edge never disagree (upstream `spokes_place`). Out-of-grid
 * neighbours are simply skipped.
 */
export function spokesPlace(b: SpokesBoard, i: number, dir: number, s: number): void {
  setSpoke(b.spokes, i, dir, s);
  const x = (i % b.w) + SPOKE_DIRS[dir].dx;
  const y = ((i / b.w) | 0) + SPOKE_DIRS[dir].dy;
  if (x >= 0 && x < b.w && y >= 0 && y < b.h) {
    setSpoke(b.spokes, y * b.w + x, invDir(dir), s);
  }
}

/**
 * The crossing partner of a diagonal spoke — the other diagonal of the unit
 * square it runs across, which cannot coexist with it as a line. `null` for an
 * orthogonal spoke (even `dir`), which crosses nothing.
 */
export function crossingSpoke(
  b: SpokesBoard,
  index: number,
  dir: number,
): { i: number; d: number } | null {
  if ((dir & 1) === 0) return null;
  const x = index % b.w;
  const y = (index / b.w) | 0;
  const { dx, dy } = SPOKE_DIRS[dir];
  const cx = Math.min(x, x + dx); // top-left cell of the square the diagonal spans
  const cy = Math.min(y, y + dy);
  // A ↘-family diagonal (dx === dy) is crossed by the ↙ from the top-right
  // cell; a ↙-family one by the ↘ from the top-left cell.
  return dx === dy
    ? { i: cy * b.w + (cx + 1), d: DIR_BOTLEFT }
    : { i: cy * b.w + cx, d: DIR_BOTRIGHT };
}

/**
 * Keep a diagonal line's *crossing* auto-ruled-out. Drawing a diagonal line
 * marks the crossing (two diagonals can't cross — the player can see it, so the
 * game does the bookkeeping); erasing that line clears the mark it placed. A
 * mark toggle has no crossing effect. `oldState` is the spoke's state before
 * this set, so an erase is distinguished from a mark-clear.
 */
export function syncDiagonalBlock(
  b: SpokesBoard,
  index: number,
  dir: number,
  oldState: number,
  newState: number,
): void {
  const c = crossingSpoke(b, index, dir);
  if (!c) return;
  if (newState === SPOKE_LINE) {
    if (getSpoke(b.spokes[c.i], c.d) === SPOKE_EMPTY) {
      spokesPlace(b, c.i, c.d, SPOKE_MARKED);
    }
  } else if (oldState === SPOKE_LINE && newState === SPOKE_EMPTY) {
    if (getSpoke(b.spokes[c.i], c.d) === SPOKE_MARKED) {
      spokesPlace(b, c.i, c.d, SPOKE_EMPTY);
    }
  }
}

/**
 * A fresh board: every clue `8`, every spoke `EMPTY`, then the three spokes
 * that point off each edge hidden (upstream `blank_game`).
 *
 * `into` reuses an existing board's arrays, mirroring upstream's
 * `blank_game(params, previous)` — the generator resets the same two boards
 * thousands of times, so that path stays allocation-free.
 */
export function blankBoard(w: number, h: number, into?: SpokesBoard): SpokesBoard {
  const b: SpokesBoard = into ?? {
    w,
    h,
    numbers: new Int8Array(w * h),
    spokes: new Uint16Array(w * h),
  };
  b.numbers.fill(8);
  b.spokes.fill(SPOKES_DEFAULT);

  for (let x = 0; x < w; x++) {
    const bottom = x + w * (h - 1);
    setSpoke(b.spokes, x, DIR_TOPLEFT, SPOKE_HIDDEN);
    setSpoke(b.spokes, x, DIR_TOP, SPOKE_HIDDEN);
    setSpoke(b.spokes, x, DIR_TOPRIGHT, SPOKE_HIDDEN);
    setSpoke(b.spokes, bottom, DIR_BOTLEFT, SPOKE_HIDDEN);
    setSpoke(b.spokes, bottom, DIR_BOT, SPOKE_HIDDEN);
    setSpoke(b.spokes, bottom, DIR_BOTRIGHT, SPOKE_HIDDEN);
  }
  for (let y = 0; y < h; y++) {
    const left = y * w;
    const right = y * w + (w - 1);
    setSpoke(b.spokes, left, DIR_TOPLEFT, SPOKE_HIDDEN);
    setSpoke(b.spokes, left, DIR_LEFT, SPOKE_HIDDEN);
    setSpoke(b.spokes, left, DIR_BOTLEFT, SPOKE_HIDDEN);
    setSpoke(b.spokes, right, DIR_TOPRIGHT, SPOKE_HIDDEN);
    setSpoke(b.spokes, right, DIR_RIGHT, SPOKE_HIDDEN);
    setSpoke(b.spokes, right, DIR_BOTRIGHT, SPOKE_HIDDEN);
  }
  return b;
}

/** Copy `from` into `to` (both must have the same dimensions). */
export function copyBoard(from: SpokesBoard, to: SpokesBoard): void {
  to.numbers.set(from.numbers);
  to.spokes.set(from.spokes);
}

/** A fresh board with the same contents. */
export function cloneBoard(b: SpokesBoard): SpokesBoard {
  return {
    w: b.w,
    h: b.h,
    numbers: Int8Array.from(b.numbers),
    spokes: Uint16Array.from(b.spokes),
  };
}

/**
 * Reset every placeable spoke to `EMPTY`, leaving hidden spokes hidden — the
 * "clear the board back to the clues" operation Solve and `findMistakes` both
 * need. Iterating `d < 4` through {@link spokesPlace} visits each edge exactly
 * once, from its lower-indexed end.
 */
export function clearBoard(b: SpokesBoard): void {
  for (let i = 0; i < b.w * b.h; i++) {
    if (b.spokes[i] === 0) continue;
    for (let d = 0; d < 4; d++) {
      if (getSpoke(b.spokes[i], d) !== SPOKE_HIDDEN) spokesPlace(b, i, d, SPOKE_EMPTY);
    }
  }
}

// --- description codec ------------------------------------------------------

/**
 * A description is exactly `w*h` characters in row-major order: a clue digit
 * `'0'`–`'8'`, or `'X'` for a hand-authored hole. Deliberately *not*
 * run-length — the generator only ever emits digits, and a flat grid keeps the
 * byte-match differential a plain string compare.
 */
export function validateDesc(p: SpokesParams, desc: string): string | null {
  const s = p.w * p.h;
  for (let i = 0; i < s; i++) {
    if (i >= desc.length) return "Description too short";
    const c = desc[i];
    if ((c >= "0" && c <= "8") || c === "X") continue;
    return "Invalid character in description";
  }
  if (desc.length > s) return "Description too long";
  return null;
}

// --- game state -------------------------------------------------------------

export interface SpokesState extends SpokesBoard {
  readonly params: SpokesParams;
  /** Clues; never mutated after `newState`, so clones share the one array. */
  readonly numbers: Int8Array;
  spokes: Uint16Array;
  completed: boolean;
  cheated: boolean;
}

/**
 * Decode a description into the starting board (upstream `new_game`).
 *
 * The hole pass is order-sensitive and mutates as it goes, exactly as the C:
 * a `0` cell loses all its own spokes and every neighbour's spoke pointing at
 * it, while an `'X'` cell (read as clue `-1` before being normalised to `0`)
 * *additionally* hides the four diagonals that would graze past it — so `X`
 * carves a wider hole than `0`, and the two are not interchangeable.
 */
export function newState(p: SpokesParams, desc: string): SpokesState {
  const { w, h } = p;
  const b = blankBoard(w, h);

  for (let i = 0; i < w * h; i++) {
    const c = desc.charCodeAt(i);
    b.numbers[i] = c >= 48 && c <= 56 ? c - 48 : -1;
  }

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (b.numbers[i] > 0) continue;

      b.spokes[i] = 0;
      for (let d = 0; d < 8; d++) {
        const dx = x + SPOKE_DIRS[d].dx;
        const dy = y + SPOKE_DIRS[d].dy;
        if (dx < 0 || dx >= w || dy < 0 || dy >= h) continue;
        setSpoke(b.spokes, dy * w + dx, invDir(d), SPOKE_HIDDEN);
      }

      // Only an 'X' hole (clue -1) also blocks the diagonals grazing past it.
      if (b.numbers[i] !== 0) {
        if (x > 0) {
          setSpoke(b.spokes, i - 1, DIR_TOPRIGHT, SPOKE_HIDDEN);
          setSpoke(b.spokes, i - 1, DIR_BOTRIGHT, SPOKE_HIDDEN);
        }
        if (x < w - 1) {
          setSpoke(b.spokes, i + 1, DIR_TOPLEFT, SPOKE_HIDDEN);
          setSpoke(b.spokes, i + 1, DIR_BOTLEFT, SPOKE_HIDDEN);
        }
        if (y > 0) {
          setSpoke(b.spokes, i - w, DIR_BOTLEFT, SPOKE_HIDDEN);
          setSpoke(b.spokes, i - w, DIR_BOTRIGHT, SPOKE_HIDDEN);
        }
        if (y < h - 1) {
          setSpoke(b.spokes, i + w, DIR_TOPLEFT, SPOKE_HIDDEN);
          setSpoke(b.spokes, i + w, DIR_TOPRIGHT, SPOKE_HIDDEN);
        }
        b.numbers[i] = 0;
      }
    }
  }

  return {
    w,
    h,
    params: p,
    numbers: b.numbers,
    spokes: b.spokes,
    completed: false,
    cheated: false,
  };
}

/** A new state sharing the (immutable) clues and copying the spokes. */
export function cloneState(s: SpokesState): SpokesState {
  return {
    w: s.w,
    h: s.h,
    params: s.params,
    numbers: s.numbers,
    spokes: Uint16Array.from(s.spokes),
    completed: s.completed,
    cheated: s.cheated,
  };
}

// --- moves and ui -----------------------------------------------------------

export type SpokesMove =
  | { kind: "set"; index: number; dir: number; state: number }
  | {
      kind: "solve";
      spokes: readonly { index: number; dir: number; state: number }[];
    };

/**
 * A spoke the unique solution contradicts — the `findMistakes` payload. A
 * drawn line the solution does not have (`"line"`), or a mark where the
 * solution needs a line (`"mark"`). A line the solution needs but the player
 * has not drawn yet is merely incomplete, never a mistake.
 */
export interface SpokesMistake {
  kind: "line" | "mark";
  index: number;
  dir: number;
}

export type SpokesDrag = "none" | "left" | "right";

export interface SpokesUi {
  /** Cell the current drag started from, or `-1`. */
  dragStart: number;
  /** Cell the drag currently points at, or `-1` (dead zone / off-grid). */
  dragEnd: number;
  drag: SpokesDrag;
  /** Whether the keyboard cursor is visible. */
  cshow: boolean;
  /** Cursor position on the `(3w−2) × (3h−2)` half-grid: a hub sits on a
   * sub-cell ≡ 0 (mod 3), and the two between each pair of hubs are that
   * pair's direction pickers. */
  cx: number;
  cy: number;
  /** Fork aid: grey out a hub once its spoke count matches its clue. Visual
   * only — a satisfied hub stays fully editable. */
  markSatisfied: boolean;
}

export function newUi(): SpokesUi {
  return {
    dragStart: -1,
    dragEnd: -1,
    drag: "none",
    cshow: false,
    cx: 0,
    cy: 0,
    markSatisfied: true,
  };
}

// --- text format ------------------------------------------------------------

/** The ASCII board (upstream `game_text_format`): clue digits with `-`, `|`,
 * `\` and `/` for the drawn lines, a space for anything else. */
export function textFormat(s: SpokesState): string {
  const { w, h } = s;
  const out: string[] = [];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      out.push(s.numbers[i] ? String(s.numbers[i]) : " ");
      out.push(
        x === w - 1
          ? "\n"
          : getSpoke(s.spokes[i], DIR_RIGHT) === SPOKE_LINE
            ? "-"
            : " ",
      );
    }
    if (y === h - 1) break;
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      out.push(getSpoke(s.spokes[i], DIR_BOT) === SPOKE_LINE ? "|" : " ");
      out.push(
        x === w - 1
          ? "\n"
          : getSpoke(s.spokes[i], DIR_BOTRIGHT) === SPOKE_LINE
            ? "\\"
            : getSpoke(s.spokes[i + 1], DIR_BOTLEFT) === SPOKE_LINE
              ? "/"
              : " ",
      );
    }
  }
  return out.join("");
}
