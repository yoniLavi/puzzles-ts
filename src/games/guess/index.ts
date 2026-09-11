/**
 * Guess — the Mastermind clone, ported from upstream's `guess.c`.
 *
 * Deduce a hidden combination of `npegs` color pegs drawn from `ncolors`
 * colors within `nguesses` rows; each submitted row is scored with Knuth's
 * black/white feedback. Win on all-correct-place, lose (and reveal) when the
 * rows run out. The working row lives in `GuessUi`, rebuilt by
 * `changedState` after every transition.
 */

import { assertNever } from "../../engine/assert-never.ts";
import { type Game, UI_UPDATE, type UiUpdate } from "../../engine/game.ts";
import { parseConfigInt } from "../../engine/params.ts";
import {
  CURSOR_SELECT,
  CURSOR_SELECT2,
  digitOf,
  isCursorMove,
  isEraseKey,
  LEFT_BUTTON,
  LEFT_DRAG,
  LEFT_RELEASE,
  moveCursor,
  newCursor,
  RIGHT_BUTTON,
} from "../../engine/pointer.ts";
import { registerGame } from "../../engine/registry.ts";
import type { Point } from "../../engine/types.ts";
import {
  colors,
  computeSize,
  type GuessDrawState,
  newDrawState,
  PREFERRED_TILE_SIZE,
  pegOff,
  redraw,
  setTileSize,
} from "./render.ts";
import {
  cloneState,
  decodeParams,
  defaultParams,
  encodeParams,
  type GuessMove,
  type GuessParams,
  type GuessState,
  type GuessUi,
  isMarkable,
  markPegs,
  newDesc,
  newState,
  presets,
  status,
  validateDesc,
  validateParams,
} from "./state.ts";

// --- UI ----------------------------------------------------------------

function newUi(state: GuessState): GuessUi {
  const p = state.params;
  return {
    params: p,
    currPegs: new Array(p.npegs).fill(0),
    holds: new Array(p.npegs).fill(false),
    cursor: newCursor(),
    markable: false,
    dragCol: 0,
    dragX: 0,
    dragY: 0,
    dragOpeg: -1,
    showLabels: false,
    hint: null,
  };
}

/** Upstream `game_changed_state`: rebuild the working row from the state's
 * holds after every transition, and drop the cached hint on an undo. */
function changedState(ui: GuessUi, prev: GuessState | null, next: GuessState): void {
  if (prev && next.nextGo < prev.nextGo) ui.hint = null;

  const { npegs } = next.params;
  const lastRow = next.nextGo > 0 ? next.guesses[next.nextGo - 1] : null;
  for (let i = 0; i < npegs; i++) {
    ui.holds[i] = !next.solved && next.holds[i];
    ui.currPegs[i] = ui.holds[i] && lastRow ? lastRow.pegs[i] : 0;
  }
  ui.markable = isMarkable(next.params, ui.currPegs);
  if (!ui.markable && ui.cursor.x === npegs) ui.cursor.x = 0;
}

function setPeg(params: GuessParams, ui: GuessUi, peg: number, col: number): void {
  ui.currPegs[peg] = col;
  ui.markable = isMarkable(params, ui.currPegs);
}

function buildGuessMove(ui: GuessUi): GuessMove {
  return { type: "guess", pegs: ui.currPegs.slice(), holds: ui.holds.slice() };
}

// --- hint (upstream compute_hint) -------------------------------------

/** Fill the working row with the lexicographically-first combination
 * consistent with every prior scored guess (a `game_ui` mutation, not a
 * state transition). A candidate once ruled out stays ruled out, so the
 * search resumes from `ui.hint` on the next call; `changedState` clears it
 * on an undo. */
function computeHint(state: GuessState, ui: GuessUi): void {
  const { npegs, ncolors, allowMultiple } = state.params;
  const past = state.guesses.slice(0, state.nextGo);

  // Bound the colors worth trying. Past feedback cannot tell unguessed
  // colors apart, so `maxcolor` admits one of them (`npegs` without
  // duplicates); `mincolor` skips any color proven absent, a past guess
  // made entirely of it that scored nothing.
  let maxcolor = 0;
  for (const g of past) maxcolor = Math.max(maxcolor, ...g.pegs);
  maxcolor = Math.min(maxcolor + (allowMultiple ? 1 : npegs), ncolors);
  let mincolor = 1;
  const provenAbsent = (c: number): boolean =>
    past.some((g) => !g.feedback[0] && g.pegs.every((v) => v === c));
  while (provenAbsent(mincolor)) mincolor++;

  if (!ui.hint) ui.hint = new Array(npegs).fill(1);
  const hint = ui.hint;
  const consistent = (): boolean => {
    for (let i = 0; i < past.length; i++) {
      const { feedback } = markPegs(hint, past[i].pegs, maxcolor);
      for (let j = 0; j < npegs; j++) {
        if (feedback[j] !== past[i].feedback[j]) return false;
      }
    }
    return true;
  };

  while (hint[0] <= ncolors) {
    if (isMarkable(state.params, hint) && consistent()) {
      for (let i = 0; i < npegs; i++) ui.currPegs[i] = hint[i];
      ui.markable = true;
      ui.cursor.x = npegs;
      ui.cursor.visible = true;
      return;
    }
    // Next candidate, odometer-style; peg 0 never wraps, which ends the search.
    let i = npegs - 1;
    hint[i]++;
    while (i > 0 && hint[i] > maxcolor) {
      hint[i] = mincolor;
      i--;
      hint[i]++;
    }
  }

  // Nothing is compatible, which only a corrupted solution allows: nudge
  // the cursor to signal futility, as upstream does.
  if (!ui.cursor.visible) ui.cursor.visible = true;
  else if (npegs === 1) ui.cursor.visible = false;
  else ui.cursor.x = (ui.cursor.x + 1) % npegs;
}

// --- input ------------------------------------------------------------

function interpretMove(
  from: GuessState,
  ui: GuessUi,
  ds: GuessDrawState,
  p: Point,
  button: number,
): GuessMove | null | UiUpdate {
  const params = from.params;
  const { npegs, ncolors } = params;

  // Label toggle is allowed even after the game ends.
  if (button === 0x6c || button === 0x4c /* 'l' | 'L' */) {
    ui.showLabels = !ui.showLabels;
    return UI_UPDATE;
  }
  if (from.solved) return null;

  const off = pegOff(ds);
  const { x, y } = p;

  // Hit-test the four regions (upstream interpret_move).
  let overCol = 0; // one-indexed color, 0 = none
  let overGuess = -1; // current-row peg index
  let overPastGuessY = -1;
  let overPastGuessX = -1;
  let overHint = false;

  const guessOx = ds.guessx;
  const guessOy = ds.guessy + from.nextGo * off;
  const guessW = npegs * off;
  const guessH = params.nguesses * off;

  if (
    x >= ds.colx &&
    x < ds.colx + off &&
    y >= ds.coly &&
    y < ds.coly + ncolors * off
  ) {
    overCol = Math.floor((y - ds.coly) / off) + 1;
  } else if (x >= guessOx && y >= guessOy && y < guessOy + guessH) {
    if (x < guessOx + guessW) overGuess = Math.floor((x - guessOx) / off);
    else overHint = true;
  } else if (x >= guessOx && x < guessOx + guessW && y >= ds.guessy && y < guessOy) {
    overPastGuessY = Math.floor((y - ds.guessy) / off);
    overPastGuessX = Math.floor((x - guessOx) / off);
  }

  // --- mouse ---
  if (button === LEFT_BUTTON) {
    if (overCol > 0) {
      ui.dragCol = overCol;
      ui.dragOpeg = -1;
    } else if (overGuess > -1) {
      const col = ui.currPegs[overGuess];
      if (col) {
        ui.dragCol = col;
        ui.dragOpeg = overGuess;
      }
    } else if (overPastGuessY > -1) {
      const col = from.guesses[overPastGuessY].pegs[overPastGuessX];
      if (col) {
        ui.dragCol = col;
        ui.dragOpeg = -1;
      }
    }
    if (ui.dragCol) {
      ui.dragX = x;
      ui.dragY = y;
      return UI_UPDATE;
    }
    return null;
  }
  if (button === LEFT_DRAG && ui.dragCol) {
    ui.dragX = x;
    ui.dragY = y;
    return UI_UPDATE;
  }
  if (button === LEFT_RELEASE && ui.dragCol) {
    if (overGuess > -1) {
      setPeg(params, ui, overGuess, ui.dragCol);
    } else if (ui.dragOpeg > -1) {
      setPeg(params, ui, ui.dragOpeg, 0);
    }
    ui.dragCol = 0;
    ui.dragOpeg = -1;
    ui.cursor.visible = false;
    return UI_UPDATE;
  }
  if (button === RIGHT_BUTTON) {
    if (overGuess > -1) {
      ui.holds[overGuess] = !ui.holds[overGuess];
      return UI_UPDATE;
    }
    return null;
  }
  if (button === LEFT_RELEASE && overHint && ui.markable) {
    // Not on the end of a drag (handled above), so an accidental drop
    // never submits.
    return buildGuessMove(ui);
  }

  // --- keyboard ---
  if (isCursorMove(button)) {
    // The peg axis is the cursor's x, the color axis its y.
    const maxcur = npegs + (ui.markable ? 1 : 0);
    return moveCursor(ui.cursor, button, maxcur, ncolors) ? UI_UPDATE : null;
  }
  if (button === 0x68 || button === 0x48 || button === 0x3f /* 'h' | 'H' | '?' */) {
    computeHint(from, ui);
    return UI_UPDATE;
  }
  if (button === CURSOR_SELECT) {
    ui.cursor.visible = true;
    if (ui.cursor.x === npegs) return buildGuessMove(ui);
    setPeg(params, ui, ui.cursor.x, ui.cursor.y + 1);
    return UI_UPDATE;
  }
  // A digit picks a color; `0` is the tenth, which only a ten-color game has.
  const digit = digitOf(button);
  const color = digit === 0 ? 10 : digit;
  if (color !== null && color <= ncolors && ui.cursor.x < npegs) {
    ui.cursor.visible = true;
    setPeg(params, ui, ui.cursor.x, color);
    if (ui.cursor.x + 1 < npegs + (ui.markable ? 1 : 0)) ui.cursor.x++;
    return UI_UPDATE;
  }
  if (button === 0x44 || button === 0x64 || isEraseKey(button) /* 'D' | 'd' */) {
    if (!ui.cursor.visible || ui.currPegs[ui.cursor.x] !== 0) {
      ui.cursor.visible = true;
      setPeg(params, ui, ui.cursor.x, 0);
      return UI_UPDATE;
    }
    return null;
  }
  if (button === CURSOR_SELECT2) {
    if (ui.cursor.x === npegs) return null;
    ui.cursor.visible = true;
    ui.holds[ui.cursor.x] = !ui.holds[ui.cursor.x];
    return UI_UPDATE;
  }
  return null;
}

// --- moves ------------------------------------------------------------

function executeMove(s: GuessState, m: GuessMove): GuessState {
  if (m.type === "solve") return { ...cloneState(s), solved: -1 };
  if (m.type !== "guess") return assertNever(m, "guess: executeMove");
  if (s.solved) throw new Error("No guesses allowed once the game is over");

  const { npegs, ncolors, nguesses, allowBlank } = s.params;
  const minColor = allowBlank ? 0 : 1;
  for (const v of m.pegs) {
    if (v < minColor || v > ncolors) throw new Error(`Illegal guess peg ${v}`);
  }

  const ret = cloneState(s);
  const row = ret.guesses[s.nextGo];
  const { feedback, ncPlace } = markPegs(m.pegs, s.solution, ncolors);
  for (let i = 0; i < npegs; i++) row.pegs[i] = m.pegs[i];
  row.feedback = feedback;

  const holds = m.holds.slice();
  if (ncPlace === npegs) return { ...ret, holds, solved: 1 };
  // Running out of rows loses, and reveals the answer.
  const nextGo = s.nextGo + 1;
  return { ...ret, holds, nextGo, solved: nextGo >= nguesses ? -1 : 0 };
}

// --- Game object ------------------------------------------------------

export const guessGame: Game<
  GuessParams,
  GuessState,
  GuessMove,
  GuessUi,
  GuessDrawState
> = {
  id: "guess",
  wantsStatusbar: false,
  isTimed: false,
  canSolve: true,
  canFormatAsText: false,

  defaultParams,
  presets,
  encodeParams,
  decodeParams,
  validateParams,
  paramConfig: [
    {
      kw: "colors",
      name: "Colors",
      type: "string",
      get: (p) => String(p.ncolors),
      set: (p, v) => {
        p.ncolors = parseConfigInt(v);
      },
    },
    {
      kw: "pegs-per-guess",
      name: "Pegs per guess",
      type: "string",
      get: (p) => String(p.npegs),
      set: (p, v) => {
        p.npegs = parseConfigInt(v);
      },
    },
    {
      kw: "guesses",
      name: "Guesses",
      type: "string",
      get: (p) => String(p.nguesses),
      set: (p, v) => {
        p.nguesses = parseConfigInt(v);
      },
    },
    {
      kw: "allow-blanks",
      name: "Allow blanks",
      type: "boolean",
      get: (p) => p.allowBlank,
      set: (p, v) => {
        p.allowBlank = v;
      },
    },
    {
      kw: "allow-duplicates",
      name: "Allow duplicates",
      type: "boolean",
      get: (p) => p.allowMultiple,
      set: (p, v) => {
        p.allowMultiple = v;
      },
    },
  ],
  describeParams: (p) => ({
    colors: String(p.ncolors),
    "pegs-per-guess": String(p.npegs),
    guesses: String(p.nguesses),
    "allow-blanks": p.allowBlank,
    "allow-duplicates": p.allowMultiple,
  }),

  newDesc,
  validateDesc,
  newState,
  newUi,
  changedState,

  interpretMove,
  executeMove,
  status,

  solve() {
    // A give-up, as upstream's "S": reveal the answer, scored as a loss.
    return { ok: true, move: { type: "solve" } };
  },

  colors,
  preferredTileSize: PREFERRED_TILE_SIZE,
  computeSize,
  setTileSize,
  newDrawState,
  redraw,
};

registerGame(guessGame);
