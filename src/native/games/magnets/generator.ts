/**
 * Magnets generator — faithful port of `new_game_desc` and its helpers
 * (`gen_game`, `lay_dominoes`, `check_difficulty`) in `magnets.c`. Byte-match
 * critical (playbook §4.3–4.4): every RNG draw reproduces C in order — the
 * `dominoLayout` list/BFS shuffles, the `layDominoes` scratch shuffle (once
 * per failed attempt), and — only when `stripclues` — the clue-strip shuffle —
 * and the solver's verdict on each intermediate board must match C.
 *
 * Strategy: lay a random domino tiling, fill it with a valid solution (a few
 * neutral dominoes first, then prefer magnets), derive the row/column counts,
 * reject boards not soluble at exactly the target difficulty, and — for strip
 * mode — remove clues in shuffled order while the board stays uniquely
 * solvable.
 */
import { dominoLayout } from "../../engine/laydomino.ts";
import { shuffle } from "../../engine/shuffle.ts";
import type { RandomState } from "../../random/index.ts";
import { MagnetsSolver } from "./solver.ts";
import {
  COLUMN,
  DIFF_EASY,
  encodeDesc,
  GS_NOTNEGATIVE,
  GS_NOTPOSITIVE,
  GS_SET,
  type MagnetsParams,
  NEGATIVE,
  NEUTRAL,
  POSITIVE,
  ROW,
} from "./state.ts";

const GRID2CHAR = [".", "+", "-"];

interface GenBoard {
  w: number;
  h: number;
  dominoes: Int32Array;
  /** the laid solution (EMPTY/POSITIVE/NEGATIVE per cell). */
  grid: Int32Array;
  rowcount: Int32Array;
  colcount: Int32Array;
}

/** Fill the domino tiling with a valid magnet/neutral solution. Returns the
 * final solver verdict (`layDominoes` retries while it is −1). */
function layDominoes(
  w: number,
  h: number,
  dominoes: Int32Array,
  rs: RandomState,
): { grid: Int32Array; ret: number } {
  const wh = w * h;
  const solver = new MagnetsSolver(
    w,
    h,
    dominoes,
    new Int32Array(3 * h),
    new Int32Array(3 * w),
  );
  // Fresh empty board with singletons pre-set (constructor already did this).
  const scratch: number[] = [];
  for (let i = 0; i < wh; i++) scratch.push(i);
  shuffle(scratch, rs);

  const nInitialNeutral = wh > 100 ? 5 : Math.floor(wh / 10);
  let ret = 0;

  for (let n = 0; n < wh; n++) {
    const i = scratch[n];
    if (solver.flags[i] & GS_SET) continue; // already laid here

    if (n < nInitialNeutral) {
      ret = solver.set(i, NEUTRAL);
    } else if (!(solver.flags[i] & GS_NOTPOSITIVE)) {
      ret = solver.set(i, POSITIVE);
    } else if (!(solver.flags[i] & GS_NOTNEGATIVE)) {
      ret = solver.set(i, NEGATIVE);
    } else {
      ret = solver.set(i, NEUTRAL);
    }
    if (!ret) {
      // Couldn't lay anything here — give up on this attempt.
      ret = -1;
      break;
    }

    ret = solver.solveUnnumbered();
    if (ret !== 0) break;
  }

  return { grid: Int32Array.from(solver.grid), ret };
}

/** Lay a tiling and a full solution; derive the row/column counts. */
function genGame(w: number, h: number, rs: RandomState): GenBoard {
  const dominoes = dominoLayout(w, h, rs);

  let grid: Int32Array;
  while (true) {
    const r = layDominoes(w, h, dominoes, rs);
    if (r.ret !== -1) {
      grid = r.grid;
      break;
    }
  }

  const colcount = new Int32Array(3 * w);
  const rowcount = new Int32Array(3 * h);
  for (let x = 0; x < w; x++) {
    for (let y = 0; y < h; y++) {
      const val = grid[y * w + x];
      colcount[x * 3 + val]++;
      rowcount[y * 3 + val]++;
    }
  }
  return { w, h, dominoes, grid, rowcount, colcount };
}

/** For a scratch index `num` (0..2·(w+h)-1), the (which, roworcol, index). */
function decodeClueSlot(
  w: number,
  h: number,
  num: number,
): { which: number; roworcol: number; index: number } {
  let n = num;
  let which: number;
  if (n < w + h) which = POSITIVE;
  else {
    which = NEGATIVE;
    n -= w + h;
  }
  let roworcol: number;
  if (n < w) roworcol = COLUMN;
  else {
    roworcol = ROW;
    n -= w;
  }
  return { which, roworcol, index: n };
}

/**
 * Gate difficulty and (for strip mode) minimise the clue set, mutating
 * `board.rowcount`/`board.colcount` in place. Returns 0 to accept, −1 to
 * regenerate. Faithful to upstream `check_difficulty`.
 */
function checkDifficulty(p: MagnetsParams, board: GenBoard, rs: RandomState): number {
  const { w, h, dominoes, rowcount, colcount } = board;
  const wh = w * h;

  const solveFresh = (diff: number): { ret: number; grid: Int32Array } => {
    const s = new MagnetsSolver(w, h, dominoes, rowcount, colcount);
    const ret = s.solve(diff);
    return { ret, grid: s.grid };
  };

  if (p.diff > DIFF_EASY) {
    if (solveFresh(p.diff - 1).ret > 0) return -1; // too easy
  }
  const solved = solveFresh(p.diff);
  if (solved.ret <= 0) return -1; // not soluble at requested difficulty
  if (!p.stripclues) return 0;

  const gridCorrect = solved.grid;

  const slen = w * 2 + h * 2;
  const scratch: number[] = [];
  for (let i = 0; i < slen; i++) scratch.push(i);
  shuffle(scratch, rs);

  for (let i = 0; i < slen; i++) {
    const { which, roworcol, index } = decodeClueSlot(w, h, scratch[i]);
    const targets = roworcol === COLUMN ? colcount : rowcount;
    const base = index * 3;

    // Remove clue (its colour and the derived neutral), remembering both.
    const target = targets[base + which];
    const targetn = targets[base + NEUTRAL];
    targets[base + which] = -1;
    targets[base + NEUTRAL] = -1;

    const r = solveFresh(p.diff);
    // ret is never −1 here (removing a clue can't create a contradiction).
    let differs = r.ret === 0;
    if (!differs) {
      for (let k = 0; k < wh; k++) {
        if (r.grid[k] !== gridCorrect[k]) {
          differs = true;
          break;
        }
      }
    }
    if (differs) {
      // Made it ambiguous/different — put the clue back.
      targets[base + which] = target;
      targets[base + NEUTRAL] = targetn;
    }
  }
  return 0;
}

export function newMagnetsDesc(
  p: MagnetsParams,
  rs: RandomState,
): { desc: string; aux: string } {
  let board: GenBoard;
  let aux: string;
  while (true) {
    board = genGame(p.w, p.h, rs);
    aux = "";
    for (let i = 0; i < p.w * p.h; i++) aux += GRID2CHAR[board.grid[i]];
    if (checkDifficulty(p, board, rs) >= 0) break;
  }

  const { w, h, dominoes, rowcount, colcount } = board;
  const desc = encodeDesc(w, h, dominoes, rowcount, colcount);
  return { desc, aux };
}
