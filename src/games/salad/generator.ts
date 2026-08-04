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
import type { RandomState } from "../../engine/random/index.ts";
import { retryLimit } from "../../engine/retry-limit.ts";
import { shuffle } from "../../engine/shuffle.ts";
import { saladSolve } from "./solver.ts";
import {
  borderScans,
  CIRCLE,
  CROSS,
  DIFF_EASY,
  DIFF_HOLESONLY,
  GAMEMODE_NUMBERS,
  type SaladBoard,
  type SaladParams,
  scanDir,
  scratchBoard,
  serialize,
} from "./state.ts";

/**
 * Runaway backstop for both generation loops, raised above the house default.
 *
 * The tier gate (`tooEasy`) makes these rejection-sampling loops, and Extreme
 * boards are genuinely rare in the Number Ball mode: measured over 25 runs per
 * preset, `numbers 5x5 n3` costs a **median of 486 candidates and a worst of
 * 4,419** (`letters` modes cost 2–85). The house default of 10,000 is only ~2x
 * that worst case, so it would eventually fire on a perfectly legal seed — and
 * exhaustion throws, in a player's face. This is `retry-limit.ts`'s own "wrong
 * for a rare-but-legal seed" case; the bound stays, but far enough out that
 * reaching it means a tier has become unreachable rather than merely thin.
 */
const MAX_ATTEMPTS = 50_000;

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
 * The tier gate: a board must need the difficulty it was asked for.
 *
 * Stripping only ever makes a board harder, so the fully-stripped board is its
 * hardest form — and if *that* still falls to the tier below, the tier the
 * player chose is not the tier they got. Returns true when the candidate must
 * be thrown away.
 *
 * `loose` reproduces upstream, which has no such gate at all; see
 * {@link SaladGenerateOptions.upstreamLooseGate}.
 */
function tooEasy(base: SaladBoard, diff: number, loose: boolean): boolean {
  if (loose || diff <= DIFF_EASY) return false;
  return solvesAt(base, diff - 1);
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
function newNumbersDesc(p: SaladParams, rs: RandomState, loose: boolean): string {
  const o = p.order;
  const o2 = o * o;
  const nums = p.nums;
  const diff = p.diff;
  const attempt = retryLimit("salad: Number Ball generation", MAX_ATTEMPTS);

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
    if (solvesAt(base, DIFF_HOLESONLY)) continue;
    // Tier gate (the divergence): it must *need* the difficulty requested.
    if (tooEasy(base, diff, loose)) continue;
    return serialize(gridclues, BASE_DIGIT);
  }
}

/** Upstream `salad_new_letters_desc`. */
function newLettersDesc(p: SaladParams, rs: RandomState, loose: boolean): string {
  const o = p.order;
  const o2 = o * o;
  const ox4 = o * 4;
  const nums = p.nums;
  const diff = p.diff;
  // Quality check: with a small grid, force the puzzle to be border-clues-only.
  const nogrid = o < 8;
  const attempt = retryLimit("salad: ABC End View generation", MAX_ATTEMPTS);

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

    // Tier gate (the divergence): it must *need* the difficulty requested.
    if (tooEasy(base, diff, loose)) continue;

    return `${serialize(borderclues, BASE_LETTER)},${serialize(gridclues, BASE_LETTER)}`;
  }
}

export interface SaladGenerateOptions {
  /**
   * Reproduce upstream's difficulty gate, which does not exist.
   *
   * Upstream strips clues while the board still solves at the target tier and
   * publishes whatever that leaves, never asking whether an easier tier would
   * have done. So Extreme does not mean Extreme: measured over this game's own
   * frozen C fixtures, **12 of its 13 Extreme boards are solvable at Normal**,
   * and over 80 freshly generated boards the rate is 71/80 — at 5×5 and 6×6 it
   * is every single board. A difficulty that is a coin-flip away from being the
   * one below it is a plain player-visible defect, so {@link newSaladDesc}
   * rejects such a candidate and generates another.
   *
   * Because generation is solver-gated at every clue removal, that changes
   * every Extreme description — which would cost the byte-match differential
   * that validates the generator, the solver and the codec together. This flag
   * keeps that oracle: `salad-differential.test.ts` sets it, so the fixtures
   * still match the C byte-for-byte and the only lines the oracle no longer
   * covers are the two `tooEasy` calls. Nothing else should ever set it.
   */
  readonly upstreamLooseGate?: boolean;
}

export function newSaladDesc(
  p: SaladParams,
  rng: RandomState,
  options: SaladGenerateOptions = {},
): { desc: string } {
  const loose = options.upstreamLooseGate ?? false;
  return {
    desc:
      p.mode === GAMEMODE_NUMBERS
        ? newNumbersDesc(p, rng, loose)
        : newLettersDesc(p, rng, loose),
  };
}
