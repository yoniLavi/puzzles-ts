/**
 * Tracks generator — a byte-faithful port of `new_game_desc` / `lay_path` /
 * `add_clues` from `tracks.c`. The clue-laying is solver-gated (it keeps a
 * clue only while the board stays soluble at exactly the target difficulty),
 * so over the bit-identical `random.ts` this reproduces the C desc
 * byte-for-byte for the same seed (playbook §4.3–4.4).
 */

import { shuffle } from "../../engine/shuffle.ts";
import type { RandomState } from "../../random/index.ts";
import { randomUpto } from "../../random/index.ts";
import { copyAndStrip, tracksSolve } from "./solver.ts";
import {
  type Board,
  blankBoard,
  DIFF_EASY,
  DIRS,
  DX,
  DY,
  E_TRACK,
  encodeDesc,
  inGrid,
  L,
  S_CLUE,
  S_NOTRACK,
  S_TRACK,
  sECount,
  sEDirs,
  sESet,
  type TracksParams,
} from "./state.ts";

const MAX_REGENERATE = 10000;

function clearBoard(b: Board): void {
  b.sflags.fill(0);
  b.numbers.fill(0);
  b.numErrors.fill(0);
  b.rowS = -1;
  b.colS = -1;
  b.impossible = false;
}

function solveProgress(b: Board): number {
  const { w, h } = b;
  let progress = 0;
  for (let i = 0; i < w * h; i++) {
    if (b.sflags[i] & S_TRACK) progress++;
    if (b.sflags[i] & S_NOTRACK) progress++;
    progress += sECount(b, i % w, Math.floor(i / w), E_TRACK);
    progress += sECount(b, i % w, Math.floor(i / w), 2 /* E_NOTRACK */);
  }
  return progress;
}

/** Squares (non-clue) that would show a phantom piece of track at game start
 * (upstream `check_phantom_moves`). */
function checkPhantomMoves(b: Board): boolean {
  const { w, h } = b;
  for (let x = 0; x < w; x++) {
    for (let y = 0; y < h; y++) {
      const i = y * w + x;
      if (b.sflags[i] & S_CLUE) continue;
      if (sECount(b, x, y, E_TRACK) > 1) return true;
    }
  }
  return false;
}

function findDirection(b: Board, rs: RandomState, x: number, y: number): number {
  const { w, h } = b;
  const dirs = [...DIRS];
  shuffle(dirs, rs);
  for (let i = 0; i < 4; i++) {
    const nx = x + DX(dirs[i]);
    const ny = y + DY(dirs[i]);
    if (nx >= 0 && nx < w && ny === h) return dirs[i]; // off the bottom → finished
    if (!inGrid(b, nx, ny)) continue; // off the board
    if (sECount(b, nx, ny, E_TRACK) > 0) continue; // already tracks here
    return dirs[i];
  }
  return 0; // no possible direction
}

function layPath(b: Board, rs: RandomState): void {
  const { h } = b;
  for (;;) {
    clearBoard(b);
    const py0 = randomUpto(rs, h);
    b.rowS = py0;
    let px = 0;
    let py = py0;
    sESet(b, px, py, L, E_TRACK);
    let restart = false;
    while (inGrid(b, px, py)) {
      const d = findDirection(b, rs, px, py);
      if (d === 0) {
        restart = true;
        break;
      }
      sESet(b, px, py, d, E_TRACK);
      px += DX(d);
      py += DY(d);
    }
    if (restart) continue;
    b.colS = px;
    return;
  }
}

/** Lay clues to solubility at the target difficulty, then strip redundant
 * ones (upstream `add_clues`). Returns 1 (soluble at target) or −1 (need a
 * new board / already too easy). */
function addClues(b: Board, rs: RandomState, diff: number): number {
  const { w, h } = b;
  const positions: number[] = [];
  const nedgesPreviousSolve = new Int32Array(w * h);
  for (let i = 0; i < w * h; i++) {
    if (sEDirs(b, i % w, Math.floor(i / w), E_TRACK) !== 0) positions.push(i);
    nedgesPreviousSolve[i] = 0;
  }

  // Already too easy, or already soluble without any added clues?
  let scratch = copyAndStrip(b, -1);
  const first = tracksSolve(scratch, diff);
  if (first.maxDiff < diff) return -1; // too easy even without clues
  if (first.ret < 0) throw new Error("Generator produced impossible puzzle");
  if (first.ret > 0) return 1; // already soluble without clues
  let progress = solveProgress(scratch);

  // Lay clues until soluble.
  shuffle(positions, rs);
  let laid = false;
  for (const i of positions) {
    if (b.sflags[i] & S_CLUE) continue; // already a clue (entrance/exit)
    if (nedgesPreviousSolve[i] === 2) continue; // wouldn't help
    scratch = copyAndStrip(b, i);
    if (checkPhantomMoves(scratch)) continue;
    const solved = tracksSolve(scratch, diff);
    if (solved.ret > 0) {
      if (solved.maxDiff < diff) continue; // too easy
      b.sflags[i] |= S_CLUE;
      laid = true;
      break;
    }
    if (solveProgress(scratch) > progress) {
      progress = solveProgress(scratch);
      b.sflags[i] |= S_CLUE;
      for (let j = 0; j < w * h; j++) {
        nedgesPreviousSolve[j] = sECount(scratch, j % w, Math.floor(j / w), E_TRACK);
      }
    }
  }
  if (!laid) return -1; // never made it soluble

  // Strip redundant clues.
  shuffle(positions, rs);
  for (const i of positions) {
    if (!(b.sflags[i] & S_CLUE)) continue;
    if (
      (i % w === 0 && Math.floor(i / w) === b.rowS) ||
      (Math.floor(i / w) === h - 1 && i % w === b.colS)
    ) {
      continue; // never strip entrance/exit
    }
    scratch = copyAndStrip(b, i);
    if (checkPhantomMoves(scratch)) continue;
    if (tracksSolve(scratch, diff).ret > 0) b.sflags[i] &= ~S_CLUE; // still soluble
  }
  return 1;
}

export function newDesc(
  p: TracksParams,
  rs: RandomState,
): { desc: string; aux?: string } {
  const { w, h } = p;
  // 4x4 Tricky/Hard cannot be generated; fall back to Easy.
  let diff = p.diff;
  if (w === 4 && h === 4 && diff > DIFF_EASY) diff = DIFF_EASY;

  const b = blankBoard(w, h);
  let guard = 0;
  for (;;) {
    if (guard++ > MAX_REGENERATE) throw new Error("Tracks generation did not converge");

    layPath(b, rs);
    for (let x = 0; x < w; x++) {
      for (let y = 0; y < h; y++) {
        if (sECount(b, x, y, E_TRACK) > 0) b.sflags[y * w + x] |= S_TRACK;
        if ((x === 0 && y === b.rowS) || (y === h - 1 && x === b.colS)) {
          b.sflags[y * w + x] |= S_CLUE;
        }
      }
    }
    // Clue numbers from the laid track.
    for (let x = 0; x < w; x++) {
      for (let y = 0; y < h; y++) {
        if (b.sflags[y * w + x] & S_TRACK) {
          b.numbers[x]++;
          b.numbers[y + w]++;
        }
      }
    }
    let boring = false;
    for (let i = 0; i < w + h; i++) {
      if (b.numbers[i] === 0) {
        boring = true;
        break;
      }
    }
    if (boring) continue;

    if (p.singleOnes) {
      let lastWasOne = true; // disallow a 1 clue at the entry point
      let consecutive = false;
      for (let i = 0; i < w + h; i++) {
        const isOne = b.numbers[i] === 1;
        if (isOne && lastWasOne) {
          consecutive = true;
          break;
        }
        lastWasOne = isOne;
      }
      if (consecutive) continue;
      if (b.numbers[w + h - 1] === 1) continue; // disallow a 1 clue at the exit
    }

    if (addClues(b, rs, diff) !== 1) continue; // couldn't make soluble / too easy

    return { desc: encodeDesc(b) };
  }
}
