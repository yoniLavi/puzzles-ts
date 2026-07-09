/**
 * dominosa — board generator, ported faithfully from `new_game_desc` and the
 * `alloc_*` allocator in `dominosa.c`.
 *
 * The strategy is brute force: lay a random domino tiling (`dominoLayout`),
 * assign numbers by one of three strategies keyed on difficulty, run the solver,
 * and keep the board only if it is uniquely solvable at *exactly* the target
 * difficulty. RNG-faithful throughout (playbook §4.3–4.4): every `shuffle` and
 * `randomUpto` draw is reproduced in order over the bit-identical `random.ts`,
 * so `newDesc` matches C's desc byte-for-byte for a given seed.
 */

import { dominoLayout } from "../../engine/laydomino.ts";
import { shuffle } from "../../engine/shuffle.ts";
import { type RandomState, randomUpto } from "../../random/index.ts";
import { DominosaSolver } from "./solver.ts";
import {
  DCOUNT,
  DIFF_AMBIGUOUS,
  DIFF_BASIC,
  DIFF_HARD,
  DIFF_TRIVIAL,
  DINDEX,
  type DominosaParams,
  encodeNumbers,
} from "./state.ts";

/** Guard against a faithful-but-divergent generator hanging (§4.6). */
const MAX_REGENERATE = 200000;

interface AllocVal {
  lo: number;
  hi: number;
  confounder: boolean;
}

class AllocScratch {
  readonly n: number;
  readonly w: number;
  readonly h: number;
  readonly wh: number;
  readonly dc: number;
  layout: Int32Array;
  numbers: Int32Array;
  vals: AllocVal[];
  /** Domino locations (square pairs), indexed arbitrarily. */
  locs: Array<[number, number]> = [];

  constructor(n: number) {
    this.n = n;
    this.w = n + 2;
    this.h = n + 1;
    this.wh = this.w * this.h;
    this.dc = DCOUNT(n);
    this.layout = new Int32Array(this.wh);
    this.numbers = new Int32Array(this.wh);
    this.vals = new Array(this.dc);
    for (let hi = 0; hi <= n; hi++)
      for (let lo = 0; lo <= hi; lo++)
        this.vals[DINDEX(hi, lo)] = { lo, hi, confounder: false };
  }

  makeLayout(rng: RandomState): void {
    this.layout = dominoLayout(this.w, this.h, rng);
    this.locs = [];
    for (let i = 0; i < this.wh; i++)
      if (this.layout[i] > i) this.locs.push([i, this.layout[i]]);
  }

  /** The domino location on one side of location (p0,p1); null if OOB or not a
   * domino in the layout. Mirrors `alloc_find_neighbour`. */
  private findNeighbour(p0: number, p1: number): [number, number] | null {
    const w = this.w;
    const h = this.h;
    const x0 = p0 % w;
    const y0 = Math.floor(p0 / w);
    const x1 = p1 % w;
    const y1 = Math.floor(p1 / w);
    const dy = y1 - y0;
    const dx = x1 - x0;
    const nx0 = x0 + dy;
    const ny0 = y0 - dx;
    const nx1 = x1 + dy;
    const ny1 = y1 - dx;
    if (
      !(
        nx0 >= 0 &&
        nx0 < w &&
        ny0 >= 0 &&
        ny0 < h &&
        nx1 >= 1 &&
        nx1 < w &&
        ny1 >= 1 &&
        ny1 < h
      )
    )
      return null;
    const np0 = ny0 * w + nx0;
    const np1 = ny1 * w + nx1;
    if (this.layout[np0] !== np1) return null;
    return [np0, np1];
  }

  trivial(rng: RandomState): void {
    const order = Array.from({ length: this.dc }, (_, i) => i);
    shuffle(order, rng);
    for (let i = 0; i < this.dc; i++) {
      const val = this.vals[order[i]];
      const loc = this.locs[i];
      const whichLo = randomUpto(rng, 2);
      const whichHi = 1 - whichLo;
      this.numbers[loc[whichLo]] = val.lo;
      this.numbers[loc[whichHi]] = val.hi;
    }
  }

  tryUnique(rng: RandomState): boolean {
    const valOrder = Array.from({ length: this.dc }, (_, i) => i);
    shuffle(valOrder, rng);
    const locOrder = Array.from({ length: this.dc }, (_, i) => i);
    shuffle(locOrder, rng);

    this.numbers.fill(-1);

    for (let i = 0; i < this.dc; i++) {
      const val = this.vals[valOrder[i]];
      const loc = this.locs[locOrder[i]];
      let canLo0 = true;
      let canLo1 = true;

      let nb = this.findNeighbour(loc[0], loc[1]);
      if (nb && (this.numbers[nb[0]] === val.hi || this.numbers[nb[1]] === val.lo))
        canLo0 = false;
      nb = this.findNeighbour(loc[1], loc[0]);
      if (nb && (this.numbers[nb[0]] === val.hi || this.numbers[nb[1]] === val.lo))
        canLo1 = false;

      let whichLo: number;
      if (!canLo0 && !canLo1) return false;
      else if (canLo0 && canLo1) whichLo = randomUpto(rng, 2);
      else whichLo = canLo0 ? 0 : 1;

      const whichHi = 1 - whichLo;
      this.numbers[loc[whichLo]] = val.lo;
      this.numbers[loc[whichHi]] = val.hi;
    }
    return true;
  }

  tryHard(rng: RandomState): boolean {
    const n = this.n;
    const w = this.w;
    const h = this.h;
    const numbers = this.numbers;
    numbers.fill(-1);

    // Shuffle the location indices.
    const locOrder = Array.from({ length: this.dc }, (_, i) => i);
    shuffle(locOrder, rng);

    // Place the double dominoes first, seeding every number.
    const doubles = Array.from({ length: n + 1 }, (_, i) => DINDEX(i, i));
    shuffle(doubles, rng);
    for (let i = 0; i <= n; i++) {
      const loc = this.locs[locOrder[i]];
      numbers[loc[0]] = numbers[loc[1]] = i;
    }

    // Find dominoes that don't yet have a *wrong* placement anywhere (they will
    // need one — a "confounder" — before removing this toehold).
    for (const v of this.vals) v.confounder = false;
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        const p = y * w + x;
        if (numbers[p] === -1) continue;
        if (x + 1 < w) {
          const p1 = y * w + (x + 1);
          if (this.layout[p] !== p1 && numbers[p1] !== -1)
            this.vals[DINDEX(numbers[p], numbers[p1])].confounder = true;
        }
        if (y + 1 < h) {
          const p1 = (y + 1) * w + x;
          if (this.layout[p] !== p1 && numbers[p1] !== -1)
            this.vals[DINDEX(numbers[p], numbers[p1])].confounder = true;
        }
      }

    let confoundersNeeded = 0;
    for (const v of this.vals) if (!v.confounder) confoundersNeeded++;

    // Shuffled list of all the (non-double) unplaced dominoes.
    let valList: number[] = [];
    for (let hi = 0; hi <= n; hi++)
      for (let lo = 0; lo < hi; lo++) valList.push(DINDEX(hi, lo));
    shuffle(valList, rng);

    const locs = this.dc;

    while (valList.length > 0) {
      const oldVals = valList.length;
      const nextList: number[] = [];

      for (let valpos = 0; valpos < valList.length; valpos++) {
        const validx = valList[valpos];
        const val = this.vals[validx];

        // Search for a location + orientation to place this domino that also
        // introduces at least one still-needed confounder.
        let placedLoc: [number, number] | null = null;
        let placedWhichLo = 0;

        locpos: for (let lp = 0; lp < locs; lp++) {
          const loc = this.locs[locOrder[lp]];
          if (numbers[loc[0]] !== -1) continue;
          const flip = randomUpto(rng, 2);

          for (let wi = 0; wi < 2; wi++) {
            const whichLo = wi ^ flip;
            const nb = this.findNeighbour(loc[whichLo], loc[1 - whichLo]);
            if (nb && (numbers[nb[0]] === val.hi || numbers[nb[1]] === val.lo)) break; // can't place this way round → give up on this location

            if (confoundersNeeded === 0) {
              placedLoc = loc;
              placedWhichLo = whichLo;
              break locpos;
            }

            // Does placing here add a previously-absent confounder?
            for (let si = 0; si < 2; si++) {
              const x = loc[si] % w;
              const y = Math.floor(loc[si] / w);
              const nn = si === whichLo ? val.lo : val.hi;
              for (let d = 0; d < 4; d++) {
                const dx = d === 0 ? 1 : d === 2 ? -1 : 0;
                const dy = d === 1 ? 1 : d === 3 ? -1 : 0;
                const x1 = x + dx;
                const y1 = y + dy;
                const p1 = y1 * w + x1;
                if (
                  x1 >= 0 &&
                  x1 < w &&
                  y1 >= 0 &&
                  y1 < h &&
                  numbers[p1] !== -1 &&
                  !this.vals[DINDEX(nn, numbers[p1])].confounder
                ) {
                  placedLoc = loc;
                  placedWhichLo = whichLo;
                  break locpos;
                }
              }
            }
          }
        }

        if (!placedLoc) {
          nextList.push(validx); // try again next pass
          continue;
        }

        // Place the domino and fill in the confounders it adds.
        const loc = placedLoc;
        const whichLo = placedWhichLo;
        numbers[loc[whichLo]] = val.lo;
        numbers[loc[1 - whichLo]] = val.hi;

        for (let si = 0; si < 2; si++) {
          const p = loc[si];
          const nn = numbers[p];
          const x = p % w;
          const y = Math.floor(p / w);
          for (let d = 0; d < 4; d++) {
            const dx = d === 0 ? 1 : d === 2 ? -1 : 0;
            const dy = d === 1 ? 1 : d === 3 ? -1 : 0;
            const x1 = x + dx;
            const y1 = y + dy;
            const p1 = y1 * w + x1;
            if (
              x1 >= 0 &&
              x1 < w &&
              y1 >= 0 &&
              y1 < h &&
              p1 !== loc[1 - si] &&
              numbers[p1] !== -1
            ) {
              const di = DINDEX(nn, numbers[p1]);
              if (!this.vals[di].confounder) confoundersNeeded--;
              this.vals[di].confounder = true;
            }
          }
        }
      }

      valList = nextList;
      if (oldVals === valList.length) break; // no progress this pass
    }

    for (const v of this.vals) if (!v.confounder) return false;
    for (let i = 0; i < this.wh; i++) if (numbers[i] === -1) return false;
    return true;
  }
}

export function newDominosaDesc(
  p: DominosaParams,
  rng: RandomState,
): { desc: string; aux: string } {
  const n = p.n;
  const w = n + 2;
  let diff = p.diff;

  // Cap the difficulty for tiny puzzles that would otherwise be impossible to
  // generate (upstream OMIT_DIFFICULTY_CAP guard).
  if (diff !== DIFF_AMBIGUOUS) {
    if (n === 1 && diff > DIFF_TRIVIAL) diff = DIFF_TRIVIAL;
    if (n === 2 && diff > DIFF_BASIC) diff = DIFF_BASIC;
  }

  const sc = new DominosaSolver(n);
  const as = new AllocScratch(n);

  let tries = 0;
  for (;;) {
    if (++tries > MAX_REGENERATE)
      throw new Error(`dominosa: generation exceeded ${MAX_REGENERATE} attempts`);

    as.makeLayout(rng);

    if (diff === DIFF_AMBIGUOUS) {
      as.trivial(rng);
    } else if (diff < DIFF_HARD) {
      if (!as.tryUnique(rng)) continue;
    } else {
      if (!as.tryHard(rng)) continue;
      sc.setupGrid(as.numbers);
      if (sc.runSolver(DIFF_BASIC) < 2) continue;
      let ok = true;
      for (const d of sc.dominoes)
        if (d.nplacements <= 1) {
          ok = false;
          break;
        }
      if (!ok) continue;
    }

    if (diff !== DIFF_AMBIGUOUS) {
      sc.setupGrid(as.numbers);
      const result = sc.runSolver(diff);
      if (result > 1) continue; // not solvable at this difficulty
      if (sc.maxDiffUsed < diff) continue; // solvable at an easier difficulty
    }

    break;
  }

  const desc = encodeNumbers(as.numbers);

  // Encode the solved layout as aux (per-square domino orientation).
  let aux = "";
  for (let i = 0; i < as.wh; i++) {
    const v = as.layout[i];
    aux +=
      v === i + 1
        ? "L"
        : v === i - 1
          ? "R"
          : v === i + w
            ? "T"
            : v === i - w
              ? "B"
              : ".";
  }

  return { desc, aux };
}
