/**
 * Types and pure state helpers for Undead ("Haunted Mirror Mazes") — the
 * state/codec parts of `undead.c`.
 *
 * The board is a `w × h` grid embedded in a `(w+2) × (h+2)` array: the interior
 * cells are each either a fixed diagonal mirror (`\` = `CELL_MIRROR_L`, `/` =
 * `CELL_MIRROR_R`) or a monster cell, and the border cells carry the edge
 * sighting clues. The player places one of three monsters — Ghost (`1`),
 * Vampire (`2`), Zombie (`4`) — in each monster cell.
 *
 * The immutable, generation-derived data (the grid, the cell→monster-index map
 * `xinfo`, the per-type totals, the fixed-cell flags, and the traced sightlines
 * `paths`) lives in a shared {@link UndeadCommon}; the mutable per-move data
 * (`guess`, `pencils`, the live error overlays, the struck-clue flags) lives in
 * {@link UndeadState}, which references one `common` and clones cheaply.
 */

// --- difficulty ------------------------------------------------------------

export type Difficulty = "easy" | "normal" | "tricky";

export const DIFF_EASY = 0;
export const DIFF_NORMAL = 1;
export const DIFF_TRICKY = 2;
export const DIFFCOUNT = 3;
// No `Unreasonable` tier: the `strengthen-undead-deduction` re-grade measured a
// zero recursion-only residual — every uniquely-solvable Undead board is cracked
// by the deductive ladder (arc-consistency + exact counting + depth-1 forcing),
// so Easy/Normal/Tricky are all guess-free and the recursion-only candidates are
// exactly the non-unique boards (rejected by the uniqueness oracle anyway).

// undead_diffchars / undead_diffnames, indexed by level.
const DIFF_CHARS = "ent";
const DIFF_NAMES = ["Easy", "Normal", "Tricky"];
const DIFFS: Difficulty[] = ["easy", "normal", "tricky"];

export function diffToLevel(d: Difficulty): number {
  const i = DIFFS.indexOf(d);
  return i < 0 ? DIFF_NORMAL : i;
}
export function diffFromLevel(level: number): Difficulty {
  return DIFFS[level] ?? "normal";
}
export function diffChar(d: Difficulty): string {
  return DIFF_CHARS[diffToLevel(d)];
}
export function diffName(d: Difficulty): string {
  return DIFF_NAMES[diffToLevel(d)];
}

// --- cell states (upstream CELL_* enum) ------------------------------------

export const CELL_EMPTY = 0;
export const CELL_MIRROR_L = 1; // '\'
export const CELL_MIRROR_R = 2; // '/'
export const CELL_GHOST = 3;
export const CELL_VAMPIRE = 4;
export const CELL_ZOMBIE = 5;
export const CELL_UNDEF = 6;

// --- monster bitmask values ------------------------------------------------

export const MON_GHOST = 1;
export const MON_VAMPIRE = 2;
export const MON_ZOMBIE = 4;
export const MON_NONE = 7; // undecided (all candidates)

// --- grid walk directions (upstream DIRECTION_* enum) ----------------------

export const DIRECTION_NONE = 0;
export const DIRECTION_UP = 1;
export const DIRECTION_RIGHT = 2;
export const DIRECTION_LEFT = 3;
export const DIRECTION_DOWN = 4;

// --- params ----------------------------------------------------------------

export interface UndeadParams {
  w: number;
  h: number;
  diff: Difficulty;
}

/** Upstream `undead_presets`. */
export const PRESETS: UndeadParams[] = [
  { w: 4, h: 4, diff: "easy" },
  { w: 4, h: 4, diff: "normal" },
  { w: 4, h: 4, diff: "tricky" },
  { w: 5, h: 5, diff: "easy" },
  { w: 5, h: 5, diff: "normal" },
  { w: 5, h: 5, diff: "tricky" },
  { w: 7, h: 7, diff: "easy" },
  { w: 7, h: 7, diff: "normal" },
];

/** upstream DEFAULT_PRESET = 1 (4x4 Normal). */
export function defaultParams(): UndeadParams {
  return { ...PRESETS[1] };
}

export function encodeParams(p: UndeadParams, full: boolean): string {
  let s = `${p.w}x${p.h}`;
  if (full) s += `d${diffChar(p.diff)}`;
  return s;
}

export function decodeParams(s: string): UndeadParams {
  let i = 0;
  let digits = "";
  while (i < s.length && s[i] >= "0" && s[i] <= "9") digits += s[i++];
  const w = digits ? Number.parseInt(digits, 10) : 0;
  let h = w;
  if (s[i] === "x") {
    i++;
    digits = "";
    while (i < s.length && s[i] >= "0" && s[i] <= "9") digits += s[i++];
    h = digits ? Number.parseInt(digits, 10) : 0;
  }
  let diff: Difficulty = "normal";
  if (s[i] === "d") {
    i++;
    const idx = DIFF_CHARS.indexOf(s[i] ?? "");
    if (idx >= 0) diff = diffFromLevel(idx);
  }
  return { w, h, diff };
}

export function validateParams(p: UndeadParams, _full: boolean): string | null {
  if (p.w < 3) return "Width must be at least 3";
  if (p.h < 3) return "Height must be at least 3";
  if (p.w > Math.floor(54 / p.h)) return "Grid is too big";
  if (diffToLevel(p.diff) >= DIFFCOUNT) return "Unknown difficulty rating";
  return null;
}

// --- edge <-> grid mapping (range2grid / grid2range / num2grid) -------------

/** Map an edge position index (clockwise from the top-left) to the border cell
 * `(x, y)` and the inward direction a sightline entering there travels. */
export function range2grid(
  rangeno: number,
  width: number,
  height: number,
): { x: number; y: number; dir: number } {
  if (rangeno < 0) return { x: 0, y: 0, dir: DIRECTION_NONE };
  if (rangeno < width) return { x: rangeno + 1, y: 0, dir: DIRECTION_DOWN };
  rangeno -= width;
  if (rangeno < height) return { x: width + 1, y: rangeno + 1, dir: DIRECTION_LEFT };
  rangeno -= height;
  if (rangeno < width) return { x: width - rangeno, y: height + 1, dir: DIRECTION_UP };
  rangeno -= width;
  if (rangeno < height) return { x: 0, y: height - rangeno, dir: DIRECTION_RIGHT };
  return { x: 0, y: 0, dir: DIRECTION_NONE };
}

/** Inverse of {@link range2grid}: the edge index for a border cell, or `-1` for
 * an interior or corner cell. */
export function grid2range(x: number, y: number, w: number, h: number): number {
  if (x > 0 && x < w + 1 && y > 0 && y < h + 1) return -1;
  if (x < 0 || x > w + 1 || y < 0 || y > h + 1) return -1;
  if ((x === 0 || x === w + 1) && (y === 0 || y === h + 1)) return -1;
  if (y === 0) return x - 1;
  if (x === w + 1) return y - 1 + w;
  if (y === h + 1) return 2 * w + h - x;
  return 2 * (w + h) - y;
}

/** Interior cell `(x, y)` (1-based) for the `num`-th monster cell in reading
 * order. */
export function num2grid(num: number, width: number): { x: number; y: number } {
  return { x: 1 + (num % width), y: 1 + Math.floor(num / width) };
}

/** True iff `(x, y)` is one of the editable edge clue cells. */
export function isClue(w: number, h: number, x: number, y: number): boolean {
  if ((x === 0 || x === w + 1) && y > 0 && y <= h) return true;
  if ((y === 0 || y === h + 1) && x > 0 && x <= w) return true;
  return false;
}

/** Edge index of the clue cell `(x, y)`, or `-1`. */
export function clueIndex(w: number, h: number, x: number, y: number): number {
  if (y === 0) return x - 1;
  if (x === w + 1) return w + y - 1;
  if (y === h + 1) return 2 * w + h - x;
  if (x === 0) return 2 * (w + h) - y;
  return -1;
}

// --- shared immutable structure --------------------------------------------

export interface UndeadPath {
  length: number;
  /** `length` entries: monster index, or `-1` at a mirror. */
  p: Int32Array;
  /** `length` entries: the cell index `x + y·(w+2)` walked at each step. */
  xy: Int32Array;
  /** the distinct monster indices on this path, in traversal order. */
  mapping: Int32Array;
  /** count of distinct monsters on the path (the `mapping` length). */
  numMonsters: number;
  /** edge indices of the two ends. */
  gridStart: number;
  gridEnd: number;
  /** sighting clue at each end (filled from `grid` by {@link makePaths}). */
  sightingsStart: number;
  sightingsEnd: number;
}

export interface UndeadCommon {
  params: UndeadParams;
  w: number;
  h: number;
  /** (w+2)·(h+2). */
  wh: number;
  numGhosts: number;
  numVampires: number;
  numZombies: number;
  numTotal: number;
  /** `wh` cell types / border clue numbers. */
  grid: Int32Array;
  /** `wh` cell→monster-index map (`>=0` monster cell, `-1` mirror, `-2` clue). */
  xinfo: Int32Array;
  /** `numTotal` fixed-cell flags (hand-entered givens). */
  fixed: Uint8Array;
  /** `w + h` traced sightlines. */
  paths: UndeadPath[];
  numPaths: number;
}

/** Grid index for interior/border coordinates of `common`. */
export function gidx(common: UndeadCommon, x: number, y: number): number {
  return x + y * (common.w + 2);
}

/**
 * Trace every sightline of the maze (upstream `make_paths`). Reads
 * `common.grid` (mirrors + border clue numbers) and fills `common.paths`. The
 * `paths` array must already hold `numPaths` empty {@link UndeadPath} records
 * sized to `wh`.
 */
export function makePaths(common: UndeadCommon): void {
  const w = common.w;
  const h = common.h;
  const stride = w + 2;
  const grid = common.grid;
  const xinfo = common.xinfo;
  const paths = common.paths;
  let count = 0;

  for (let i = 0; i < 2 * (w + h); i++) {
    // Skip a path whose inverse we already traced.
    let found = false;
    for (let j = 0; j < count; j++) {
      if (i === paths[j].gridEnd) {
        found = true;
        break;
      }
    }
    if (found) continue;

    const path = paths[count];
    path.length = 0;
    path.gridStart = i;
    const g = range2grid(i, w, h);
    let x = g.x;
    let y = g.y;
    let dir = g.dir;
    path.sightingsStart = grid[x + y * stride];

    while (true) {
      if (dir === DIRECTION_DOWN) y++;
      else if (dir === DIRECTION_LEFT) x--;
      else if (dir === DIRECTION_UP) y--;
      else if (dir === DIRECTION_RIGHT) x++;

      const r = grid2range(x, y, w, h);
      if (r !== -1) {
        path.gridEnd = r;
        path.sightingsEnd = grid[x + y * stride];
        break;
      }

      const cell = x + y * stride;
      const c = grid[cell];
      path.xy[path.length] = cell;
      if (c === CELL_MIRROR_L) {
        path.p[path.length] = -1;
        if (dir === DIRECTION_DOWN) dir = DIRECTION_RIGHT;
        else if (dir === DIRECTION_LEFT) dir = DIRECTION_UP;
        else if (dir === DIRECTION_UP) dir = DIRECTION_LEFT;
        else if (dir === DIRECTION_RIGHT) dir = DIRECTION_DOWN;
      } else if (c === CELL_MIRROR_R) {
        path.p[path.length] = -1;
        if (dir === DIRECTION_DOWN) dir = DIRECTION_LEFT;
        else if (dir === DIRECTION_LEFT) dir = DIRECTION_DOWN;
        else if (dir === DIRECTION_UP) dir = DIRECTION_RIGHT;
        else if (dir === DIRECTION_RIGHT) dir = DIRECTION_UP;
      } else {
        path.p[path.length] = xinfo[cell];
      }
      path.length++;
    }

    // Count distinct monsters on the path.
    let numMonsters = 0;
    for (let j = 0; j < common.numTotal; j++) {
      let nseen = 0;
      for (let k = 0; k < path.length; k++) if (path.p[k] === j) nseen++;
      if (nseen > 0) numMonsters++;
    }
    path.numMonsters = numMonsters;

    // Build the mapping vector (distinct monster indices, traversal order).
    let c = 0;
    for (let pp = 0; pp < path.length; pp++) {
      const m = path.p[pp];
      if (m === -1) continue;
      let seen = false;
      for (let j = 0; j < c; j++) if (path.mapping[j] === m) seen = true;
      if (!seen) path.mapping[c++] = m;
    }
    count++;
  }
}

/** Stable sort of the traced paths by ascending monster count (upstream
 * `qsort(path_cmp)`; see design D1 — stability is all a TS-only game needs). */
export function sortPaths(common: UndeadCommon): void {
  common.paths.sort((a, b) => a.numMonsters - b.numMonsters);
}

function newPath(wh: number): UndeadPath {
  return {
    length: 0,
    p: new Int32Array(wh),
    xy: new Int32Array(wh),
    mapping: new Int32Array(wh),
    numMonsters: 0,
    gridStart: -1,
    gridEnd: -1,
    sightingsStart: 0,
    sightingsEnd: 0,
  };
}

/** Allocate a fresh `common` with empty grid/paths (the parts `newState` and the
 * generator both fill). */
export function newCommon(params: UndeadParams): UndeadCommon {
  const w = params.w;
  const h = params.h;
  const wh = (w + 2) * (h + 2);
  const numPaths = w + h;
  const paths: UndeadPath[] = [];
  for (let i = 0; i < numPaths; i++) paths.push(newPath(wh));
  return {
    params,
    w,
    h,
    wh,
    numGhosts: 0,
    numVampires: 0,
    numZombies: 0,
    numTotal: 0,
    grid: new Int32Array(wh),
    xinfo: new Int32Array(wh),
    fixed: new Uint8Array(0),
    paths,
    numPaths,
  };
}

// --- state -----------------------------------------------------------------

export interface UndeadState {
  common: UndeadCommon;
  /** `numTotal` monster bitmask per cell: 1 ghost, 2 vampire, 4 zombie, 7
   * undecided. */
  guess: Uint8Array;
  /** `numTotal` pencil-mark bitmasks (only meaningful while `guess === 7`). */
  pencils: Uint8Array;
  /** `wh` live cell-error flags. */
  cellErrors: Uint8Array;
  /** `2·numPaths` live edge-clue error flags (indexed by edge position). */
  hintErrors: Uint8Array;
  /** 3 live count-error flags (ghost / vampire / zombie). */
  countErrors: Uint8Array;
  /** `2·numPaths` struck-through ("done") flags per edge clue. */
  hintsDone: Uint8Array;
  solved: boolean;
  cheated: boolean;
}

export function cloneState(s: UndeadState): UndeadState {
  return {
    common: s.common,
    guess: s.guess.slice(),
    pencils: s.pencils.slice(),
    cellErrors: s.cellErrors.slice(),
    hintErrors: s.hintErrors.slice(),
    countErrors: s.countErrors.slice(),
    hintsDone: s.hintsDone.slice(),
    solved: s.solved,
    cheated: s.cheated,
  };
}

function blankState(common: UndeadCommon): UndeadState {
  return {
    common,
    guess: new Uint8Array(common.numTotal).fill(MON_NONE),
    pencils: new Uint8Array(common.numTotal),
    cellErrors: new Uint8Array(common.wh),
    hintErrors: new Uint8Array(2 * common.numPaths),
    countErrors: new Uint8Array(3),
    hintsDone: new Uint8Array(2 * common.numPaths),
    solved: false,
    cheated: false,
  };
}

// --- moves -----------------------------------------------------------------

export type UndeadMove =
  /** Place a monster (1/2/4) in cell `cell`. */
  | { type: "set"; cell: number; monster: number }
  /** Clear cell `cell` (back to undecided, drop pencils). */
  | { type: "clear"; cell: number }
  /** Toggle a pencil mark (1/2/4) in cell `cell`. */
  | { type: "pencil"; cell: number; monster: number }
  /** Clear a list of candidate bits across cells atomically (idempotent — a
   * re-applied strike never re-adds a candidate). The one-firing-one-step note
   * move used by the hint (`hint-authoring.md` §9.2); unlike `pencil` it is
   * resume-safe in a kept plan. */
  | { type: "pencilStrike"; marks: { cell: number; monster: number }[] }
  /** Fill every undecided cell with all candidate notes (`M`). */
  | { type: "markAll" }
  /** Toggle the struck-through ("done") state of edge clue `clue`. */
  | { type: "hintDone"; clue: number }
  /** Auto-solve: `placements[i]` is the monster (1/2/4) for cell `i`. */
  | { type: "solve"; placements: number[] };

// --- ui --------------------------------------------------------------------

export const COUNT_STYLE_TOTAL = 0;
export const COUNT_STYLE_REMAINING = 1;
export const COUNT_STYLE_PLACED_TOTAL = 2;
/** Fork addition (default): remaining-to-place / total-needed, e.g. `3/8`. */
export const COUNT_STYLE_REMAINING_TOTAL = 3;
export const N_COUNT_STYLE = 4;

export interface UndeadUi {
  hx: number;
  hy: number;
  hshow: boolean;
  hpencil: boolean;
  hcursor: boolean;
  /** Preference (`monsters`): false → pictures, true → letters. Also toggled by
   * the `a` key in play. */
  ascii: boolean;
  /** Preference (default off): keep the mouse highlight after a pencil change. */
  pencilKeepHighlight: boolean;
  /** Preference (default on, fork divergence): right-click toggles a sticky
   * pencil mode. */
  pencilSticky: boolean;
  /** Preference (`count-style`): 0 total, 1 remaining, 2 placed/total, 3
   * remaining/total (default). Set in Preferences only — no in-play toggle. */
  countStyle: number;
}

export function newUi(_state: UndeadState): UndeadUi {
  return {
    hx: 0,
    hy: 0,
    hshow: false,
    hpencil: false,
    hcursor: false,
    ascii: false,
    pencilKeepHighlight: false,
    pencilSticky: true,
    countStyle: COUNT_STYLE_REMAINING_TOTAL,
  };
}

// --- desc codec ------------------------------------------------------------

/** Populate a fresh `common` from `desc` (upstream `new_game`), returning the
 * decoded state. Throws on a malformed desc (callers that need a soft error use
 * {@link validateDesc} first). */
export function newState(params: UndeadParams, desc: string): UndeadState {
  const common = newCommon(params);
  const w = common.w;
  const h = common.h;
  const stride = w + 2;

  let pos = 0;
  const readInt = (): number => {
    let s = "";
    while (pos < desc.length && desc[pos] >= "0" && desc[pos] <= "9") s += desc[pos++];
    return s ? Number.parseInt(s, 10) : 0;
  };
  const expectComma = (): void => {
    if (desc[pos] !== ",") throw new Error("Faulty game description");
    pos++;
  };

  common.numGhosts = readInt();
  expectComma();
  common.numVampires = readInt();
  expectComma();
  common.numZombies = readInt();
  expectComma();
  common.numTotal = common.numGhosts + common.numVampires + common.numZombies;

  const state = blankState(common);
  common.fixed = new Uint8Array(common.numTotal);

  // Grid run-length walk.
  let count = 0; // monster index assigned so far
  let n = 0; // interior cell number (reading order)
  while (pos < desc.length && desc[pos] !== ",") {
    const c = desc[pos];
    if (c === "L" || c === "R") {
      const gg = num2grid(n, w);
      common.grid[gg.x + gg.y * stride] = c === "L" ? CELL_MIRROR_L : CELL_MIRROR_R;
      common.xinfo[gg.x + gg.y * stride] = -1;
      n++;
    } else if (c === "G" || c === "V" || c === "Z") {
      const gg = num2grid(n, w);
      common.grid[gg.x + gg.y * stride] =
        c === "G" ? CELL_GHOST : c === "V" ? CELL_VAMPIRE : CELL_ZOMBIE;
      common.xinfo[gg.x + gg.y * stride] = count;
      state.guess[count] = c === "G" ? MON_GHOST : c === "V" ? MON_VAMPIRE : MON_ZOMBIE;
      common.fixed[count] = 1;
      count++;
      n++;
    } else {
      let run = c.charCodeAt(0) - ("a".charCodeAt(0) - 1);
      while (run-- > 0) {
        const gg = num2grid(n, w);
        common.grid[gg.x + gg.y * stride] = CELL_EMPTY;
        common.xinfo[gg.x + gg.y * stride] = count;
        state.guess[count] = MON_NONE;
        common.fixed[count] = 0;
        count++;
        n++;
      }
    }
    pos++;
  }
  pos++; // skip the comma after the grid

  // Sightings into the border cells.
  for (let i = 0; i < 2 * (w + h); i++) {
    const sights = readInt();
    if (desc[pos] === ",") pos++; // upstream advances unconditionally; tolerate end
    const gg = range2grid(i, w, h);
    common.grid[gg.x + gg.y * stride] = sights;
    common.xinfo[gg.x + gg.y * stride] = -2;
  }

  // The four corners don't matter; zero them.
  for (const cell of [0, w + 1, w + 1 + (h + 1) * stride, (h + 1) * stride]) {
    common.grid[cell] = 0;
    common.xinfo[cell] = -2;
  }

  makePaths(common);
  sortPaths(common);
  return state;
}

export function validateDesc(p: UndeadParams, desc: string): string | null {
  const w = p.w;
  const h = p.h;
  const wh = w * h;
  let pos = 0;

  // Three leading counts.
  let monsterCount = 0;
  for (let i = 0; i < 3; i++) {
    if (pos >= desc.length || desc[pos] < "0" || desc[pos] > "9")
      return "Faulty game description";
    let s = "";
    while (pos < desc.length && desc[pos] >= "0" && desc[pos] <= "9") s += desc[pos++];
    monsterCount += Number.parseInt(s, 10);
    if (desc[pos] !== ",") return "Invalid character in number list";
    pos++;
  }

  // Grid.
  let area = 0;
  let monsters = 0;
  while (pos < desc.length && desc[pos] !== ",") {
    const c = desc[pos];
    if (c >= "a" && c <= "z") {
      const run = c.charCodeAt(0) - "a".charCodeAt(0) + 1;
      area += run;
      monsters += run;
    } else if (c === "G" || c === "V" || c === "Z") {
      area++;
      monsters++;
    } else if (c === "L" || c === "R") {
      area++;
    } else {
      return "Invalid character in grid specification";
    }
    pos++;
  }
  if (area < wh) return "Not enough data to fill grid";
  if (area > wh) return "Too much data to fill grid";
  if (monsters !== monsterCount) return "Monster numbers do not match grid spaces";

  // Sightings.
  for (let i = 0; i < 2 * (w + h); i++) {
    if (pos >= desc.length) return "Not enough numbers given after grid specification";
    if (desc[pos] !== ",") return "Invalid character in number list";
    pos++;
    while (pos < desc.length && desc[pos] >= "0" && desc[pos] <= "9") pos++;
  }
  if (pos < desc.length) return "Unexpected additional data at end of game description";
  return null;
}

// --- live error recomputation (check_numbers_draw + check_path_solution) ----

/**
 * Recompute the live legality overlays from `state.guess` (upstream
 * `execute_move`'s post-move sweep). Mutates `state.cellErrors`/`hintErrors`/
 * `countErrors`; returns whether the board is fully placed *and* legal (every
 * cell a single monster, all counts and sightings satisfied) — the completion
 * signal.
 */
export function recomputeErrors(state: UndeadState): boolean {
  const common = state.common;
  state.cellErrors.fill(0);
  state.hintErrors.fill(0);
  state.countErrors.fill(0);
  let correct = true;
  if (!checkNumbersDraw(state)) correct = false;
  for (let p = 0; p < common.numPaths; p++) {
    if (!checkPathSolution(state, p)) correct = false;
  }
  for (let i = 0; i < common.numTotal; i++) {
    const g = state.guess[i];
    if (g !== MON_GHOST && g !== MON_VAMPIRE && g !== MON_ZOMBIE) correct = false;
  }
  return correct;
}

function checkNumbersDraw(state: UndeadState): boolean {
  const common = state.common;
  const stride = common.w + 2;
  let cg = 0;
  let cv = 0;
  let cz = 0;
  for (let i = 0; i < common.numTotal; i++) {
    if (state.guess[i] === MON_GHOST) cg++;
    else if (state.guess[i] === MON_VAMPIRE) cv++;
    else if (state.guess[i] === MON_ZOMBIE) cz++;
  }
  let valid = true;
  const filled = cg + cv + cz >= common.numTotal;
  const totals = [common.numGhosts, common.numVampires, common.numZombies];
  const counts = [cg, cv, cz];
  const masks = [MON_GHOST, MON_VAMPIRE, MON_ZOMBIE];
  for (let t = 0; t < 3; t++) {
    if (counts[t] > totals[t] || (filled && counts[t] !== totals[t])) {
      valid = false;
      state.countErrors[t] = 1;
      for (let x = 1; x <= common.w; x++) {
        for (let y = 1; y <= common.h; y++) {
          const xy = x + y * stride;
          const xi = common.xinfo[xy];
          if (xi >= 0 && state.guess[xi] === masks[t]) state.cellErrors[xy] = 1;
        }
      }
    }
  }
  return valid;
}

function checkPathSolution(state: UndeadState, p: number): boolean {
  const common = state.common;
  const path = common.paths[p];
  let correct = true;

  // Forward (entering at gridStart).
  let count = 0;
  let mirror = false;
  let unfilled = 0;
  for (let i = 0; i < path.length; i++) {
    const m = path.p[i];
    if (m === -1) mirror = true;
    else {
      const g = state.guess[m];
      if (g === MON_GHOST && mirror) count++;
      else if (g === MON_VAMPIRE && !mirror) count++;
      else if (g === MON_ZOMBIE) count++;
      else if (g === MON_NONE) unfilled++;
    }
  }
  if (count > path.sightingsStart || count + unfilled < path.sightingsStart) {
    correct = false;
    state.hintErrors[path.gridStart] = 1;
  }

  // Backward (entering at gridEnd).
  count = 0;
  mirror = false;
  unfilled = 0;
  for (let i = path.length - 1; i >= 0; i--) {
    const m = path.p[i];
    if (m === -1) mirror = true;
    else {
      const g = state.guess[m];
      if (g === MON_GHOST && mirror) count++;
      else if (g === MON_VAMPIRE && !mirror) count++;
      else if (g === MON_ZOMBIE) count++;
      else if (g === MON_NONE) unfilled++;
    }
  }
  if (count > path.sightingsEnd || count + unfilled < path.sightingsEnd) {
    correct = false;
    state.hintErrors[path.gridEnd] = 1;
  }

  if (!correct) {
    for (let i = 0; i < path.length; i++) state.cellErrors[path.xy[i]] = 1;
  }
  return correct;
}

// --- status / text ---------------------------------------------------------

export function status(s: UndeadState): "solved" | "ongoing" {
  return s.solved ? "solved" : "ongoing";
}

/** ASCII board, matching `game_text_format`. */
export function textFormat(s: UndeadState): string {
  const common = s.common;
  const w = common.w;
  const h = common.h;
  const stride = w + 2;
  let out = `G: ${common.numGhosts} V: ${common.numVampires} Z: ${common.numZombies}\n\n`;
  for (let y = 0; y < h + 2; y++) {
    for (let x = 0; x < w + 2; x++) {
      const c = common.grid[x + y * stride];
      const xi = common.xinfo[x + y * stride];
      const r = grid2range(x, y, w, h);
      if (r !== -1) {
        out += c.toString().padStart(2, " ");
      } else if (c === CELL_MIRROR_L) {
        out += " \\";
      } else if (c === CELL_MIRROR_R) {
        out += " /";
      } else if (xi >= 0) {
        const g = s.guess[xi];
        out += g === MON_GHOST ? " G" : g === MON_VAMPIRE ? " V" : g === MON_ZOMBIE ? " Z" : " .";
      } else {
        out += "  ";
      }
    }
    out += "\n";
  }
  return out;
}
