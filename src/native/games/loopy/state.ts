/**
 * Loopy's game state, description codec and completion check.
 *
 * The state is a grid (shared by reference — a `Grid` is immutable after
 * construction, so GC replaces upstream's refcount) plus three parallel arrays
 * over it: a clue per face, a line state per edge, and an error flag per edge.
 */
import { Dsf } from "../../engine/dsf.ts";
import type { Grid, GridType } from "../../engine/grid.ts";
import { GridTrimmedAwayError, gridNew, gridValidateDesc } from "../../engine/grid.ts";
import { gridTypeOf, type LoopyParams } from "./params.ts";

/**
 * Line states. **The numeric values are load-bearing arithmetic**, not
 * arbitrary tags: `opp(x) = 2 - x` maps YES↔NO and fixes UNKNOWN, which the
 * solver's edge-dsf propagation relies on. Do not model these as a string
 * union.
 */
export const LINE_YES = 0;
export const LINE_UNKNOWN = 1;
export const LINE_NO = 2;
export type LineState = 0 | 1 | 2;

/** The opposite line state (upstream's `OPP`). UNKNOWN is its own opposite. */
export function opp(line: number): LineState {
  return (2 - line) as LineState;
}

/** No clue on this face. */
export const NO_CLUE = -1;

export interface LoopyState {
  /** Shared by reference: immutable after construction. */
  readonly grid: Grid;
  /** The grid's description (`null` for tilings that take none), kept so a
   * save or a superseding desc can be rebuilt without re-drawing randomness. */
  readonly gridDesc: string | null;
  /** Loopy's grid-type index (not `GridType`) — needed by `textFormat`, which
   * only supports the square lattice. */
  readonly gridType: number;
  /** One clue per face, or {@link NO_CLUE}. */
  readonly clues: Int8Array;
  /** One {@link LineState} per edge. */
  readonly lines: Uint8Array;
  /** Per-edge error highlight, recomputed by {@link checkCompletion}. */
  readonly lineErrors: Uint8Array;
  /** The YES edges form exactly one loop and nothing else. Varies the
   * semantics of clue highlighting at display time — see `render.ts`. */
  exactlyOneLoop: boolean;
  solved: boolean;
  cheated: boolean;
}

/** A fresh state over the same grid, with independent line/clue arrays. */
export function cloneState(s: LoopyState): LoopyState {
  return {
    grid: s.grid,
    gridDesc: s.gridDesc,
    gridType: s.gridType,
    clues: s.clues.slice(),
    lines: s.lines.slice(),
    lineErrors: s.lineErrors.slice(),
    exactlyOneLoop: s.exactlyOneLoop,
    solved: s.solved,
    cheated: s.cheated,
  };
}

// ---------------------------------------------------------------------------
// Description codec
// ---------------------------------------------------------------------------

const GRID_DESC_SEP = "_";

/** Split an optional grid description off the front of a game description.
 * Mirrors `extract_grid_desc`: the separator is the **first** underscore, and
 * its absence means the tiling takes no description. */
export function splitDesc(desc: string): { gridDesc: string | null; clueDesc: string } {
  const sep = desc.indexOf(GRID_DESC_SEP);
  if (sep < 0) return { gridDesc: null, clueDesc: desc };
  return { gridDesc: desc.slice(0, sep), clueDesc: desc.slice(sep + 1) };
}

/** A clue digit as its description character: `0`–`9` then `A`–`Z` for 10–35.
 * Mirrors `CLUE2CHAR`. */
function clueChar(clue: number): string {
  return clue < 10
    ? String.fromCharCode(48 + clue)
    : String.fromCharCode(65 + clue - 10);
}

/**
 * Encode a state's clues as a description. Runs of clueless faces become a
 * single letter `a`–`z` (1–26 empties); clued faces become their digit.
 * Mirrors `state_to_text`.
 *
 * The run flush is written as upstream writes it — **the `> 25` test happens
 * before the increment**, so a run is flushed once it would exceed 26 and the
 * emitted letter is always in `a`–`z`. Reordering the test and the increment
 * shifts every long run by one character and changes the description.
 */
export function encodeClues(clues: Int8Array, numFaces: number): string {
  let out = "";
  let empty = 0;
  const flush = (): void => {
    out += String.fromCharCode(97 + empty - 1);
    empty = 0;
  };
  for (let i = 0; i < numFaces; i++) {
    if (clues[i] < 0) {
      if (empty > 25) flush();
      empty++;
    } else {
      if (empty) flush();
      out += clueChar(clues[i]);
    }
  }
  if (empty) flush();
  return out;
}

/** Decode a clue description into a per-face clue array. Mirrors the decoding
 * loop in `new_game`; assumes the description has already been validated. */
export function decodeClues(clueDesc: string, numFaces: number): Int8Array {
  const clues = new Int8Array(numFaces);
  let emptiesToMake = 0;
  let p = 0;
  for (let i = 0; i < numFaces; i++) {
    if (emptiesToMake) {
      emptiesToMake--;
      clues[i] = NO_CLUE;
      continue;
    }
    const c = clueDesc.charCodeAt(p);
    const digit = c - 48;
    const letter = c - 65 + 10;
    if (digit >= 0 && digit < 10) {
      clues[i] = digit;
    } else if (letter >= 10 && letter < 36) {
      clues[i] = letter;
    } else {
      clues[i] = NO_CLUE;
      emptiesToMake = c - 97 + 1 - 1;
    }
    p++;
  }
  return clues;
}

/**
 * Face counts for `validateDesc`, keyed by `(type, w, h, gridDesc)`.
 *
 * Upstream builds an **entire grid** purely to learn `numFaces`, and flags the
 * inefficiency itself. For the four aperiodic tilings that is now a full
 * generation plus a vigorous trim — paid on every description validation,
 * including the assertion at the end of every `newDesc`. Memoising is
 * behaviour-identical and removes a cost upstream only tolerated because its
 * aperiodic grids were built far less often than ours are.
 */
const faceCountCache = new Map<string, number | null>();

function faceCountFor(
  type: GridType,
  w: number,
  h: number,
  gridDesc: string | null,
): number | null {
  const key = `${type}|${w}|${h}|${gridDesc ?? ""}`;
  const hit = faceCountCache.get(key);
  if (hit !== undefined) return hit;
  let count: number | null;
  try {
    count = gridNew(type, w, h, gridDesc).numFaces;
  } catch (e) {
    // A description can be individually well-formed and still describe a patch
    // that trims away to nothing — reachable by hand-typing a game ID. That is
    // a rejected description, not a crash.
    if (!(e instanceof GridTrimmedAwayError)) throw e;
    count = null;
  }
  faceCountCache.set(key, count);
  return count;
}

/** Validate a full game description (`[<gridDesc>_]<clueDesc>`) against params.
 * Returns `null` when acceptable, else why it is rejected. */
export function validateDesc(p: LoopyParams, desc: string): string | null {
  const type = gridTypeOf(p);
  const { gridDesc, clueDesc } = splitDesc(desc);

  const gridErr = gridValidateDesc(type, p.w, p.h, gridDesc);
  if (gridErr) return gridErr;

  const numFaces = faceCountFor(type, p.w, p.h, gridDesc);
  if (numFaces === null) return "Grid description describes an empty grid";

  let count = 0;
  for (const ch of clueDesc) {
    if ((ch >= "0" && ch <= "9") || (ch >= "A" && ch <= "Z")) {
      count++;
    } else if (ch >= "a") {
      count += ch.charCodeAt(0) - 97 + 1;
    } else {
      return "Unknown character in description";
    }
  }

  if (count < numFaces) return "Description too short for board size";
  if (count > numFaces) return "Description too long for board size";
  return null;
}

/** Build the initial state for a description. Assumes it has been validated. */
export function newState(p: LoopyParams, desc: string): LoopyState {
  const { gridDesc, clueDesc } = splitDesc(desc);
  const grid = gridNew(gridTypeOf(p), p.w, p.h, gridDesc);
  const lines = new Uint8Array(grid.numEdges);
  lines.fill(LINE_UNKNOWN);
  return {
    grid,
    gridDesc,
    gridType: p.type,
    clues: decodeClues(clueDesc, grid.numFaces),
    lines,
    lineErrors: new Uint8Array(grid.numEdges),
    exactlyOneLoop: false,
    solved: false,
    cheated: false,
  };
}

// ---------------------------------------------------------------------------
// Counting helpers
// ---------------------------------------------------------------------------

/** How many lines of `lineType` currently meet this dot. */
export function dotOrder(s: LoopyState, dot: number, lineType: number): number {
  let n = 0;
  const d = s.grid.dots[dot];
  for (let i = 0; i < d.order; i++) {
    if (s.lines[d.edges[i].index] === lineType) n++;
  }
  return n;
}

/** How many lines of `lineType` currently surround this face. */
export function faceOrder(s: LoopyState, face: number, lineType: number): number {
  let n = 0;
  const f = s.grid.faces[face];
  for (let i = 0; i < f.order; i++) {
    const e = f.edges[i];
    if (e !== null && s.lines[e.index] === lineType) n++;
  }
  return n;
}

// ---------------------------------------------------------------------------
// Completion and error highlighting
// ---------------------------------------------------------------------------

/** Classification of one connected component of YES edges. */
const COMP_NONE = 0;
const COMP_LOOP = 1;
const COMP_PATH = 2;
const COMP_SILLY = 3;
const COMP_EMPTY = 4;

/**
 * Recompute `lineErrors` and `exactlyOneLoop` **in place**, and report whether
 * the board is now solved. Mutates the state it is handed, so call it only on a
 * freshly-built state (`executeMove`'s copy), never on one already published.
 *
 * Upstream explains at length why the shared `findloop.c` is the wrong tool
 * here, and the reasoning is worth keeping: in most puzzles loops are simply
 * *forbidden*, so highlighting every edge that lies on a loop is exactly right.
 * Loopy is unusual — you are *supposed* to make a loop, but only one, so some
 * loops are wrong and the interesting question is *which* edges to blame.
 * Worse, the intuitive answer flips with context: a small accidental loop in a
 * corner should be highlighted, but a nearly-complete solution with a few
 * forgotten stray edges elsewhere should blame the strays. Finding the longest
 * cycle would settle it and is NP-complete.
 *
 * The tractable substitute leans on the fact that no vertex may have degree
 * greater than two, which is trivial to detect:
 *
 *  - build the dsf of connected components over the YES edges;
 *  - flag any vertex of degree > 2 (and any degree-1 vertex all of whose other
 *    edges are explicitly NO) by lighting its incident YES edges, and exclude
 *    its whole component from further consideration;
 *  - every remaining component is therefore a simple loop or a simple path;
 *  - treat *all* the paths as one component, since a player normally builds the
 *    solution as many separate fragments that gradually join up;
 *  - if exactly one sensible component remains, highlight nothing further;
 *  - otherwise leave the largest sensible component alone and light up the rest.
 *
 * The result is that a player always sees *some* explanation of why a filled-in
 * grid is not a win, which is the Puzzles principle at work: it is not
 * necessary to highlight every error, only never to leave the player with
 * neither a victory flash nor a reason.
 */
export function checkCompletion(state: LoopyState): boolean {
  const g = state.grid;
  state.lineErrors.fill(0);

  const dsf = new Dsf(g.numDots);
  for (let i = 0; i < g.numEdges; i++) {
    if (state.lines[i] === LINE_YES) {
      const e = g.edges[i];
      dsf.merge(e.dot1.index, e.dot2.index);
    }
  }

  const componentState = new Int32Array(g.numDots);
  for (let i = 0; i < g.numDots; i++) {
    componentState[i] = dsf.canonify(i) === i ? COMP_LOOP : COMP_NONE;
  }

  for (let i = 0; i < g.numDots; i++) {
    const comp = dsf.canonify(i);
    const yes = dotOrder(state, i, LINE_YES);
    const unknown = dotOrder(state, i, LINE_UNKNOWN);
    if ((yes === 1 && unknown === 0) || yes >= 3) {
      // A clear vertex-level error: light every YES edge at this dot, and take
      // the whole component out of the loop analysis below.
      const d = g.dots[i];
      for (let j = 0; j < d.order; j++) {
        const e = d.edges[j].index;
        if (state.lines[e] === LINE_YES) state.lineErrors[e] = 1;
      }
      componentState[comp] = COMP_SILLY;
    } else if (yes === 0) {
      // An isolated dot is also excluded, but tagged distinctly so it does not
      // count towards the components that inhibit a win.
      componentState[comp] = COMP_EMPTY;
    } else if (yes === 1) {
      // Degree 1 without being erroneous means this component is a path, unless
      // something worse elsewhere in it already made it silly.
      if (componentState[comp] !== COMP_SILLY) componentState[comp] = COMP_PATH;
    }
  }

  // Count the components and find the largest sensible one. The tie-break falls
  // out of dot ordering in the grid — arbitrary, but stable for a whole game.
  let nsilly = 0;
  let nloop = 0;
  let npath = 0;
  let totalPathsize = 0;
  let largestComp = -1;
  let largestSize = -1;
  for (let i = 0; i < g.numDots; i++) {
    if (componentState[i] === COMP_SILLY) {
      nsilly++;
    } else if (componentState[i] === COMP_PATH) {
      totalPathsize += dsf.size(i);
      npath = 1;
    } else if (componentState[i] === COMP_LOOP) {
      nloop++;
      const thisSize = dsf.size(i);
      if (thisSize > largestSize) {
        largestComp = i;
        largestSize = thisSize;
      }
    }
  }
  if (largestSize < totalPathsize) {
    largestComp = -1; // -1 means "the paths, collectively"
    largestSize = totalPathsize;
  }

  if (nloop > 0 && nloop + npath > 1) {
    // At least two sensible components, one of them a loop: highlight every
    // sensible component that is not the largest.
    for (let i = 0; i < g.numEdges; i++) {
      if (state.lines[i] !== LINE_YES) continue;
      const comp = dsf.canonify(g.edges[i].dot1.index); // either end will do
      if (
        (componentState[comp] === COMP_PATH && largestComp !== -1) ||
        (componentState[comp] === COMP_LOOP && comp !== largestComp)
      ) {
        state.lineErrors[i] = 1;
      }
    }
  }

  if (nloop === 1 && npath === 0 && nsilly === 0) {
    // Exactly one component and it is a loop, so the puzzle is potentially
    // complete: check the clues.
    let ret = true;
    for (let i = 0; i < g.numFaces; i++) {
      const c = state.clues[i];
      if (c >= 0 && faceOrder(state, i, LINE_YES) !== c) {
        ret = false;
        break;
      }
    }
    // Whether or not it is complete, record that this state is one loop and
    // nothing else: it changes how clues are highlighted at display time.
    state.exactlyOneLoop = true;
    return ret;
  }

  state.exactlyOneLoop = false;
  return false;
}

// ---------------------------------------------------------------------------
// Text format
// ---------------------------------------------------------------------------

/**
 * Render the board as ASCII art. **Square grids only** — the layout assumes a
 * square lattice, and there is no sensible text rendering of a Penrose patch.
 *
 * Upstream expresses this as a separate `game_can_format_as_text_now(params)`
 * entry point returning false for every non-square type; this project's `Game`
 * interface has a static `canFormatAsText`, so the param-dependence is carried
 * by returning `undefined` here instead (the midend and the share dialog
 * already treat an absent rendering as "no text panel"). That was the cheapest
 * of the options design D6d listed, and it needed no new hook.
 */
export function textFormat(state: LoopyState): string | undefined {
  if (state.gridType !== 0) return undefined;

  const g = state.grid;
  const f0 = g.faces[0];
  // Dots are clockwise, so opposite corners span the square.
  // biome-ignore lint/style/noNonNullAssertion: a square face has all four dots.
  const cellSize = Math.abs(f0.dots[0]!.x - f0.dots[2]!.x);

  const w = (g.highestX - g.lowestX) / cellSize;
  const h = (g.highestY - g.lowestY) / cellSize;
  const W = 2 * w + 2;
  const H = 2 * h + 1;

  const canvas: string[] = new Array(W * H).fill(" ");
  for (let y = 0; y < H; y++) canvas[y * W + W - 1] = "\n";

  for (let i = 0; i < g.numEdges; i++) {
    const e = g.edges[i];
    const x1 = (e.dot1.x - g.lowestX) / cellSize;
    const x2 = (e.dot2.x - g.lowestX) / cellSize;
    const y1 = (e.dot1.y - g.lowestY) / cellSize;
    const y2 = (e.dot2.y - g.lowestY) / cellSize;
    // Canvas coordinates are twice cell coordinates, so the midpoint is a sum.
    const x = x1 + x2;
    const y = y1 + y2;
    if (state.lines[i] === LINE_YES) canvas[y * W + x] = y1 === y2 ? "-" : "|";
    else if (state.lines[i] === LINE_NO) canvas[y * W + x] = "x";
  }

  for (let i = 0; i < g.numFaces; i++) {
    const f = g.faces[i];
    // biome-ignore lint/style/noNonNullAssertion: a square face has all four dots.
    const x1 = (f.dots[0]!.x - g.lowestX) / cellSize;
    // biome-ignore lint/style/noNonNullAssertion: ditto.
    const x2 = (f.dots[2]!.x - g.lowestX) / cellSize;
    // biome-ignore lint/style/noNonNullAssertion: ditto.
    const y1 = (f.dots[0]!.y - g.lowestY) / cellSize;
    // biome-ignore lint/style/noNonNullAssertion: ditto.
    const y2 = (f.dots[2]!.y - g.lowestY) / cellSize;
    const clue = state.clues[i];
    canvas[(y1 + y2) * W + (x1 + x2)] = clue < 0 ? " " : clueChar(clue);
  }

  return canvas.join("");
}
