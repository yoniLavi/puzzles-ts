/**
 * dominosa — native TS port of `dominosa.c`. Place one of every possible
 * domino (all number-pairs `0-0 … n-n`) into an `(n+2) × (n+1)` grid so each
 * square's number matches its clue.
 *
 * Left-click / `CURSOR_SELECT` between two adjacent numbers toggles a domino;
 * right-click / `CURSOR_SELECT2` between two adjacent empty squares toggles a
 * barrier edge; right-click or a digit key on a number toggles one of two
 * value highlights.
 */

import type {
  Colour,
  Point,
  ReferenceItem,
  ReferenceModel,
  Size,
} from "../../../puzzle/types.ts";
import type {
  Game,
  HintResult,
  HintStep,
  HintTrackVerdict,
  SolveResult,
  UiUpdate,
} from "../../engine/game.ts";
import { UI_UPDATE } from "../../engine/game.ts";
import { parseConfigInt } from "../../engine/params.ts";
import {
  CURSOR_SELECT,
  CURSOR_SELECT2,
  gridCursorMove,
  isCursorMove,
  LEFT_BUTTON,
  MOD_NUM_KEYPAD,
  RIGHT_BUTTON,
} from "../../engine/pointer.ts";
import { registerGame } from "../../engine/registry.ts";
import type { RandomState } from "../../random/index.ts";
import { newDominosaDesc } from "./generator.ts";
import {
  colours,
  computeSize,
  type DominosaDrawState,
  FLASH_TIME,
  newDrawState,
  PREFERRED_TILE_SIZE,
  redraw,
} from "./render.ts";
import {
  DominosaSolver,
  type HintFiring,
  type HintTechnique,
  solveNumbers,
} from "./solver.ts";
import {
  cloneState,
  DCOUNT,
  DIFF_NAMES,
  DIFFCOUNT,
  DINDEX,
  type DominosaMistake,
  type DominosaMove,
  type DominosaParams,
  type DominosaState,
  type DominosaUi,
  decodeParams,
  defaultParams,
  EDGE_B,
  EDGE_L,
  EDGE_R,
  EDGE_T,
  encodeParams,
  newState,
  presets,
  status,
  TRI,
  validateDesc,
  validateParams,
} from "./state.ts";

function newUi(_state: DominosaState): DominosaUi {
  return {
    curX: 0,
    curY: 0,
    cursorVisible: false,
    highlight1: -1,
    highlight2: -1,
    highlightPair: null,
  };
}

/** Toggle a face number through the two highlight slots (upstream logic,
 * shared by the right-click-on-number and digit-key paths). */
function toggleHighlight(ui: DominosaUi, num: number): boolean {
  if (ui.highlight1 === num) ui.highlight1 = -1;
  else if (ui.highlight2 === num) ui.highlight2 = -1;
  else if (ui.highlight1 === -1) ui.highlight1 = num;
  else if (ui.highlight2 === -1) ui.highlight2 = num;
  else return false; // both slots full and this isn't one of them
  return true;
}

function interpretMove(
  state: DominosaState,
  ui: DominosaUi,
  ds: DominosaDrawState | null,
  p: Point,
  button: number,
): DominosaMove | null | UiUpdate {
  const { w, h } = state;
  const ts = ds?.tilesize ?? PREFERRED_TILE_SIZE;
  const border = -Math.floor(ts / 16); // NARROW_BORDERS
  const coord = (v: number) => v * ts + border;
  const fromCoord = (px: number) => Math.floor((px - border + ts) / ts) - 1;

  if (button === LEFT_BUTTON || button === RIGHT_BUTTON) {
    const tx = fromCoord(p.x);
    const ty = fromCoord(p.y);
    const t = ty * w + tx;
    if (tx < 0 || tx >= w || ty < 0 || ty >= h) return null;

    // Any tap on the board dismisses the reference spotlight — the discoverable,
    // mobile-friendly clear (Esc is neither). If the tap otherwise does nothing,
    // we still repaint below so the cleared highlight disappears.
    const dismissRef = ui.highlightPair !== null;
    ui.highlightPair = null;

    // Which edge of the square is the click closest to?
    const dx = 2 * (p.x - coord(tx)) - ts;
    const dy = 2 * (p.y - coord(ty)) - ts;

    if (
      button === RIGHT_BUTTON &&
      Math.abs(dx) < (ts * 2) / 5 &&
      Math.abs(dy) < (ts * 2) / 5
    ) {
      // Right-clicked on the number → toggle its highlight.
      toggleHighlight(ui, state.numbers[t]);
      return UI_UPDATE;
    }

    let d1: number;
    let d2: number;
    if (Math.abs(dx) > Math.abs(dy) && dx < 0 && tx > 0) {
      d1 = t - 1;
      d2 = t;
    } else if (Math.abs(dx) > Math.abs(dy) && dx > 0 && tx + 1 < w) {
      d1 = t;
      d2 = t + 1;
    } else if (Math.abs(dy) > Math.abs(dx) && dy < 0 && ty > 0) {
      d1 = t - w;
      d2 = t;
    } else if (Math.abs(dy) > Math.abs(dx) && dy > 0 && ty + 1 < h) {
      d1 = t;
      d2 = t + w;
    } else {
      return dismissRef ? UI_UPDATE : null; // clicked precisely on a diagonal
    }

    // A barrier edge can't be marked next to any placed domino.
    if (button === RIGHT_BUTTON && (state.grid[d1] !== d1 || state.grid[d2] !== d2))
      return dismissRef ? UI_UPDATE : null;

    ui.cursorVisible = false;
    return button === RIGHT_BUTTON
      ? { type: "edge", d1, d2 }
      : { type: "domino", d1, d2 };
  }

  if (isCursorMove(button)) {
    const moved = gridCursorMove(button, ui.curX, ui.curY, 2 * w - 1, 2 * h - 1);
    if (moved) {
      ui.curX = moved.x;
      ui.curY = moved.y;
    }
    ui.cursorVisible = true;
    return UI_UPDATE;
  }

  if (button === CURSOR_SELECT || button === CURSOR_SELECT2) {
    if (!((ui.curX ^ ui.curY) & 1)) return null; // need exactly one dimension odd
    const d1 = Math.floor(ui.curY / 2) * w + Math.floor(ui.curX / 2);
    const d2 = Math.floor((ui.curY + 1) / 2) * w + Math.floor((ui.curX + 1) / 2);
    if (button === CURSOR_SELECT2 && (state.grid[d1] !== d1 || state.grid[d2] !== d2))
      return null;
    return button === CURSOR_SELECT2
      ? { type: "edge", d1, d2 }
      : { type: "domino", d1, d2 };
  }

  // Digit keys toggle a value highlight.
  const key = button & ~MOD_NUM_KEYPAD;
  if (key >= 48 && key <= 57) {
    const num = key - 48;
    if (num > state.params.n) return null;
    if (!toggleHighlight(ui, num)) return null;
    return UI_UPDATE;
  }

  return null;
}

/** Erase every barrier edge lurking around a square that has just become part
 * of a domino (clearing the reciprocal bit on the neighbour). */
function clearEdgesAround(edges: Int32Array, d: number, w: number): void {
  if (edges[d] & EDGE_L) edges[d - 1] &= ~EDGE_R;
  if (edges[d] & EDGE_R) edges[d + 1] &= ~EDGE_L;
  if (edges[d] & EDGE_T) edges[d - w] &= ~EDGE_B;
  if (edges[d] & EDGE_B) edges[d + w] &= ~EDGE_T;
  edges[d] = 0;
}

function checkCompletion(s: DominosaState): void {
  if (s.completed) return;
  const n = s.params.n;
  const used = new Uint8Array(TRI(n + 1));
  let ok = 0;
  for (let i = 0; i < s.w * s.h; i++)
    if (s.grid[i] > i) {
      const di = DINDEX(s.numbers[i], s.numbers[s.grid[i]]);
      if (!used[di]) {
        used[di] = 1;
        ok++;
      }
    }
  if (ok === DCOUNT(n)) s.completed = true;
}

function executeMove(state: DominosaState, m: DominosaMove): DominosaState {
  const ret = cloneState(state);
  const { w, h } = ret;
  const wh = w * h;

  if (m.type === "solve") {
    ret.cheated = true;
    for (let i = 0; i < wh; i++) {
      ret.grid[i] = i;
      ret.edges[i] = 0;
    }
    for (const [a, b] of m.dominoes) {
      ret.grid[a] = b;
      ret.grid[b] = a;
    }
  } else {
    const { d1, d2 } = m;
    if (!(d1 >= 0 && d2 < wh && d1 < d2 && (d2 - d1 === 1 || d2 - d1 === w)))
      throw new Error(`dominosa: illegal move ${JSON.stringify(m)}`);

    if (m.type === "domino") {
      if (ret.grid[d1] === d2) {
        ret.grid[d1] = d1;
        ret.grid[d2] = d2;
      } else {
        // Erase any dominoes overlapping the new one.
        let d3 = ret.grid[d1];
        if (d3 !== d1) ret.grid[d3] = d3;
        d3 = ret.grid[d2];
        if (d3 !== d2) ret.grid[d3] = d3;
        // Place the new one and destroy any lurking edges.
        ret.grid[d1] = d2;
        ret.grid[d2] = d1;
        clearEdgesAround(ret.edges, d1, w);
        clearEdgesAround(ret.edges, d2, w);
      }
    } else {
      // edge
      if (ret.grid[d1] !== d1 || ret.grid[d2] !== d2)
        throw new Error("dominosa: edge move next to a domino");
      if (d2 === d1 + 1) {
        ret.edges[d1] ^= EDGE_R;
        ret.edges[d2] ^= EDGE_L;
      } else {
        ret.edges[d1] ^= EDGE_B;
        ret.edges[d2] ^= EDGE_T;
      }
    }
  }

  checkCompletion(ret);
  return ret;
}

function solve(
  orig: DominosaState,
  _curr: DominosaState,
  aux?: string,
): SolveResult<DominosaMove> {
  const { w, numbers, params } = orig;
  const wh = numbers.length;

  if (aux && aux.length === wh) {
    const dominoes: Array<[number, number]> = [];
    for (let i = 0; i < wh; i++) {
      if (aux[i] === "L") dominoes.push([i, i + 1]);
      else if (aux[i] === "T") dominoes.push([i, i + w]);
    }
    return { ok: true, move: { type: "solve", dominoes } };
  }

  const { result, pairs } = solveNumbers(params.n, numbers, DIFFCOUNT);
  if (result !== 1)
    return { ok: false, error: "Unable to find a unique solution for this puzzle" };
  return { ok: true, move: { type: "solve", dominoes: pairs } };
}

/** Boards this fork generates are uniquely solvable: re-solve to the unique
 * solution and flag both cells of every player-placed domino the solution does
 * not contain. A non-uniquely-solvable board degrades to no mistakes. */
function findMistakes(state: DominosaState): readonly DominosaMistake[] {
  const { numbers, grid, params } = state;
  const wh = numbers.length;
  const { result, pairs } = solveNumbers(params.n, numbers, DIFFCOUNT);
  if (result !== 1) return [];

  const solutionPartner = new Int32Array(wh);
  for (let i = 0; i < wh; i++) solutionPartner[i] = i;
  for (const [a, b] of pairs) {
    solutionPartner[a] = b;
    solutionPartner[b] = a;
  }

  const out: DominosaMistake[] = [];
  for (let i = 0; i < wh; i++) {
    if (grid[i] > i && solutionPartner[i] !== grid[i]) {
      out.push({ index: i });
      out.push({ index: grid[i] });
    }
  }
  return out;
}

// --- hint ------------------------------------------------------------------

/** Highlight payload for a dominosa hint step. `targets` are the cells to act
 * on (a placement's two cells, or a barrier's two cells) → `COL_HINT`;
 * `evidence` are the squares the deduction reasons over → `COL_HINT_CELL`;
 * `edge` (barrier only) is the `[a, b]` pair whose shared edge to recolour. */
export interface DominosaHint {
  kind: "place" | "barrier";
  targets: number[];
  evidence: number[];
  edge?: [number, number];
}

const edgeKey = (a: number, b: number): string => (a < b ? `${a}-${b}` : `${b}-${a}`);

/** The domino value shown across an edge/pair (lo–hi). */
function dominoLabel(a: number, b: number, numbers: Int32Array): string {
  const na = numbers[a];
  const nb = numbers[b];
  return na <= nb ? `${na}–${nb}` : `${nb}–${na}`;
}

function narratePlace(
  technique: HintTechnique,
  a: number,
  b: number,
  numbers: Int32Array,
): string {
  const dom = dominoLabel(a, b, numbers);
  if (technique === "squareOnly")
    return `This square can pair with only the ${dom} domino, so it must go here.`;
  return `The ${dom} domino has only one spot left where it fits — every other pairing is blocked — so it must go here.`;
}

function narrateBarrier(
  technique: HintTechnique,
  a: number,
  b: number,
  numbers: Int32Array,
  continues: boolean,
): string {
  if (continues) return "This spot can't hold a domino for the same reason.";
  const dom = dominoLabel(a, b, numbers);
  switch (technique) {
    case "squareSingleDomino":
      return `The shaded square can only be part of the ${dom} domino, so ${dom} can't sit here instead.`;
    case "mustOverlap":
      return "Every remaining spot for the shaded domino covers this pair, so no other domino can go here.";
    case "localDuplicate":
      return `A ${dom} domino here would force a second ${dom} at the shaded square — but each domino is used once — so it can't.`;
    case "localDuplicate2":
      return `A ${dom} domino here would force both shaded squares to become ${dom} too — a duplicate — so it can't.`;
    case "parity":
      return "A domino here would split the empty squares into two odd-sized regions, and an odd region can't be filled by dominoes — so this can't be a domino.";
    case "set":
      return `The shaded squares can only hold one small set of dominoes between them, using up the ${dom} — so ${dom} can't sit here as well.`;
    case "forcingChain":
      return "Following the forced pairings from here eventually repeats a domino, so this can't be a domino.";
    default:
      return "This can't be a domino.";
  }
}

function hint(state: DominosaState): HintResult<DominosaMove, DominosaHint> {
  if (state.completed) return { ok: false, error: "This board is already solved." };
  if (findMistakes(state).length > 0) {
    return {
      ok: false,
      error: "There's a mistake on the board — fix it before asking for a hint.",
    };
  }
  const { numbers, params } = state;
  const n = params.n;
  const w = state.w;
  const wh = numbers.length;

  // A hint teaches a *forced* deduction; an Ambiguous board has none.
  if (solveNumbers(n, numbers, DIFFCOUNT).result !== 1) {
    return {
      ok: false,
      error: "This board doesn't have a unique solution to reason about.",
    };
  }

  const solver = new DominosaSolver(n);
  solver.setupGrid(numbers);
  solver.seedFromDominoes(state.grid);

  const placed = new Set<number>();
  let placedCount = 0;
  for (let i = 0; i < wh; i++)
    if (state.grid[i] > i) {
      placed.add(DINDEX(numbers[i], numbers[state.grid[i]]));
      placedCount++;
    }

  // Barriers the player already drew (or we've already emitted) — skip display.
  const seenEdges = new Set<string>();
  for (let i = 0; i < wh; i++) {
    if (state.edges[i] & EDGE_R) seenEdges.add(edgeKey(i, i + 1));
    if (state.edges[i] & EDGE_B) seenEdges.add(edgeKey(i, i + w));
  }

  const steps: HintStep<DominosaMove, DominosaHint>[] = [];
  const total = DCOUNT(n);
  let budget = 12 * wh + 200;

  while (budget-- > 0 && placedCount < total) {
    const firing: HintFiring | null = solver.firstFiring(DIFFCOUNT, placed);
    if (!firing) break;

    if (firing.place) {
      const [a, b] = firing.place;
      placed.add(DINDEX(numbers[a], numbers[b]));
      placedCount++;
      solver.forcePlacement(a, b);
      steps.push({
        move: { type: "domino", d1: a, d2: b },
        explanation: narratePlace(firing.technique, a, b, numbers),
        highlights: { kind: "place", targets: [a, b], evidence: firing.evidence },
      });
    } else {
      const fresh = firing.barriers.filter(([a, b]) => !seenEdges.has(edgeKey(a, b)));
      for (let idx = 0; idx < fresh.length; idx++) {
        const [a, b] = fresh[idx];
        seenEdges.add(edgeKey(a, b));
        steps.push({
          move: { type: "edge", d1: a, d2: b },
          explanation: narrateBarrier(firing.technique, a, b, numbers, idx > 0),
          ...(idx > 0 ? { continuesPrevious: true } : {}),
          highlights: {
            kind: "barrier",
            targets: [a, b],
            evidence: firing.evidence,
            edge: [a, b],
          },
        });
      }
    }
  }

  if (steps.length === 0)
    return { ok: false, error: "I can't find a deduction from here." };
  return { ok: true, steps };
}

/** The player's move completes the step iff it is the step's exact
 * domino/edge move; anything else drops the plan to recompute. */
function hintKeepTrack(
  m: DominosaMove,
  step: HintStep<DominosaMove, DominosaHint>,
  _state: DominosaState,
): HintTrackVerdict {
  const sm = step.move;
  if (m.type !== sm.type) return "off";
  if (m.type === "domino" && sm.type === "domino")
    return m.d1 === sm.d1 && m.d2 === sm.d2 ? "completed" : "off";
  if (m.type === "edge" && sm.type === "edge")
    return m.d1 === sm.d1 && m.d2 === sm.d2 ? "completed" : "off";
  return "off";
}

// --- text format (upstream game_text_format / draw_domino) -----------------

function drawDomino(
  board: string[],
  start: number,
  corner: string,
  dshort: number,
  nshort: number,
  cshort: string,
  dlong: number,
  nlong: number,
  clong: string,
): void {
  const goShort = nshort * dshort;
  const goLong = nlong * dlong;
  board[start] = corner;
  board[start + goShort] = corner;
  board[start + goLong] = corner;
  board[start + goShort + goLong] = corner;
  for (let i = 1; i < nshort; i++) {
    const j = start + i * dshort;
    const k = start + i * dshort + goLong;
    if (board[j] !== corner) board[j] = cshort;
    if (board[k] !== corner) board[k] = cshort;
  }
  for (let i = 1; i < nlong; i++) {
    const j = start + i * dlong;
    const k = start + i * dlong + goShort;
    if (board[j] !== corner) board[j] = clong;
    if (board[k] !== corner) board[k] = clong;
  }
}

function textFormat(state: DominosaState): string {
  const { w, h, numbers, grid, edges } = state;
  const cw = 4;
  const ch = 2;
  const gw = cw * w + 2;
  const gh = ch * h + 1;
  const len = gw * gh;
  const board: string[] = new Array(len).fill(" ");

  for (let r = 0; r < h; r++) {
    for (let c = 0; c < w; c++) {
      const cell = r * ch * gw + cw * c;
      const center = cell + Math.floor((gw * ch) / 2) + Math.floor(cw / 2);
      const i = r * w + c;
      const num = numbers[i];
      if (num < 100) {
        board[center] = String(num % 10);
        if (num >= 10) board[center - 1] = String(Math.floor(num / 10));
      } else {
        board[center + 1] = String(num % 10);
        board[center] = String(Math.floor(num / 10) % 10);
        board[center - 1] = String(Math.floor(num / 100));
      }
      if (edges[i] & EDGE_L) board[center - cw / 2] = "|";
      if (edges[i] & EDGE_R) board[center + cw / 2] = "|";
      if (edges[i] & EDGE_T) board[center - gw] = "-";
      if (edges[i] & EDGE_B) board[center + gw] = "-";

      if (grid[i] === i) continue; // no pairing
      if (grid[i] < i) continue; // already drawn
      if (grid[i] === i + 1) drawDomino(board, cell, "+", gw, ch, "|", 1, 2 * cw, "-");
      else if (grid[i] === i + w)
        drawDomino(board, cell, "+", 1, cw, "-", gw, 2 * ch, "|");
    }
    board[r * ch * gw + gw - 1] = "\n";
    board[r * ch * gw + gw + gw - 1] = "\n";
  }
  board[len - 1] = "\n";
  return board.join("");
}

function flashLength(
  oldState: DominosaState,
  newState_: DominosaState,
  _dir: number,
  ui: DominosaUi,
): number {
  if (
    !oldState.completed &&
    newState_.completed &&
    !oldState.cheated &&
    !newState_.cheated
  ) {
    ui.highlight1 = -1;
    ui.highlight2 = -1;
    ui.highlightPair = null;
    return FLASH_TIME;
  }
  return 0;
}

// --- reference aid ----------------------------------------------------------
// A checklist of every domino `0-0 … n-n` with the player's found status, and a
// click-to-spotlight of a pair's candidate placements. Status is derived purely
// from the player's own placed dominoes — no solver, no solution leak.

/** Reference-item key ⇄ face-value pair. Key is `"lo-hi"` (lo ≤ hi). */
const pairKey = (lo: number, hi: number): string => `${lo}-${hi}`;

function pairFromKey(key: string): [number, number] | null {
  const m = /^(\d+)-(\d+)$/.exec(key);
  if (!m) return null;
  const a = Number(m[1]);
  const b = Number(m[2]);
  return a <= b ? [a, b] : [b, a];
}

/** Inverse of `DINDEX`: the `(lo, hi)` face-value pair for a domino index. */
function indexToPair(di: number): [number, number] {
  let hi = 0;
  while (TRI(hi + 1) <= di) hi++;
  return [di - TRI(hi), hi];
}

function reference(state: DominosaState, ui: DominosaUi): ReferenceModel {
  const n = state.params.n;
  const { numbers, grid } = state;
  const wh = numbers.length;

  // Count placements per domino index straight from the player's grid.
  const placed = new Int32Array(DCOUNT(n));
  for (let i = 0; i < wh; i++)
    if (grid[i] > i) placed[DINDEX(numbers[i], numbers[grid[i]])]++;

  const items: ReferenceItem[] = [];
  for (let hi = 0; hi <= n; hi++)
    for (let lo = 0; lo <= hi; lo++) {
      const count = placed[TRI(hi) + lo];
      items.push({
        key: pairKey(lo, hi),
        label: `${lo}–${hi}`,
        pips: [lo, hi],
        status: count === 0 ? "outstanding" : count === 1 ? "placed" : "conflict",
      });
    }

  const selected =
    ui.highlightPair === null ? null : pairKey(...indexToPair(ui.highlightPair));
  // A triangular table: row `hi` has `hi+1` entries; `n+1` is its widest row.
  return { items, selected, columns: n + 1 };
}

function selectReference(ui: DominosaUi, key: string | null): boolean {
  let di: number | null = null;
  if (key !== null) {
    const pair = pairFromKey(key);
    if (pair === null) return false;
    di = DINDEX(pair[0], pair[1]);
  }
  if (ui.highlightPair === di) return false;
  ui.highlightPair = di;
  return true;
}

export const dominosaGame: Game<
  DominosaParams,
  DominosaState,
  DominosaMove,
  DominosaUi,
  DominosaDrawState,
  DominosaMistake
> = {
  id: "dominosa",
  wantsStatusbar: false,
  isTimed: false,
  canSolve: true,
  canFormatAsText: true,
  needsRightButton: true, // upstream REQUIRE_RBUTTON (barrier edges)

  defaultParams,
  presets,
  encodeParams,
  decodeParams,
  validateParams,
  paramConfig: [
    {
      kw: "maximum-number-on-dominoes",
      name: "Maximum number on dominoes",
      type: "string",
      get: (p) => String(p.n),
      set: (p, v) => {
        p.n = parseConfigInt(v);
      },
    },
    {
      kw: "difficulty",
      name: "Difficulty",
      type: "choices",
      choices: [...DIFF_NAMES],
      get: (p) => p.diff,
      set: (p, v) => {
        p.diff = v;
      },
    },
  ],
  describeParams: (p) => ({
    "maximum-number-on-dominoes": String(p.n),
    difficulty: p.diff,
  }),

  newDesc: (p: DominosaParams, rng: RandomState) => newDominosaDesc(p, rng),
  validateDesc,
  newState,
  newUi,

  interpretMove,
  executeMove,
  status,

  solve,
  findMistakes,
  reference,
  selectReference,
  hint,
  hintKeepTrack,

  textFormat,

  colours: (defaultBackground: Colour): Colour[] => colours(defaultBackground),
  preferredTileSize: PREFERRED_TILE_SIZE,
  computeSize: (p: DominosaParams, ts: number): Size => computeSize(p, ts),
  setTileSize: (ds, ts) => {
    ds.tilesize = ts;
  },
  newDrawState,
  redraw,

  flashLength,
};

registerGame(dominosaGame);
