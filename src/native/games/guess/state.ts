/**
 * Guess — state, params, desc codec, and the scoring/markability logic.
 *
 * Idiomatic rendering of `puzzles/guess.c`: the *live editing* state
 * (working row, holds, drag, cursor) lives in `GuessUi` exactly as
 * upstream keeps it in `game_ui`; `GuessState` holds only the submitted
 * guesses (with feedback), the hidden solution, and the play cursor.
 */

import type { GameStatus } from "../../../puzzle/types.ts";
import { type RandomState, randomUpto } from "../../random/index.ts";
import { bin2hex, hex2bin, obfuscateBitmap } from "./obfuscate.ts";

// --- feedback codes (upstream FEEDBACK_*) -----------------------------

export const FEEDBACK_CORRECTPLACE = 1;
export const FEEDBACK_CORRECTCOLOUR = 2;

export const MAXCOLOURS = 10;

// --- types ------------------------------------------------------------

export interface GuessParams {
  ncolours: number;
  npegs: number;
  nguesses: number;
  allowBlank: boolean;
  allowMultiple: boolean;
}

/** A row of pegs and its feedback (both length `npegs`). Pegs are
 * `1..ncolours`; `0` is empty. Feedback per slot is `0`, or
 * `FEEDBACK_CORRECTPLACE` / `FEEDBACK_CORRECTCOLOUR` packed
 * black-markers-then-white-markers (upstream `mark_pegs`). */
export interface PegRow {
  pegs: number[];
  feedback: number[];
}

export interface GuessState {
  readonly params: GuessParams;
  /** Length `nguesses`; rows at or beyond `nextGo` are blank (unless a
   * win froze the board with the winning row at `nextGo`). */
  readonly guesses: readonly PegRow[];
  /** Holds as they stood when the last guess was submitted (length
   * `npegs`). The *live* holds the player is editing live in `GuessUi`. */
  readonly holds: readonly boolean[];
  /** The hidden answer, length `npegs`, values `1..ncolours`. */
  readonly solution: readonly number[];
  /** `0..nguesses`; `nextGo === nguesses` means the rows are exhausted. */
  readonly nextGo: number;
  /** `+1` win, `-1` lose/revealed, `0` still playing. */
  readonly solved: number;
}

/** Submit the working row (`pegs`/`holds` snapshot), or reveal the
 * answer. Both are JSON-safe → the default move codec suffices. */
export type GuessMove =
  | { type: "guess"; pegs: number[]; holds: boolean[] }
  | { type: "solve" };

export interface GuessUi {
  params: GuessParams;
  /** Working (half-finished) row, length `npegs`, `0` = empty. */
  currPegs: number[];
  /** Live holds, length `npegs`. */
  holds: boolean[];
  /** Up-down colour-picker cursor, `0..ncolours-1`. */
  colourCur: number;
  /** Left-right peg-picker cursor, `0..npegs` (`npegs` = the submit
   * position). */
  pegCur: number;
  displayCur: boolean;
  markable: boolean;
  /** `0` = not dragging, else a colour `1..ncolours`. */
  dragCol: number;
  /** Drag position — *centre* of the floating peg, in pixels. */
  dragX: number;
  dragY: number;
  /** Source peg index when dragging from a current-row peg, else `-1`. */
  dragOpeg: number;
  showLabels: boolean;
  /** Cached lexicographically-first row, narrowed incrementally by
   * `computeHint` (rebuilt from scratch after an undo). */
  hint: number[] | null;
}

// --- pegrow helpers ---------------------------------------------------

function blankRow(npegs: number): PegRow {
  return { pegs: new Array(npegs).fill(0), feedback: new Array(npegs).fill(0) };
}

function cloneRow(row: PegRow): PegRow {
  return { pegs: row.pegs.slice(), feedback: row.feedback.slice() };
}

export function cloneState(s: GuessState): GuessState {
  return {
    params: s.params,
    guesses: s.guesses.map(cloneRow),
    holds: s.holds.slice(),
    solution: s.solution.slice(),
    nextGo: s.nextGo,
    solved: s.solved,
  };
}

// --- params -----------------------------------------------------------

export function defaultParams(): GuessParams {
  // The canonical Mastermind ruleset.
  return { ncolours: 6, npegs: 4, nguesses: 10, allowBlank: false, allowMultiple: true };
}

export interface GuessPreset {
  name: string;
  params: GuessParams;
}

export const GUESS_PRESETS: GuessPreset[] = [
  { name: "Standard", params: { ncolours: 6, npegs: 4, nguesses: 10, allowBlank: false, allowMultiple: true } },
  { name: "Super", params: { ncolours: 8, npegs: 5, nguesses: 12, allowBlank: false, allowMultiple: true } },
];

export function presets() {
  return {
    title: "Type",
    submenu: GUESS_PRESETS.map((p) => ({ title: p.name, params: { ...p.params } })),
  };
}

export function encodeParams(p: GuessParams, _full: boolean): string {
  return (
    `c${p.ncolours}p${p.npegs}g${p.nguesses}` +
    `${p.allowBlank ? "b" : "B"}${p.allowMultiple ? "m" : "M"}`
  );
}

function isDigit(ch: string): boolean {
  return ch >= "0" && ch <= "9";
}

export function decodeParams(s: string): GuessParams {
  // Lenient, like upstream `decode_params`: scan letter-prefixed fields,
  // ignore anything unrecognised.
  const p = defaultParams();
  let i = 0;
  while (i < s.length) {
    const ch = s[i++];
    switch (ch) {
      case "c":
        p.ncolours = Number.parseInt(s.slice(i), 10) || 0;
        while (i < s.length && isDigit(s[i])) i++;
        break;
      case "p":
        p.npegs = Number.parseInt(s.slice(i), 10) || 0;
        while (i < s.length && isDigit(s[i])) i++;
        break;
      case "g":
        p.nguesses = Number.parseInt(s.slice(i), 10) || 0;
        while (i < s.length && isDigit(s[i])) i++;
        break;
      case "b":
        p.allowBlank = true;
        break;
      case "B":
        p.allowBlank = false;
        break;
      case "m":
        p.allowMultiple = true;
        break;
      case "M":
        p.allowMultiple = false;
        break;
      default:
        // ignore
        break;
    }
  }
  return p;
}

export function validateParams(p: GuessParams, _full: boolean): string | null {
  if (p.ncolours < 2 || p.npegs < 2) return "Trivial solutions are uninteresting";
  if (p.ncolours > MAXCOLOURS) return "Too many colours";
  if (p.nguesses < 1) return "Must have at least one guess";
  if (!p.allowMultiple && p.ncolours < p.npegs) {
    return "Disallowing multiple colours requires at least as many colours as pegs";
  }
  return null;
}

// --- markability ------------------------------------------------------

/** Whether a working row may be submitted: enough pegs filled (all,
 * unless `allowBlank` lets a single peg suffice), and — when
 * `allowMultiple` is false — no colour repeats. Mirrors `is_markable`. */
export function isMarkable(params: GuessParams, pegs: readonly number[]): boolean {
  const colcount = new Array(params.ncolours).fill(0);
  const nrequired = params.allowBlank ? 1 : params.npegs;
  let nset = 0;
  for (let i = 0; i < params.npegs; i++) {
    const c = pegs[i];
    if (c > 0) {
      colcount[c - 1]++;
      nset++;
    }
  }
  if (nset < nrequired) return false;
  if (!params.allowMultiple) {
    for (let i = 0; i < params.ncolours; i++) {
      if (colcount[i] > 1) return false;
    }
  }
  return true;
}

// --- feedback (Knuth) -------------------------------------------------

/** Score `pegs` against `solution`: `ncPlace` correct-position matches,
 * then `ncColour = Σ_colour min(#guess, #solution) − ncPlace`
 * correct-colour-only matches. Returns the feedback row (black markers
 * first, then white markers, rest zero) and the black count. Mirrors
 * `mark_pegs`. */
export function markPegs(
  pegs: readonly number[],
  solution: readonly number[],
  ncolours: number,
): { feedback: number[]; ncPlace: number } {
  const npegs = pegs.length;
  let ncPlace = 0;
  for (let i = 0; i < npegs; i++) {
    if (pegs[i] === solution[i]) ncPlace++;
  }
  let ncColour = 0;
  for (let c = 1; c <= ncolours; c++) {
    let nGuess = 0;
    let nSolution = 0;
    for (let j = 0; j < npegs; j++) {
      if (pegs[j] === c) nGuess++;
      if (solution[j] === c) nSolution++;
    }
    ncColour += Math.min(nGuess, nSolution);
  }
  ncColour -= ncPlace;

  const feedback = new Array(npegs).fill(0);
  let j = 0;
  for (let i = 0; i < ncPlace; i++) feedback[j++] = FEEDBACK_CORRECTPLACE;
  for (let i = 0; i < ncColour; i++) feedback[j++] = FEEDBACK_CORRECTCOLOUR;
  return { feedback, ncPlace };
}

// --- desc -------------------------------------------------------------

export function newDesc(p: GuessParams, rng: RandomState): { desc: string } {
  const bmp = new Uint8Array(p.npegs);
  const colcount = new Int32Array(p.ncolours);
  for (let i = 0; i < p.npegs; i++) {
    let c: number;
    do {
      c = randomUpto(rng, p.ncolours);
    } while (!p.allowMultiple && colcount[c]);
    colcount[c]++;
    bmp[i] = c + 1;
  }
  obfuscateBitmap(bmp, p.npegs * 8, false);
  return { desc: bin2hex(bmp) };
}

export function validateDesc(p: GuessParams, desc: string): string | null {
  if (desc.length !== p.npegs * 2) return "Game description is wrong length";
  const bmp = hex2bin(desc, p.npegs);
  obfuscateBitmap(bmp, p.npegs * 8, true);
  for (let i = 0; i < p.npegs; i++) {
    if (bmp[i] < 1 || bmp[i] > p.ncolours) return "Game description is corrupted";
  }
  return null;
}

export function newState(p: GuessParams, desc: string): GuessState {
  const bmp = hex2bin(desc, p.npegs);
  obfuscateBitmap(bmp, p.npegs * 8, true);
  const solution = Array.from({ length: p.npegs }, (_, i) => bmp[i]);
  const guesses = Array.from({ length: p.nguesses }, () => blankRow(p.npegs));
  return {
    params: p,
    guesses,
    holds: new Array(p.npegs).fill(false),
    solution,
    nextGo: 0,
    solved: 0,
  };
}

// --- status -----------------------------------------------------------

/** `solved > 0` → win; `solved < 0` → lost/revealed (also the
 * give-up "Solve"); else ongoing. */
export function status(s: GuessState): GameStatus {
  if (s.solved > 0) return "solved";
  if (s.solved < 0) return "lost";
  return "ongoing";
}
