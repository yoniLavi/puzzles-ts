/**
 * Guess — native TS port of the Mastermind clone (`puzzles/guess.c`,
 * deleted when this ships).
 *
 * Deduce a hidden combination of `npegs` colour pegs drawn from
 * `ncolours` colours within `nguesses` rows; each submitted row is
 * scored with Knuth's black/white feedback. Win on all-correct-place,
 * lose (and reveal) when the rows run out. The live editing state
 * (working row, holds, drag, cursor) lives in `GuessUi` exactly as
 * upstream keeps it in `game_ui`, reconciled across transitions by the
 * `changedState` engine hook this port introduces.
 */

import type { Colour, Point, Size } from "../../../puzzle/types.ts";
import { type Game, UI_UPDATE, type UiUpdate } from "../../engine/game.ts";
import {
  CURSOR_SELECT,
  CURSOR_SELECT2,
  gridCursorMove,
  isCursorMove,
  LEFT_BUTTON,
  LEFT_DRAG,
  LEFT_RELEASE,
  RIGHT_BUTTON,
} from "../../engine/pointer.ts";
import { parseConfigInt } from "../../engine/params.ts";
import { registerGame } from "../../engine/registry.ts";
import {
  colours as coloursImpl,
  computeGeometry,
  computeSize as computeSizeImpl,
  type Geom,
  type GuessDrawState,
  newDrawState,
  pegOff,
  PREFERRED_TILE_SIZE,
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
    colourCur: 0,
    pegCur: 0,
    displayCur: false,
    markable: false,
    dragCol: 0,
    dragX: 0,
    dragY: 0,
    dragOpeg: -1,
    showLabels: false,
    hint: null,
  };
}

/** Upstream `game_changed_state`: reconstruct the working row from the
 * current state's holds after every transition (drop the cached hint on
 * an undo). */
function changedState(
  ui: GuessUi,
  oldState: GuessState | null,
  newState_: GuessState,
): void {
  if (oldState && newState_.nextGo < oldState.nextGo) ui.hint = null;

  const npegs = newState_.solution.length;
  const solved = newState_.solved !== 0;
  for (let i = 0; i < npegs; i++) {
    ui.holds[i] = solved ? false : newState_.holds[i];
    if (solved || newState_.nextGo === 0 || !ui.holds[i]) {
      ui.currPegs[i] = 0;
    } else {
      ui.currPegs[i] = newState_.guesses[newState_.nextGo - 1].pegs[i];
    }
  }
  ui.markable = isMarkable(newState_.params, ui.currPegs);
  if (!ui.markable && ui.pegCur === npegs) ui.pegCur = 0;
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
 * state transition). Caches its progress in `ui.hint`, narrowed across
 * calls and rebuilt after an undo (`changedState` clears it). */
function computeHint(state: GuessState, ui: GuessUi): void {
  const { npegs, ncolours, allowMultiple } = state.params;
  const guesses = state.guesses;
  const nextGo = state.nextGo;

  let mincolour = 1;
  let maxcolour = 0;
  for (let i = 0; i < nextGo; i++) {
    for (let j = 0; j < npegs; j++) {
      if (guesses[i].pegs[j] > maxcolour) maxcolour = guesses[i].pegs[j];
    }
  }
  maxcolour = allowMultiple
    ? Math.min(maxcolour + 1, ncolours)
    : Math.min(maxcolour + npegs, ncolours);

  // Raise `mincolour` past any colour proven absent (a past guess made
  // entirely of `mincolour` that scored nothing).
  for (;;) {
    let advanced = false;
    for (let i = 0; i < nextGo; i++) {
      if (guesses[i].feedback[0]) continue;
      let allMin = true;
      for (let j = 0; j < npegs; j++) {
        if (guesses[i].pegs[j] !== mincolour) {
          allMin = false;
          break;
        }
      }
      if (!allMin) continue;
      mincolour++;
      advanced = true;
      break;
    }
    if (!advanced) break;
  }

  let hint = ui.hint;
  if (!hint) {
    hint = new Array(npegs).fill(1);
    ui.hint = hint;
  }

  const increment = (): void => {
    let i = npegs;
    for (;;) {
      i--;
      hint[i]++;
      if (i !== 0 && hint[i] > maxcolour) {
        hint[i] = mincolour;
        continue;
      }
      break;
    }
  };

  while (hint[0] <= ncolours) {
    if (!isMarkable(state.params, hint)) {
      increment();
      continue;
    }
    let consistent = true;
    for (let i = 0; i < nextGo; i++) {
      const { feedback } = markPegs(hint, guesses[i].pegs, maxcolour);
      for (let j = 0; j < npegs; j++) {
        if (feedback[j] !== guesses[i].feedback[j]) {
          consistent = false;
          break;
        }
      }
      if (!consistent) break;
    }
    if (!consistent) {
      increment();
      continue;
    }
    // A compatible guess: install it in the working row.
    for (let i = 0; i < npegs; i++) ui.currPegs[i] = hint[i];
    ui.markable = true;
    ui.pegCur = npegs;
    ui.displayCur = true;
    return;
  }

  // No combination is compatible (only reachable with a corrupted
  // solution). Fiddle the UI to signal futility, mirroring upstream.
  if (!ui.displayCur) ui.displayCur = true;
  else if (npegs === 1) ui.displayCur = false;
  else ui.pegCur = (ui.pegCur + 1) % npegs;
}

// --- cursor movement (upstream move_cursor) ---------------------------

/** Move the peg/colour cursor (no wrap; clamp). Returns `UI_UPDATE`
 * when the cursor became visible or moved, else `null`.
 *
 * The peg axis is the grid's x (clamped to `maxPeg`), the colour axis its
 * y (clamped to `maxColour`); `gridCursorMove` owns the clamp and returns
 * `null` for a no-op against an edge, which we keep as a position hold so
 * the `displayCur` reveal still fires. */
function moveCursor(button: number, ui: GuessUi, maxPeg: number, maxColour: number): UiUpdate | null {
  if (!isCursorMove(button)) return null;

  const moved = gridCursorMove(button, ui.pegCur, ui.colourCur, maxPeg, maxColour);
  if (moved) {
    ui.pegCur = moved.x;
    ui.colourCur = moved.y;
  }

  if (!ui.displayCur) {
    ui.displayCur = true;
    return UI_UPDATE;
  }
  return moved ? UI_UPDATE : null;
}

// --- input ------------------------------------------------------------

function interpretMove(
  from: GuessState,
  ui: GuessUi,
  ds: GuessDrawState | null,
  p: Point,
  button: number,
): GuessMove | null | UiUpdate {
  const params = from.params;
  const { npegs, ncolours } = params;

  // Label toggle is allowed even after the game ends.
  if (button === 0x6c || button === 0x4c /* 'l' | 'L' */) {
    ui.showLabels = !ui.showLabels;
    return UI_UPDATE;
  }
  if (from.solved) return null;

  const g: Geom = ds ?? computeGeometry(params, PREFERRED_TILE_SIZE);
  const off = pegOff(g);
  const x = p.x;
  const y = p.y;

  // Hit-test the four regions (upstream interpret_move).
  let overCol = 0; // one-indexed colour, 0 = none
  let overGuess = -1; // current-row peg index
  let overPastGuessY = -1;
  let overPastGuessX = -1;
  let overHint = false;

  const guessOx = g.guessx;
  const guessOy = g.guessy + from.nextGo * off;
  const guessW = npegs * off;
  const guessH = params.nguesses * off;

  if (x >= g.colx && x < g.colx + off && y >= g.coly && y < g.coly + ncolours * off) {
    overCol = Math.floor((y - g.coly) / off) + 1;
  } else if (x >= guessOx && y >= guessOy && y < guessOy + guessH) {
    if (x < guessOx + guessW) overGuess = Math.floor((x - guessOx) / off);
    else overHint = true;
  } else if (x >= guessOx && x < guessOx + guessW && y >= g.guessy && y < guessOy) {
    overPastGuessY = Math.floor((y - g.guessy) / off);
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
    ui.displayCur = false;
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
    // NB deliberately not on the end of a drag (handled above), so an
    // accidental drop doesn't submit.
    return buildGuessMove(ui);
  }

  // --- keyboard ---
  if (isCursorMove(button)) {
    const maxcur = npegs + (ui.markable ? 1 : 0);
    return moveCursor(button, ui, maxcur, ncolours);
  }
  if (button === 0x68 || button === 0x48 || button === 0x3f /* 'h' | 'H' | '?' */) {
    computeHint(from, ui);
    return UI_UPDATE;
  }
  if (button === CURSOR_SELECT) {
    ui.displayCur = true;
    if (ui.pegCur === npegs) return buildGuessMove(ui);
    setPeg(params, ui, ui.pegCur, ui.colourCur + 1);
    return UI_UPDATE;
  }
  if (
    ((button >= 0x31 && button <= 0x30 + ncolours) || (button === 0x30 && ncolours === 10)) &&
    ui.pegCur < npegs
  ) {
    ui.displayCur = true;
    setPeg(params, ui, ui.pegCur, button === 0x30 ? 10 : button - 0x30);
    if (ui.pegCur + 1 < npegs + (ui.markable ? 1 : 0)) ui.pegCur++;
    return UI_UPDATE;
  }
  if (button === 0x44 || button === 0x64 || button === 0x08 /* 'D' | 'd' | backspace */) {
    if (!ui.displayCur || ui.currPegs[ui.pegCur] !== 0) {
      ui.displayCur = true;
      setPeg(params, ui, ui.pegCur, 0);
      return UI_UPDATE;
    }
    return null;
  }
  if (button === CURSOR_SELECT2) {
    if (ui.pegCur === npegs) return null;
    ui.displayCur = true;
    ui.holds[ui.pegCur] = !ui.holds[ui.pegCur];
    return UI_UPDATE;
  }
  return null;
}

// --- moves ------------------------------------------------------------

function executeMove(s: GuessState, m: GuessMove): GuessState {
  if (m.type === "solve") {
    const ret = cloneState(s);
    return { ...ret, solved: -1 };
  }

  if (s.solved) throw new Error("No guesses allowed once the game is over");

  const { npegs, ncolours, nguesses, allowBlank } = s.params;
  const minColour = allowBlank ? 0 : 1;
  for (const v of m.pegs) {
    if (v < minColour || v > ncolours) throw new Error(`Illegal guess peg ${v}`);
  }

  const ret = cloneState(s);
  const row = ret.guesses[s.nextGo];
  const { feedback, ncPlace } = markPegs(m.pegs, s.solution, ncolours);
  for (let i = 0; i < npegs; i++) row.pegs[i] = m.pegs[i];
  row.feedback = feedback;

  let solved = ret.solved;
  let nextGo = ret.nextGo;
  if (ncPlace === npegs) {
    solved = 1; // win
  } else {
    nextGo = s.nextGo + 1;
    if (nextGo >= nguesses) solved = -1; // lose, reveal
  }
  return { ...ret, holds: m.holds.slice(), nextGo, solved };
}

// --- Game object ------------------------------------------------------

export const guessGame: Game<GuessParams, GuessState, GuessMove, GuessUi, GuessDrawState> = {
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
      kw: "colours",
      name: "Colours",
      type: "string",
      get: (p) => String(p.ncolours),
      set: (p, v) => {
        p.ncolours = parseConfigInt(v);
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
    colours: String(p.ncolours),
    "pegs-per-guess": String(p.npegs),
    guesses: String(p.nguesses),
    "allow-blanks": p.allowBlank,
    "allow-duplicates": p.allowMultiple,
  }),

  newDesc: (p, rng) => newDesc(p, rng),
  validateDesc,
  newState,
  newUi,
  changedState,

  interpretMove,
  executeMove,
  status,

  solve() {
    // Upstream solve_game returns "S": reveal the answer (a give-up,
    // scored as a loss-reveal, exactly as upstream).
    return { ok: true, move: { type: "solve" } };
  },

  colours: (defaultBackground: Colour): Colour[] => coloursImpl(defaultBackground),
  preferredTileSize: PREFERRED_TILE_SIZE,
  computeSize: (p: GuessParams, ts: number): Size => computeSizeImpl(p, ts),
  setTileSize,
  newDrawState,
  redraw,
};

registerGame(guessGame);
