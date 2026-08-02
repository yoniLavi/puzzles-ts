/**
 * Salad's explained hint — a **candidate-elimination** plan
 * ([hint-authoring §9](../../../../docs/porting/hint-authoring.md)).
 *
 * Salad is the first candidate game whose value set is not uniform: its
 * `order − nums` hole symbols are interchangeable, so in the *cube* they are
 * perfectly Latin while on the *player's board* they collapse into one
 * "might be empty" X mark and, once settled, into an empty-square marker. The
 * consequences run through this whole file, so they are worth stating once:
 *
 * 1. **A square's emptiness is a marker, never a placement.** The cube never
 *    collapses on a hole square (nothing decides *which* hole symbol sits
 *    there), so there is no naked single for "empty". A cross/ball is reached by
 *    Salad's own hole deductions, and is emitted as a marker step whose *why* is
 *    re-derived from the board the player can see (§9.3a's rule, applied to
 *    markers): a line's counts first, then a note collapse, and only then the
 *    honest weaker "taking this row and column together" arm.
 * 2. **Only the border deduction needs to be recorded.** Salad's sync and count
 *    deductions write markers, not candidates, so their conclusions are
 *    re-derived above rather than recorded; the recorder is threaded through the
 *    ABC End View border scan alone (`solver.ts`), which is also the one Salad
 *    deduction that strikes candidates the player holds notes for.
 * 3. **The walk terminates on {@link latinholesCheck}, not "the grid is full".**
 *    A solved board legitimately leaves `order − nums` squares per line blank
 *    (the port's finding F3), so a fill-the-grid loop would never end.
 *
 * The reusable mechanics come from `engine/candidate-hint.ts` and
 * `engine/latin-hint.ts`; what lives here is the walk, the reason union and the
 * meaning — plus the `NoteEncoding` (`bit(n) = 1 << (n − 1)`, `values = nums + 1`)
 * that lets those helpers read Salad's notes at all.
 */

import {
  type CandidateHighlights,
  type CandidateMoveAdapter,
  type Cell,
  candidateHint,
  cleanObviousText,
  emitObviousCleanStep,
  keepCandidateHintTrack,
  type Mark,
  type NoteEncoding,
  nextPlace,
  nextStrike,
  populateStep,
  refreshCandidateHintStep,
  regionDuplicateMarks,
} from "../../engine/candidate-hint.ts";
import type { DeductionRecord } from "../../engine/deduction-record.ts";
import type { HintResult, HintStep, HintTrackVerdict } from "../../engine/game.ts";
import {
  hiddenSingleLine,
  joinWith,
  type LatinVocab,
  narrateLatinReason,
  rowColRegions,
  type SingleReason,
  singlePlacementReason,
} from "../../engine/latin-hint.ts";
import { stepBudget } from "../../engine/step-budget.ts";
import {
  type BorderReason,
  recordSaladDeductions,
  saladFindMistakes,
} from "./solver.ts";
import {
  borderScanFor,
  CIRCLE,
  CROSS,
  clueSide,
  GAMEMODE_LETTERS,
  latinholesCheck,
  needsPencilFill,
  type SaladBoard,
  type SaladMark,
  type SaladMove,
  type SaladState,
  type SaladUi,
  saladNotes,
  saladRegions,
} from "./state.ts";

// --- reasons ---------------------------------------------------------------

/** Why the hint's next step is forced. Salad's own arms, plus the generic Latin
 * ones it inherits from the shared solver (narrated by `narrateLatinReason`). */
export type SaladReason =
  | BorderReason
  /** A line already carries every empty square it may hold, so the rest of it
   * must hold symbols. */
  | { kind: "countHolesDone"; line: "row" | "col"; index: number }
  /** A line's symbol-holding squares are all accounted for, so the rest of it
   * must be empty. `allPlaced` distinguishes "all its letters are written in"
   * from "we know which squares hold them". */
  | { kind: "countLettersDone"; line: "row" | "col"; index: number; allPlaced: boolean }
  /** The square's notes have come down to the empty-square mark alone. */
  | { kind: "crossNaked" }
  /** No cheaper reason explains the marker — the honest weaker arm, the
   * marker analogue of `forcedSingle`. */
  | { kind: "forcedCross" }
  | { kind: "forcedCircle" }
  /** Tidy-up leg: squares just settled as holding a symbol keep no
   * "might be empty" mark. */
  | { kind: "circleXNote" }
  | SingleReason
  | { kind: "dup"; n: number; px: number; py: number }
  | { kind: "set" }
  | { kind: "forcing" };

/** What a Salad hint step draws (hint-authoring §5.3's element legend):
 * `area` is the deduction's evidence, `targets` the squares it acts on, `marks`
 * the notes it strikes, `clues` the border clues it reasons from, and `ghost`
 * the entry it is asking for, previewed in `COL_HINT` (§5.1a — Salad has three
 * move shapes and each echoes its own). */
export interface SaladHint extends CandidateHighlights {
  clues: number[];
  ghost?: "cross" | "circle" | number;
}

type SaladOp = DeductionRecord & { reason: SaladReason };

// --- vocabulary ------------------------------------------------------------

/** `A`, `B`, … in ABC End View; `1`, `2`, … in Number Ball. */
export function symbolChar(mode: number, n: number): string {
  return String.fromCharCode((mode === GAMEMODE_LETTERS ? 64 : 48) + n);
}

/** Salad's value vocabulary for the shared generic-Latin narration arms — the
 * one place its two modes differ in words rather than logic. */
function saladVocab(mode: number): LatinVocab {
  return {
    noun: mode === GAMEMODE_LETTERS ? "letter" : "number",
    value: (n) => symbolChar(mode, n),
    cell: "square",
  };
}

/** `1 square` / `3 squares`. */
function count(k: number, one: string, many = `${one}s`): string {
  return `${k} ${k === 1 ? one : many}`;
}

// --- narration -------------------------------------------------------------

/**
 * Narrate *why* a step is forced (hint-authoring §2): lead with the indication,
 * give the reasoning, conclude in the necessity voice. `ns` is the value list the
 * step acts on — the placed symbol for a placement, the struck candidates for a
 * strike.
 */
export function narrate(
  reason: SaladReason,
  ns: number[],
  state: { mode: number; order: number; nums: number },
): string {
  const { mode, order, nums } = state;
  const vocab = saladVocab(mode);
  const noun = vocab.noun;
  const sym = (n: number): string => symbolChar(mode, n);
  const list = (xs: number[]): string => joinWith(xs.map(sym));

  switch (reason.kind) {
    case "borderNear": {
      const { side } = clueSide(reason.clue, order);
      const clue = sym(reason.clueVal);
      const lead = `The clue ${side === "top" || side === "bottom" ? `${side === "top" ? "above" : "below"} this column` : `to the ${side} of this row`} sees ${clue} first`;
      const gap =
        reason.skipped === 0
          ? `, and this is the nearest square to it`
          : `, and the ${count(reason.skipped, "square")} between it and this one ${reason.skipped === 1 ? "is" : "are"} already marked empty`;
      return `${lead}${gap} — so nothing but ${clue} can go here, and we must cross out ${list(ns)}.`;
    }
    case "borderFar": {
      const { side, axis } = clueSide(reason.clue, order);
      const clue = sym(reason.clueVal);
      const where =
        side === "top" || side === "bottom"
          ? `${side === "top" ? "above" : "below"} this column`
          : `to the ${side} of this row`;
      if (reason.circleAt !== null) {
        return `The clue ${where} sees ${clue} first, and the shaded square furthest from it already holds ${vocab.noun === "letter" ? "a letter" : "a number"} — so the ${clue} must sit somewhere in the shaded run. We must cross out the ${clue} past it.`;
      }
      const bound =
        reason.reach === 0
          ? `must be in the square nearest the clue`
          : `must be within the first ${count(reason.reach + 1, "square")} from the clue`;
      const tighten =
        reason.tightenedBy > 0
          ? ` and ${reason.tightenedBy === 1 ? "one of them is" : `${reason.tightenedBy} of them are`} already marked further along`
          : ``;
      return `The clue ${where} sees ${clue} first, so every square before its ${clue} must be empty. This ${axis} has room for only ${count(reason.holes, "empty square")}${tighten}, so the ${clue} ${bound}. We must cross out the ${clue} beyond that.`;
    }
    case "countHolesDone": {
      const axis = reason.line === "row" ? "row" : "column";
      const k = order - nums;
      // Reads correctly at the degenerate extreme too (§2.7): `nums = order − 1`
      // leaves exactly one empty square per line.
      const has =
        k === 1
          ? "its one empty square"
          : k === 2
            ? "both of its empty squares"
            : `all ${k} of its empty squares`;
      return `This ${axis} already has ${has}, so every other square in it must hold a ${noun}.`;
    }
    case "countLettersDone": {
      const axis = reason.line === "row" ? "row" : "column";
      // The two halves of one firing: either the line's symbols are all written
      // in, or we merely know *which* squares hold them (a line of balls). Each
      // claims only what it has (§2.6).
      return reason.allPlaced
        ? `All ${count(nums, noun)} of this ${axis} are already placed, so every other square in it must be empty.`
        : `We already know which ${count(nums, "square")} of this ${axis} hold its ${noun}s, so every other square in it must be empty.`;
    }
    case "crossNaked":
      return `The empty-square mark is the only one left in this square — every ${noun} has been ruled out here — so it must be empty.`;
    case "forcedCross":
      return `Working through this square's row and column together, no ${noun} can still go here — so it must be empty.`;
    case "forcedCircle":
      return `Working through this square's row and column together, this square cannot be one of the empty ones — so it holds a ${noun}, even though we don't know which yet.`;
    case "circleXNote":
      return `These squares are now known to hold a ${noun}, so we must cross out their empty-square marks.`;
    default:
      return narrateLatinReason(reason, ns, vocab);
  }
}

/** The evidence to shade (`area`) and the border clues to light (`clues`) for a
 * reason — hint-authoring §5.2: show the premise as an area, not one cell. A
 * border deduction shades exactly the run of squares its argument is about, read
 * off the shared {@link borderScanFor} rather than re-derived. */
function reasonEvidence(
  reason: SaladReason,
  o: number,
): { area: Cell[]; clues: number[] } {
  const cellAt = (i: number): Cell => ({ x: i % o, y: (i / o) | 0 });
  switch (reason.kind) {
    case "borderNear": {
      const s = borderScanFor(reason.clue, o);
      // From the clue up to and including the first square that could hold
      // anything — the squares the "sees it first" argument walks over.
      const area: Cell[] = [];
      let i = s.start;
      for (let k = 0; k <= reason.skipped; k++, i += s.step) area.push(cellAt(i));
      return { area, clues: [reason.clue] };
    }
    case "borderFar": {
      const s = borderScanFor(reason.clue, o);
      // The run the clue's own symbol is confined to: up to the blocking ball,
      // else the counting bound.
      const area: Cell[] = [];
      for (let i = s.start; i !== s.end; i += s.step) {
        area.push(cellAt(i));
        if (
          reason.circleAt !== null ? i === reason.circleAt : area.length > reason.reach
        )
          break;
      }
      return { area, clues: [reason.clue] };
    }
    case "countHolesDone":
    case "countLettersDone":
      return { area: hiddenSingleLine(reason.line, reason.index, o), clues: [] };
    case "hiddenSingle":
      return { area: hiddenSingleLine(reason.line, reason.index, o), clues: [] };
    default:
      return { area: [], clues: [] };
  }
}

// --- the plan walk ---------------------------------------------------------

/** A working copy of everything the player can see, advanced as the plan is
 * built. Notes hidden on screen (a crossed or filled square shows none) are
 * dropped, so the walk can never teach a strike the player cannot see. */
interface Working {
  grid: Uint8Array;
  holes: Uint8Array;
  marks: Int32Array;
}

function startWorking(s: SaladState): Working {
  const w: Working = {
    grid: Uint8Array.from(s.grid),
    holes: Uint8Array.from(s.holes),
    marks: Int32Array.from(s.marks),
  };
  for (let i = 0; i < w.marks.length; i++) {
    if (w.grid[i] !== 0 || w.holes[i] === CROSS) w.marks[i] = 0;
  }
  return w;
}

/**
 * The grid the *placement* window is judged against — `firstUnreflectedPlaceIndex`
 * and `nextPlace`'s "is this cell decided yet?". Salad is the first game where
 * that differs from the symbol grid: the cube places one of its interchangeable
 * hole symbols in a square the player settles with an empty-square marker, and
 * that square's grid entry stays blank for ever, so judging by `grid` alone would
 * leave the op permanently unreflected and wall off every strike recorded after
 * it.
 */
function placedProbe(w: Working): Uint8Array {
  const out = Uint8Array.from(w.grid);
  for (let i = 0; i < out.length; i++) {
    if (out[i] === 0 && w.holes[i] === CROSS) out[i] = 255;
  }
  return out;
}

/** A square whose notes have come down to a single *symbol* — the move a person
 * makes next. The X-mark-only case is a *cross*, not a placement (see the file
 * header), and is handled by the marker pass. */
function nakedSymbol(w: Working, o: number, nums: number): Mark | null {
  for (let i = 0; i < o * o; i++) {
    if (w.grid[i] !== 0 || w.holes[i] === CROSS) continue;
    const m = w.marks[i];
    if (m === 0 || (m & (m - 1)) !== 0) continue;
    for (let n = 1; n <= nums; n++) {
      if (m === 1 << (n - 1)) return { x: i % o, y: (i / o) | 0, n };
    }
  }
  return null;
}

/** One marker deduction: the squares it settles, the marker it settles them to,
 * and why. */
interface MarkerFiring {
  mark: "cross" | "circle";
  cells: Cell[];
  reason: SaladReason;
}

/** The cheapest marker deduction available on the board *as the player sees it*
 * — a line's counts first (visible and countable, §2.8), then a note collapse.
 * Returns `null` when neither applies; the caller then falls through to the
 * recorded strikes/placements and finally to the cube's own verdict. */
function nextCheapMarker(w: Working, o: number, nums: number): MarkerFiring | null {
  const lines: { line: "row" | "col"; index: number; cells: number[] }[] = [];
  for (let y = 0; y < o; y++) {
    const cells: number[] = [];
    for (let x = 0; x < o; x++) cells.push(y * o + x);
    lines.push({ line: "row", index: y, cells });
  }
  for (let x = 0; x < o; x++) {
    const cells: number[] = [];
    for (let y = 0; y < o; y++) cells.push(y * o + x);
    lines.push({ line: "col", index: x, cells });
  }

  const at = (i: number): Cell => ({ x: i % o, y: (i / o) | 0 });

  for (const l of lines) {
    let crosses = 0;
    let circles = 0;
    let placed = 0;
    const blank: number[] = [];
    for (const i of l.cells) {
      if (w.holes[i] === CROSS) crosses++;
      else if (w.holes[i] === CIRCLE) {
        circles++;
        if (w.grid[i] !== 0) placed++;
      } else blank.push(i);
    }
    if (blank.length === 0) continue;
    if (crosses === o - nums) {
      return {
        mark: "circle",
        cells: blank.map(at),
        reason: { kind: "countHolesDone", line: l.line, index: l.index },
      };
    }
    if (circles === nums) {
      return {
        mark: "cross",
        cells: blank.map(at),
        reason: {
          kind: "countLettersDone",
          line: l.line,
          index: l.index,
          allPlaced: placed === nums,
        },
      };
    }
  }

  // A square whose notes have collapsed onto the empty-square mark alone.
  const xbit = 1 << nums;
  for (let i = 0; i < o * o; i++) {
    if (w.grid[i] !== 0 || w.holes[i] !== 0) continue;
    if (w.marks[i] === xbit) {
      return { mark: "cross", cells: [at(i)], reason: { kind: "crossNaked" } };
    }
  }
  return null;
}

/** A marker the cube forces that no cheaper reason explained — the honest weaker
 * arm (`forcedCross` / `forcedCircle`), reached only once every recorded strike
 * and placement is already on the working board. */
function nextForcedMarker(
  w: Working,
  fixpointHoles: Uint8Array,
  o: number,
): MarkerFiring | null {
  for (let i = 0; i < o * o; i++) {
    if (w.holes[i] !== 0 || w.grid[i] !== 0) continue;
    const m = fixpointHoles[i];
    if (m !== CROSS && m !== CIRCLE) continue;
    return {
      mark: m === CROSS ? "cross" : "circle",
      cells: [{ x: i % o, y: (i / o) | 0 }],
      reason: { kind: m === CROSS ? "forcedCross" : "forcedCircle" },
    };
  }
  return null;
}

/** Salad's dialect for the shared plan mechanics. The three canonical shapes map
 * onto `set`/`pencil`/`markAll`/`pencilStrike`; the **marker** entries are a
 * fourth shape the canonical set has no room for, so they are read as `null`
 * here (⇒ off-plan) and handled by {@link hintKeepTrack} /
 * {@link refreshHintStep} before they delegate. */
export const saladCandidateMoves: CandidateMoveAdapter<SaladMove> = {
  read: (m) => {
    // Both fills read as the canonical populate: the plan asks for the additive
    // `pencilAll`, and a legacy move log's resetting `markAll` did at least as
    // much, so either satisfies the step.
    if (m.type === "pencilAll" || m.type === "markAll") return { type: "pencilAll" };
    if (m.type === "pencilStrike") return { type: "pencilStrike", marks: [...m.marks] };
    if ((m.type === "set" || m.type === "pencil") && typeof m.value === "number") {
      return {
        type: "set",
        x: m.x,
        y: m.y,
        n: m.value,
        pencil: m.type === "pencil",
      };
    }
    // A pencilled X mark is a note strike on the collapsed hole candidate.
    if (m.type === "pencil" && m.value === "cross") {
      return { type: "set", x: m.x, y: m.y, n: -1, pencil: true };
    }
    return null;
  },
  strike: (marks) => ({ type: "pencilStrike", marks }),
  bit: (n) => 1 << (n - 1),
};

/** True when `move` writes one of Salad's two emptiness markers as a real entry
 * — the move shape the canonical `CandidateMove` set has no member for. */
function markerMove(
  move: SaladMove,
): { x: number; y: number; mark: "cross" | "circle" } | null {
  if (move.type !== "set") return null;
  if (move.value === "cross") return { x: move.x, y: move.y, mark: "cross" };
  if (move.value === "circle") return { x: move.x, y: move.y, mark: "circle" };
  return null;
}

interface Builder {
  steps: HintStep<SaladMove, SaladHint>[];
  w: Working;
  o: number;
  nums: number;
  state: SaladState;
  enc: NoteEncoding;
}

function pushStrike(
  b: Builder,
  marks: SaladMark[],
  reason: SaladReason,
  continues: boolean,
): void {
  const ev = reasonEvidence(reason, b.o);
  b.steps.push({
    move: { type: "pencilStrike", marks },
    explanation: narrate(
      reason,
      marks.map((m) => m.n),
      b.state,
    ),
    highlights: {
      ...ev,
      targets: marks.map((m) => ({ x: m.x, y: m.y })),
      marks,
    },
    continuesPrevious: continues,
  });
  for (const m of marks) b.w.marks[m.y * b.o + m.x] &= ~(1 << (m.n - 1));
}

/** Emit a placement and apply it, then teach the row/column note cull it forces
 * as a continuation leg (Salad has no auto-pencil preference, so `autoClean` is
 * only ever set by a caller that has one). */
function pushPlacement(
  b: Builder,
  x: number,
  y: number,
  n: number,
  reason: SaladReason,
  autoClean: boolean,
  continues = false,
): void {
  const { o, w } = b;
  const ev = reasonEvidence(reason, o);
  b.steps.push({
    move: { type: "set", x, y, value: n },
    explanation: narrate(reason, [n], b.state),
    highlights: { ...ev, targets: [{ x, y }], marks: [], ghost: n },
    continuesPrevious: continues,
  });
  w.grid[y * o + x] = n;
  w.holes[y * o + x] = CIRCLE;
  w.marks[y * o + x] = 0;

  const dup = regionDuplicateMarks(
    w.grid,
    w.marks,
    x,
    y,
    n,
    o,
    rowColRegions(x, y, o),
    b.enc,
  );
  if (dup.length > 0 && !autoClean) {
    pushStrike(b, dup, { kind: "dup", n, px: x, py: y }, true);
  } else {
    for (const m of dup) w.marks[m.y * o + m.x] &= ~(1 << (m.n - 1));
  }
}

/** Emit one marker firing as a single journey — one deduction, one hint
 * (quality-bar rule 2) — followed by a folded tidy-up leg clearing the
 * "might be empty" marks the balls it just placed have made impossible. */
function pushMarkers(b: Builder, f: MarkerFiring): void {
  const { o, w, nums } = b;
  const ev = reasonEvidence(f.reason, o);
  const xbit = 1 << nums;
  const tidy: SaladMark[] = [];
  f.cells.forEach((c, j) => {
    const i = c.y * o + c.x;
    b.steps.push({
      move: { type: "set", x: c.x, y: c.y, value: f.mark },
      explanation: narrate(f.reason, [], b.state),
      highlights: { ...ev, targets: [c], marks: [], ghost: f.mark },
      continuesPrevious: j > 0,
    });
    w.holes[i] = f.mark === "cross" ? CROSS : CIRCLE;
    if (f.mark === "cross") w.marks[i] = 0;
    else if (w.marks[i] & xbit) tidy.push({ x: c.x, y: c.y, n: nums + 1 });
  });
  if (tidy.length > 0) pushStrike(b, tidy, { kind: "circleXNote" }, true);
}

/**
 * Build the plan by walking a working copy of the board the way a person plays:
 * a collapsed square first, then the visible line counts, then (once notes
 * exist) the border and generic eliminations, then the placements they force,
 * and only last the deductions that need the whole row and column taken
 * together.
 */
function buildSteps(
  state: SaladState,
  autoClean: boolean,
): HintStep<SaladMove, SaladHint>[] {
  const o = state.order;
  const nums = state.nums;
  const steps: HintStep<SaladMove, SaladHint>[] = [];
  const w = startWorking(state);
  const enc = saladNotes(nums);
  const b: Builder = { steps, w, o, nums, state, enc };
  const vocab = saladVocab(state.mode);
  const regionsOf = saladRegions(o);
  const board = (): SaladBoard => ({
    order: o,
    nums,
    mode: state.mode,
    borderclues: state.borderclues,
    gridclues: state.gridclues,
    grid: w.grid,
    holes: w.holes,
  });

  // The same predicate the Mark-all button's fill half uses, so the opener fires
  // exactly when a press of that button would fill something.
  const working = { order: o, grid: w.grid, holes: w.holes, marks: w.marks };
  let populated = !needsPencilFill(working);
  let cleaned = false;

  const allMarks = (1 << (nums + 1)) - 1;
  const symbolMarks = (1 << nums) - 1;
  /**
   * The opener: pencil in the squares that carry no mark yet, and **only** those
   * (the additive `pencilAll`, not upstream's resetting `markAll`).
   *
   * Owner-reported 2026-07-29: filling with `markAll` threw away notes the player
   * had already narrowed, on any board with *some* pencilled squares and *some*
   * blank ones. The working copy has to mirror the additive fill exactly, or the
   * plan would go on to teach strikes on candidates the player had already
   * crossed out — a step whose mark is invisible on their board. (The shared
   * `lazyPopulate` still fills every empty cell, which is the same defect in the
   * rest of the family — see the change's design `F8`.)
   */
  const populate = (): void => {
    for (let i = 0; i < o * o; i++) {
      if (w.grid[i] === 0 && w.holes[i] !== CROSS && w.marks[i] === 0) {
        w.marks[i] = w.holes[i] === CIRCLE ? symbolMarks : allMarks;
      }
    }
    steps.push(
      populateStep<SaladMove, SaladHint>(
        { type: "pencilAll" },
        `Start by pencilling in every candidate ${vocab.noun} in each empty square that hasn't any yet, so the eliminations that follow have something to cross out.`,
      ),
    );
    populated = true;
  };

  let rec = recordSaladDeductions(board(), state.diff);
  const budget = stepBudget("salad hint plan");
  const cap = o * o * (nums + 4) + 8;
  let lastStrikeGroup = -1;

  for (let guard = 0; guard < cap; guard++) {
    budget.tick();
    if (latinholesCheck(board())) break;

    // 1. A square whose notes have come down to one symbol.
    const ns = nakedSymbol(w, o, nums);
    if (ns) {
      pushPlacement(b, ns.x, ns.y, ns.n, { kind: "single" }, autoClean);
      rec = recordSaladDeductions(board(), state.diff);
      lastStrikeGroup = -1;
      continue;
    }

    // 2. The cheapest emptiness deduction: a line's counts, or a collapse onto
    //    the empty-square mark. Both need no notes beyond what is on screen, so
    //    a Number Ball board opens on them rather than on "pencil everything in".
    const cheap = nextCheapMarker(w, o, nums);
    if (cheap) {
      pushMarkers(b, cheap);
      rec = recordSaladDeductions(board(), state.diff);
      lastStrikeGroup = -1;
      continue;
    }

    // 3. Notes are needed from here on, so fill them in — as the player's own
    //    Mark-all move, once.
    if (!populated) {
      populate();
      lastStrikeGroup = -1;
      continue;
    }

    // 3a. …then bulk-clear the candidates a placed symbol already rules out, in
    //     one step, so the walk teaches real deductions rather than N trivial
    //     row/column culls (hint-authoring §9.2).
    if (!cleaned) {
      cleaned = true;
      if (
        emitObviousCleanStep<SaladMove, SaladHint>(
          steps,
          w.grid,
          w.marks,
          o,
          regionsOf,
          cleanObviousText(vocab.noun, "placed", "row or column", "square"),
          { enc, adapter: saladCandidateMoves },
        )
      ) {
        // The shared helper builds the common highlight fields; Salad's carry a
        // clue list too.
        const step = steps[steps.length - 1];
        step.highlights = { ...(step.highlights as SaladHint), clues: [] };
        lastStrikeGroup = -1;
        continue;
      }
    }

    // 4. The next teachable elimination. Hole-symbol eliminations are dropped:
    //    an individual hole symbol has no note of its own (the X mark stands for
    //    all of them at once), so there is nothing on screen to cross out — but
    //    hole *placements* are kept, because they still bound the window of
    //    strikes whose premise the board already supports.
    const probe = placedProbe(w);
    const ops = rec.ops as SaladOp[];
    const strikeOps = ops.filter((op) => op.kind === "place" || op.n <= nums);
    const strike = nextStrike(strikeOps, w.grid, w.marks, o, { enc, placed: probe });
    if (strike) {
      const group = strike[0].group;
      let continues = group === lastStrikeGroup;
      for (const leg of splitStrike(strike, o)) {
        pushStrike(b, leg.marks, leg.reason, continues);
        continues = true;
      }
      lastStrikeGroup = group;
      continue;
    }

    // 5. A forced placement — re-derive a generic `single`'s *why* from the
    //    working board (§9.3a); Salad records no placement reasons of its own.
    const placeOps = ops.filter((op) => op.kind === "place" && op.n <= nums);
    const place = nextPlace(placeOps, probe, o);
    if (place) {
      const reason: SaladReason =
        place.reason.kind === "single"
          ? singlePlacementReason(w.grid, w.marks, place.x, place.y, place.n, o, enc)
          : place.reason;
      pushPlacement(b, place.x, place.y, place.n, reason, autoClean);
      rec = recordSaladDeductions(board(), state.diff);
      lastStrikeGroup = -1;
      continue;
    }

    // 6. A marker the row and column force together, with nothing cheaper to
    //    say about it.
    const forced = nextForcedMarker(w, rec.holes, o);
    if (forced) {
      pushMarkers(b, forced);
      rec = recordSaladDeductions(board(), state.diff);
      lastStrikeGroup = -1;
      continue;
    }

    break; // nothing further is deducible from here
  }

  return steps;
}

/**
 * Split one firing's live eliminations into journey legs. The axis follows what
 * the narration names singular (hint-authoring §9.3): the far border arm names
 * the clue's *symbol* and rules it out along a run, so it is one multi-square
 * leg; everything else names *this square*, so it splits by square.
 */
function splitStrike(
  live: SaladOp[],
  o: number,
): { marks: SaladMark[]; reason: SaladReason }[] {
  const out: { marks: SaladMark[]; reason: SaladReason }[] = [];
  const byKey = new Map<string, SaladOp[]>();
  for (const op of live) {
    const kind = (op.reason as { kind: string }).kind;
    const key = kind === "borderFar" ? `far:${op.n}` : `${kind}:${op.y * o + op.x}`;
    const bucket = byKey.get(key);
    if (bucket) bucket.push(op);
    else byKey.set(key, [op]);
  }
  for (const bucket of byKey.values()) {
    out.push({
      marks: bucket.map((op) => ({ x: op.x, y: op.y, n: op.n })),
      reason: bucket[0].reason,
    });
  }
  return out;
}

// --- the Game hooks --------------------------------------------------------

export function hint(
  state: SaladState,
  _aux?: string,
  _ui?: SaladUi,
): HintResult<SaladMove, SaladHint> {
  // No `autoPencil` preference to honour: Salad has no auto-elimination on
  // placement, so the plan always teaches the row/column note cull explicitly.
  return candidateHint(state, undefined, saladFindMistakes, buildSteps);
}

/** Classify a player move against the displayed step. Salad's two emptiness
 * markers are a move shape the shared mechanics have no member for, so they are
 * judged here; everything else delegates. */
export function hintKeepTrack(
  m: SaladMove,
  step: HintStep<SaladMove, SaladHint>,
  state: SaladState,
): HintTrackVerdict {
  const want = markerMove(step.move);
  if (want) {
    const got = markerMove(m);
    return got && got.x === want.x && got.y === want.y && got.mark === want.mark
      ? "completed"
      : "off";
  }
  return keepCandidateHintTrack(m, step, state.marks, state.order, saladCandidateMoves);
}

/** Re-validate a stored step before it is (re-)displayed. A marker step is
 * resolved once the square carries that marker — which the shared placement arm
 * cannot see, because a cross leaves the grid blank for ever. */
export function refreshHintStep(
  step: HintStep<SaladMove, SaladHint>,
  state: SaladState,
): HintStep<SaladMove, SaladHint> | null {
  const want = markerMove(step.move);
  if (want) {
    const at = state.holes[want.y * state.order + want.x];
    const already = want.mark === "cross" ? at === CROSS : at === CIRCLE;
    return already ? null : step;
  }
  return refreshCandidateHintStep(
    step,
    state.grid,
    state.marks,
    state.order,
    saladCandidateMoves,
  );
}
