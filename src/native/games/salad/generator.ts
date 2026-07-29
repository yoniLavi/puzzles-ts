/**
 * Salad's generator — `latinGenerate` plus solver-gated clue removal.
 *
 * Both modes build a complete order-`o` Latin square, reinterpret its symbols
 * above `nums` as holes (the pseudo-Latin trick — see `solver.ts`), turn that
 * into a full clue set, and then remove clues one at a time in a shuffled
 * order, keeping each removal only while the puzzle still solves by pure
 * deduction at the target difficulty. Because every removal is gated on the
 * solver's verdict, the published description depends on the solver's answer to
 * every intermediate board — which is exactly what makes the byte-match
 * differential (playbook §4.4) validate generator, solver and codec at once.
 *
 * Two upstream quality rules are reproduced verbatim:
 *
 * - **Number Ball** throws the whole puzzle away when every hole can be placed
 *   without entering a single number (`DIFF_HOLESONLY`) — such a board never
 *   exercises the concept. Its author notes in `docs/salad.md` that this mode
 *   still "doesn't create puzzles that make good use of the concept"; improving
 *   that is a generator redesign, out of scope for the port (`design.md`).
 * - **ABC End View** below 8×8 forces an *empty* grid (border clues only), and
 *   simply retries when that is not solvable.
 */

import { latinGenerate } from "../../engine/latin.ts";
import { retryLimit } from "../../engine/retry-limit.ts";
import { shuffle } from "../../engine/shuffle.ts";
import type { RandomState } from "../../random/index.ts";
import { saladSolve } from "./solver.ts";
import {
  borderScans,
  CIRCLE,
  CROSS,
  DIFF_HOLESONLY,
  GAMEMODE_NUMBERS,
  type SaladBoard,
  type SaladParams,
  scanDir,
  scratchBoard,
  serialize,
} from "./state.ts";

/** `'A' - 1` — the serialise base for border clues and a letters-mode grid. */
const BASE_LETTER = 64;
/** `'0'` — the serialise base for a Number Ball grid. */
const BASE_DIGIT = 48;

function blankBoard(p: SaladParams): SaladBoard {
  const o2 = p.order * p.order;
  return {
    order: p.order,
    nums: p.nums,
    mode: p.mode,
    borderclues: new Uint8Array(p.order * 4),
    gridclues: new Uint8Array(o2),
    grid: new Uint8Array(o2),
    holes: new Uint8Array(o2),
  };
}

/** Does the puzzle described by `base`'s clues still solve at `diff`? Upstream
 * clears the working grid/holes before every such attempt; a fresh scratch
 * board is the same thing without the `memset`. */
function solvesAt(base: SaladBoard, diff: number): boolean {
  return saladSolve(scratchBoard(base), diff);
}

/**
 * Upstream `salad_strip_clues`: walk `clues` in a shuffled order, blanking each
 * non-empty entry and putting it back if the puzzle stops solving. `clues` is
 * one of `base`'s own arrays, so the solver sees each tentative removal.
 */
function stripClues(
  base: SaladBoard,
  rs: RandomState,
  clues: Uint8Array,
  m: number,
  diff: number,
): void {
  const spaces: number[] = [];
  for (let i = 0; i < m; i++) spaces.push(i);
  shuffle(spaces, rs);

  for (let i = 0; i < m; i++) {
    const j = spaces[i];
    const temp = clues[j];
    if (temp === 0) continue;
    clues[j] = 0;
    if (!solvesAt(base, diff)) clues[j] = temp;
  }
}

/** Upstream `salad_new_numbers_desc`. */
function newNumbersDesc(p: SaladParams, rs: RandomState): string {
  const o = p.order;
  const o2 = o * o;
  const nums = p.nums;
  const diff = p.diff;
  const attempt = retryLimit("salad: Number Ball generation");

  for (;;) {
    attempt();
    const square = latinGenerate(o, rs);
    const base = blankBoard(p);
    const gridclues = base.gridclues;
    for (let i = 0; i < o2; i++) {
      gridclues[i] = square[i] > nums ? CROSS : square[i];
    }

    const spaces: number[] = [];
    for (let i = 0; i < o2; i++) spaces.push(i);
    shuffle(spaces, rs);

    for (let i = 0; i < o2; i++) {
      const j = spaces[i];
      let temp = gridclues[j];
      if (temp === 0) continue;

      // Weaken first: a hole or a bare ball goes away entirely, a numbered ball
      // drops to a bare ball ("something lives here, but not which symbol").
      gridclues[j] = temp === CROSS || temp === CIRCLE ? 0 : CIRCLE;
      if (!solvesAt(base, diff)) {
        gridclues[j] = temp;
        continue;
      }

      // Then try to remove what is left of it.
      temp = gridclues[j];
      if (temp === 0) continue;
      gridclues[j] = 0;
      if (!solvesAt(base, diff)) gridclues[j] = temp;
    }

    // Quality check: reject a board whose holes all fall out with no number
    // entered at all.
    if (!solvesAt(base, DIFF_HOLESONLY)) return serialize(gridclues, BASE_DIGIT);
  }
}

/** Upstream `salad_new_letters_desc`. */
function newLettersDesc(p: SaladParams, rs: RandomState): string {
  const o = p.order;
  const o2 = o * o;
  const ox4 = o * 4;
  const nums = p.nums;
  const diff = p.diff;
  // Quality check: with a small grid, force the puzzle to be border-clues-only.
  const nogrid = o < 8;
  const attempt = retryLimit("salad: ABC End View generation");

  for (;;) {
    attempt();
    const square = latinGenerate(o, rs);
    const base = blankBoard(p);
    const { gridclues, borderclues } = base;
    for (let i = 0; i < o2; i++) {
      gridclues[i] = square[i] <= nums ? square[i] : CROSS;
    }

    // Derive every border clue from the full solution.
    for (let i = 0; i < o; i++) {
      for (const s of borderScans(i, o)) {
        borderclues[s.clue] = scanDir(gridclues, null, s.start, s.step, s.end, false);
      }
    }

    if (nogrid) {
      gridclues.fill(0);
      if (!solvesAt(base, diff)) continue;
    } else {
      stripClues(base, rs, gridclues, o2, diff);
    }
    stripClues(base, rs, borderclues, ox4, diff);

    return `${serialize(borderclues, BASE_LETTER)},${serialize(gridclues, BASE_LETTER)}`;
  }
}

export function newSaladDesc(p: SaladParams, rng: RandomState): { desc: string } {
  return {
    desc: p.mode === GAMEMODE_NUMBERS ? newNumbersDesc(p, rng) : newLettersDesc(p, rng),
  };
}
