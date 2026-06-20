/**
 * Singles (Hitori) — native TS port of `singles.c`. A grid of numbers in
 * which you blacken cells so that no number repeats among the remaining
 * (white) cells of any row or column, no two black cells are orthogonally
 * adjacent, and the white cells form one connected region. Left-click /
 * select toggles a cell black; right-click / select2 toggles a white mark
 * (circle); clicking a marked cell clears it. A click outside the grid
 * toggles the "show numbers on black squares" preference. Rule violations
 * are highlighted live; Check & Save additionally flags cells that
 * contradict the unique solution.
 */
import type { Colour, Point, Size } from "../../../puzzle/types.ts";
import {
  type Game,
  type HintResult,
  type HintStep,
  type HintTrackVerdict,
  type SolveResult,
  UI_UPDATE,
  type UiUpdate,
} from "../../engine/game.ts";
import {
  CURSOR_SELECT,
  CURSOR_SELECT2,
  cursorDelta,
  isCursorMove,
  LEFT_BUTTON,
  MIDDLE_BUTTON,
  RIGHT_BUTTON,
  stripModifiers,
} from "../../engine/pointer.ts";
import { registerGame } from "../../engine/registry.ts";
import { newSinglesDesc } from "./generator.ts";
import {
  colours,
  computeSize,
  FLASH_TIME,
  newDrawState,
  PREFERRED_TILE_SIZE,
  redraw,
  type SinglesDrawState,
  setTileSize,
} from "./render.ts";
import {
  CC_MARK_ERRORS,
  checkComplete,
  deduceHintPlan,
  type HintRecord,
  OP_BLACK,
  type SinglesReason,
  solveSpecific,
} from "./solver.ts";
import {
  type CellValue,
  cloneState,
  DIFF_ANY,
  decodeParams,
  defaultParams,
  diffName,
  encodeParams,
  F_BLACK,
  F_CIRCLE,
  makeState,
  newState,
  type SinglesMove,
  type SinglesParams,
  type SinglesState,
  type SinglesUi,
  status,
  textFormat,
  validateDesc,
  validateParams,
} from "./state.ts";

/** A cell whose mark contradicts the unique solution (Check & Save). */
export interface SinglesMistake {
  x: number;
  y: number;
}

const PRESET_SIZES = [5, 6, 8, 10, 12];

function presets(): {
  title: string;
  submenu: { title: string; params: SinglesParams }[];
} {
  const submenu: { title: string; params: SinglesParams }[] = [];
  for (const d of PRESET_SIZES) {
    for (const diff of ["easy", "tricky"] as const) {
      submenu.push({
        title: `${d}x${d} ${diffName(diff)}`,
        params: { w: d, h: d, diff },
      });
    }
  }
  return { title: "Singles", submenu };
}

function newUi(_state: SinglesState): SinglesUi {
  return { cx: 0, cy: 0, cshow: false, showBlackNums: false };
}

function changedState(
  ui: SinglesUi,
  oldState: SinglesState | null,
  newSt: SinglesState,
): void {
  if (oldState && !oldState.completed && newSt.completed) ui.cshow = false;
}

function inGrid(s: SinglesState, x: number, y: number): boolean {
  return x >= 0 && x < s.w && y >= 0 && y < s.h;
}

function interpretMove(
  state: SinglesState,
  ui: SinglesUi,
  ds: SinglesDrawState | null,
  p: Point,
  rawButton: number,
): SinglesMove | null | UiUpdate {
  const button = stripModifiers(rawButton);
  const { w, h } = state;

  // Cursor movement: wraps toroidally; first press only reveals the cursor.
  if (isCursorMove(button)) {
    const delta = cursorDelta(button);
    if (!delta) return null;
    const ox = ui.cx;
    const oy = ui.cy;
    ui.cx = (((ui.cx + delta.dx) % w) + w) % w;
    ui.cy = (((ui.cy + delta.dy) % h) + h) % h;
    if (!ui.cshow) {
      ui.cshow = true;
      return UI_UPDATE;
    }
    return ui.cx !== ox || ui.cy !== oy ? UI_UPDATE : null;
  }

  let x: number;
  let y: number;
  let action: "none" | "black" | "circle" | "ui" = "none";

  if (button === CURSOR_SELECT || button === CURSOR_SELECT2) {
    x = ui.cx;
    y = ui.cy;
    if (!ui.cshow) ui.cshow = true;
    action = button === CURSOR_SELECT ? "black" : "circle";
  } else if (
    button === LEFT_BUTTON ||
    button === MIDDLE_BUTTON ||
    button === RIGHT_BUTTON
  ) {
    const ts = ds?.tilesize ?? PREFERRED_TILE_SIZE;
    const border = Math.floor(ts / 2);
    const fromCoord = (v: number): number => Math.floor((v - border + ts) / ts) - 1;
    x = fromCoord(p.x);
    y = fromCoord(p.y);
    if (ui.cshow) {
      ui.cshow = false;
      action = "ui";
    }
    if (!inGrid(state, x, y)) {
      ui.showBlackNums = !ui.showBlackNums;
      action = "ui";
    } else if (button === LEFT_BUTTON) {
      action = "black";
    } else if (button === RIGHT_BUTTON) {
      action = "circle";
    }
  } else {
    return null;
  }

  if (action === "ui") return UI_UPDATE;
  if (action === "black" || action === "circle") {
    const i = y * w + x;
    let value: CellValue;
    if (state.flags[i] & (F_BLACK | F_CIRCLE)) value = "empty";
    else value = action === "black" ? "black" : "circle";
    return { sets: [{ x, y, value }] };
  }
  return null;
}

function executeMove(state: SinglesState, move: SinglesMove): SinglesState {
  const next = cloneState(state);
  for (const { x, y, value } of move.sets) {
    if (!inGrid(next, x, y)) throw new Error("singles move out of bounds");
    const i = y * next.w + x;
    next.flags[i] &= ~(F_BLACK | F_CIRCLE);
    if (value === "black") next.flags[i] |= F_BLACK;
    else if (value === "circle") next.flags[i] |= F_CIRCLE;
  }
  if (move.solve) next.usedSolve = true;
  if (checkComplete(next, CC_MARK_ERRORS)) next.completed = true;
  return next;
}

/** The B/C/E diff between two states (upstream game_state_diff). */
function diffMove(src: SinglesState, dst: SinglesState): SinglesMove {
  const sets: SinglesMove["sets"] = [];
  for (let x = 0; x < dst.w; x++) {
    for (let y = 0; y < dst.h; y++) {
      const i = y * dst.w + x;
      const sm = src.flags[i] & (F_BLACK | F_CIRCLE);
      const dm = dst.flags[i] & (F_BLACK | F_CIRCLE);
      if (sm !== dm) {
        const value: CellValue =
          dm & F_BLACK ? "black" : dm & F_CIRCLE ? "circle" : "empty";
        sets.push({ x, y, value });
      }
    }
  }
  return { sets, solve: true };
}

function solve(orig: SinglesState, curr: SinglesState): SolveResult<SinglesMove> {
  let solved = cloneState(curr);
  if (solveSpecific(solved, DIFF_ANY, false) > 0) {
    return { ok: true, move: diffMove(curr, solved) };
  }
  solved = cloneState(orig);
  if (solveSpecific(solved, DIFF_ANY, false) > 0) {
    return { ok: true, move: diffMove(curr, solved) };
  }
  return { ok: false, error: "Unable to solve puzzle." };
}

function findMistakes(state: SinglesState): readonly SinglesMistake[] {
  const solved = makeState(state.w, state.h, state.nums);
  if (solveSpecific(solved, DIFF_ANY, false) <= 0) return [];
  const out: SinglesMistake[] = [];
  for (let i = 0; i < state.n; i++) {
    const pv = state.flags[i] & (F_BLACK | F_CIRCLE);
    if (!pv) continue; // undecided cells are never mistakes
    const sv = solved.flags[i] & (F_BLACK | F_CIRCLE);
    if (pv !== sv) out.push({ x: i % state.w, y: (i / state.w) | 0 });
  }
  return out;
}

// --- hint ------------------------------------------------------------------

interface Cell {
  x: number;
  y: number;
}

/** Highlight data for a Singles hint step. `targets` are the cell(s) the
 * displayed deduction forces, each with the mark it forces; a firing that
 * forces two cells at once (a 2×2 corner of four, an offset pair) carries
 * both. `evidence` are the deduction's premise cells — `redraw` shades an
 * undecided number cell (the digit draws on top) and rings an already-
 * decided black/circle cell whose state *is* the reason. `strand` is the
 * distinct corner cell a 2×2-corner deduction is protecting from being
 * sealed off — drawn in its own colour so the player can tell the corner
 * at risk apart from the matching numbers that share a value. */
export interface SinglesHint {
  targets: { x: number; y: number; value: "black" | "circle" }[];
  evidence: Cell[];
  strand: Cell[];
}

const opValue = (op: number): "black" | "circle" =>
  op === OP_BLACK ? "black" : "circle";

const sameCell = (a: Cell, b: Cell): boolean => a.x === b.x && a.y === b.y;

/** Join a list of cell values into readable prose ("3", "3 and 5",
 * "3, 5 and 2"). Used when a firing forces several squares of differing
 * values so the narration can name each instead of "these squares". */
function joinNums(ns: number[]): string {
  if (ns.length <= 1) return `${ns[0] ?? ""}`;
  if (ns.length === 2) return `${ns[0]} and ${ns[1]}`;
  return `${ns.slice(0, -1).join(", ")} and ${ns[ns.length - 1]}`;
}

/** Narrate *why* the grouped firing forces its cell(s), referencing the
 * highlighted evidence so the words and the picture agree. The corner
 * deductions name the actual numbers involved (owner-directed: concrete
 * values read far clearer than "this square / its other neighbour"). */
function narrate(
  reason: SinglesReason,
  targets: { x: number; y: number }[],
  state: SinglesState,
): string {
  const plural = targets.length > 1;
  const numAt = (c: Cell): number => state.nums[c.y * state.w + c.x];
  switch (reason.kind) {
    case "sandwich": {
      // Indication-first (§1b): name the spotted pattern (two equal numbers
      // one square apart) before the deduction — and name the *values* (the
      // square's locator), not "two matching numbers".
      const n = numAt(reason.ends[0]);
      const b = numAt(targets[0]);
      return `Two ${n}s sit one square apart here; one of them must be shaded, so the ${b} between them must be white.`;
    }
    case "pair": {
      const n = numAt(reason.pair[0]);
      return `These two ${n}s sit next to each other, so one of them stays white and uses it up — every other ${n} in the line must be shaded.`;
    }
    case "corner4": {
      // All four share a number, so a diagonal pair must be shaded (two
      // shaded cells, never adjacent). At a *grid* corner the corner cell's
      // only neighbours are the two sides, so shading the side diagonal
      // would strand the corner white — the same box-in argument as corner3.
      const n = numAt(reason.block[0]);
      return `This corner ${n} matches both its neighbours, so keeping it white would shade them both and box it in — the corner and the ${n} diagonally inside must both be shaded.`;
    }
    case "corner3": {
      // Branch A shades the corner itself; branch B shades the inner cell
      // to save the (separately highlighted) corner. Name the referent
      // explicitly ("the corner") so it never reads as the matching number.
      const m = numAt(reason.matched[1]);
      const t = numAt(targets[0]);
      return targets.some((tg) => sameCell(tg, reason.corner))
        ? `This corner ${t} matches both its neighbouring ${m}s; keeping it white would shade them both, leaving the corner boxed in — so the ${t} must be shaded.`
        : `This inner ${t} matches the two ${m}s flanking the corner ${numAt(reason.corner)}; keeping it white would shade them both, leaving the corner boxed in — so the ${t} must be shaded.`;
    }
    case "corner2": {
      // Indication-first (§1b): open on the spotted pattern — a touching pair
      // of equal numbers at a grid corner — then run the proof-by-contradiction
      // arc with concrete numbers: the move we rule out (shading the target) →
      // its consequence (the corner's neighbour shaded, the corner boxed in) →
      // the deduction. ("at the corner" is robust to either sub-case: the pair
      // is (corner, side) or (side, inner), so it always sits in the corner
      // block; "the ${p} beside the corner ${c}" names the side member either
      // way, and c may equal p when the corner is itself part of the pair.)
      const p = numAt(reason.pair[0]);
      const c = numAt(reason.corner);
      const t = numAt(targets[0]);
      return `A touching pair of ${p}s sits at the corner; one of them must be shaded. Shading this ${t} would then force the ${p} beside the corner ${c} shaded as well, leaving the corner boxed in on both sides — so the ${t} must stay white.`;
    }
    case "offset": {
      // quad = [A1, B1, A2, B2]; the A-pair (n) shares one line, the B-pair
      // (m) the next. Lead with the *indication* (§1b) — the spotted pattern,
      // a pair of n in one line and a pair of m in the next — so the player
      // learns to recognise it, then give the consequence. The pairs can sit
      // ANYWHERE along those lines, so never say "overlap"/"between them";
      // "lined up so that" + the highlight carry the exact arrangement.
      // (Article-free — "one of the Ns" sidesteps "a 4" vs "an 8".)
      const n = numAt(reason.quad[0]);
      const m = numAt(reason.quad[1]);
      const line = reason.quad[0].x === reason.quad[2].x ? "column" : "row";
      const pairs =
        n === m
          ? `a pair of ${n}s in one ${line} and another pair in the next`
          : `a pair of ${n}s in one ${line} and a pair of ${m}s in the next`;
      const forced =
        n === m ? `two of the ${n}s` : `one of the ${n}s and one of the ${m}s`;
      return `There's ${pairs}, lined up so that shading either of these two squares would force ${forced} to be shaded next to each other — and shaded squares can't touch. So both must be white.`;
    }
    case "adjBlack": {
      // The forced cells are a shaded square's neighbours — their values are
      // unrelated to the deduction (it's pure adjacency), but still name them
      // so the player knows which squares without hunting the highlight. The
      // group can hold mixed/repeated values, so list them all.
      if (plural) {
        const list = joinNums(targets.map((t) => numAt(t)));
        return `These squares — ${list} — touch a shaded square, and shaded squares can't be adjacent, so they must be white.`;
      }
      return `This ${numAt(targets[0])} touches a shaded square, and shaded squares can't be adjacent — so it must be white.`;
    }
    case "sameLine": {
      // The forced square(s) and the ringed white square all show the same
      // number — that duplicate is the whole reason — so name it.
      const t = numAt(targets[0]);
      return plural
        ? `These ${t}s share a line with the ringed white ${t}, which already uses that number — so they must be shaded.`
        : `This ${t} shares a line with the ringed white ${t}, which already uses that number — so this copy must be shaded.`;
    }
    case "boxedIn":
      return `This ${numAt(targets[0])} is the ringed white square's only unshaded neighbour left, so it must be white to avoid sealing that square off.`;
    case "split":
      return `Shading this ${numAt(targets[0])} would split the white region in two, so it must be white to keep it connected.`;
  }
}

/** The premise cells a reason reasons over (its visible evidence — the
 * cells that share a number, or the decided cell whose state is the
 * reason). The `strand` corner, when present, is surfaced separately. */
function evidenceOf(reason: SinglesReason): Cell[] {
  switch (reason.kind) {
    case "sandwich":
      return reason.ends;
    case "pair":
      return reason.pair;
    case "corner4":
      return reason.block;
    case "corner3":
      return reason.matched;
    case "corner2":
      return reason.pair;
    case "offset":
      return reason.quad;
    case "adjBlack":
      return [reason.black];
    case "sameLine":
      return [reason.circled];
    case "boxedIn":
      return [reason.cell];
    case "split":
      return reason.neighbours;
  }
}

/** The corner cell a 2×2-corner deduction is protecting (drawn in the
 * distinct strand colour), if any. */
function strandOf(reason: SinglesReason): Cell[] {
  return reason.kind === "corner2" || reason.kind === "corner3"
    ? [reason.corner]
    : [];
}

/** Group the ordered records by firing (`group`) into one step each,
 * preserving deduction order. Records of one firing are contiguous, so a
 * first-seen-order bucket keeps the plan's order. */
function groupRecords(records: HintRecord[]): HintRecord[][] {
  const groups = new Map<number, HintRecord[]>();
  for (const r of records) {
    const g = groups.get(r.group);
    if (g) g.push(r);
    else groups.set(r.group, [r]);
  }
  return [...groups.values()];
}

function hint(state: SinglesState): HintResult<SinglesMove, SinglesHint> {
  if (state.completed) return { ok: false, error: "This board is already solved." };
  if (findMistakes(state).length > 0) {
    return {
      ok: false,
      error:
        "Fix the highlighted mistakes first — a hint can't deduce from a wrong board.",
    };
  }
  const records = deduceHintPlan(state);
  if (records.length === 0) {
    return { ok: false, error: "No further move can be deduced from this position." };
  }
  const steps: HintStep<SinglesMove, SinglesHint>[] = groupRecords(records).map(
    (group) => {
      const reason = group[0].reason;
      const targets = group.map((r) => ({
        x: r.x,
        y: r.y,
        value: opValue(r.op),
      }));
      const key = (c: Cell): number => c.y * state.w + c.x;
      const targetKey = new Set(targets.map(key));
      // The protected corner is drawn in its own colour; keep it out of
      // both the targets and the shaded matching-number evidence.
      const strand = strandOf(reason).filter((c) => !targetKey.has(key(c)));
      const strandKey = new Set(strand.map(key));
      const evidence = evidenceOf(reason).filter(
        (c) => !targetKey.has(key(c)) && !strandKey.has(key(c)),
      );
      return {
        move: { sets: targets.map((t) => ({ x: t.x, y: t.y, value: t.value })) },
        explanation: narrate(reason, targets, state),
        highlights: { targets, evidence, strand },
      };
    },
  );
  return { ok: true, steps };
}

/** A move completes a step when it sets every target cell to its hinted
 * value; a move filling a strict subset of a multi-cell step (and nothing
 * else) is `"onTrack"`, shrinking the step in place to what remains. */
function hintKeepTrack(
  m: SinglesMove,
  step: HintStep<SinglesMove, SinglesHint>,
  state: SinglesState,
): HintTrackVerdict {
  if (m.solve) return "off";
  const targets = step.highlights?.targets ?? [];
  if (targets.length === 0) return "off";
  const want = new Map<number, "black" | "circle">();
  for (const t of targets) want.set(t.y * state.w + t.x, t.value);

  let matched = 0;
  for (const s of m.sets) {
    const want_v = want.get(s.y * state.w + s.x);
    if (want_v === undefined || s.value !== want_v) return "off";
    matched++;
  }
  if (matched === 0) return "off";
  if (matched === want.size) return "completed";

  // Strict subset of a multi-cell step: keep it displayed, shrunk to the
  // cells still outstanding (permitted on "onTrack").
  const done = new Set(m.sets.map((s) => s.y * state.w + s.x));
  const remaining = targets.filter((t) => !done.has(t.y * state.w + t.x));
  step.move = { sets: remaining.map((t) => ({ x: t.x, y: t.y, value: t.value })) };
  step.highlights = {
    targets: remaining,
    evidence: step.highlights?.evidence ?? [],
    strand: step.highlights?.strand ?? [],
  };
  return "onTrack";
}

function flashLength(
  from: SinglesState,
  to: SinglesState,
  _dir: number,
  _ui: SinglesUi,
): number {
  if (!from.completed && to.completed && !to.usedSolve) return FLASH_TIME;
  return 0;
}

export const singlesGame: Game<
  SinglesParams,
  SinglesState,
  SinglesMove,
  SinglesUi,
  SinglesDrawState,
  SinglesMistake
> = {
  id: "singles",
  wantsStatusbar: false,
  isTimed: false,
  canSolve: true,
  canFormatAsText: true,

  defaultParams,
  presets,
  encodeParams,
  decodeParams,
  validateParams,

  newDesc: (p, rng) => newSinglesDesc(p, rng),
  validateDesc,
  newState,
  newUi,
  changedState,

  interpretMove,
  executeMove,
  status,

  solve,
  hint,
  hintKeepTrack,
  findMistakes,

  textFormat,

  prefs: [
    {
      kw: "show-black-nums",
      name: "Show numbers on black squares",
      type: "boolean",
      get: (ui) => ui.showBlackNums,
      set: (ui, v) => {
        ui.showBlackNums = v;
      },
    },
  ],

  colours: (defaultBackground: Colour): Colour[] => colours(defaultBackground),
  preferredTileSize: PREFERRED_TILE_SIZE,
  computeSize: (p: SinglesParams, ts: number): Size => computeSize(p, ts),
  setTileSize,
  newDrawState,
  redraw,

  animLength: () => 0,
  flashLength,
};

registerGame(singlesGame);
