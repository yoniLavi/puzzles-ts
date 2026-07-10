/**
 * dominosa — the graded deductive solver, ported faithfully from
 * `dominosa.c`'s `run_solver` + the nine `deduce_*` techniques.
 *
 * The scratch is an idiomatic object graph (`SolverDomino` / `SolverPlacement`
 * / `SolverSquare` with array cross-links) rather than C's parallel `snewn`
 * arrays, but every deduction is ported operation-for-operation — including the
 * swap-remove `ruleOutPlacement` back-index bookkeeping, the bitmask set
 * analysis, the `findloop` parity deduction and the flip-DSF forcing chains —
 * so the verdict (0 impossible / 1 unique / 2 ambiguous) matches C on every
 * board. The generator is solver-gated, so a faithful verdict is what makes the
 * byte-match differential hold (playbook §4.4).
 *
 * The three `.sort()`s here (`squaresByNumber`, the two forcing-chain
 * comparators) use total or tie-order-irrelevant orderings that feed
 * set-membership grouping, not the desc byte-stream, so a plain stable sort
 * preserves the verdict (§4.3).
 */

import { FlipDsf } from "../../engine/dsf.ts";
import { findLoops } from "../../engine/findloop.ts";
import {
  DCOUNT,
  DIFF_BASIC,
  DIFF_EXTREME,
  DIFF_HARD,
  DIFF_TRIVIAL,
  DINDEX,
} from "./state.ts";

/** The deductive technique a hint firing used. */
export type HintTechnique =
  | "onlySpot"
  | "squareOnly"
  | "squareSingleDomino"
  | "mustOverlap"
  | "localDuplicate"
  | "localDuplicate2"
  | "parity"
  | "set"
  | "forcingChain";

/** One firing captured by the hint recorder — either a forced domino placement
 * or a set of ruled-out placements (barriers), plus the squares it reasons
 * over (shaded as evidence). Cell references are `y*w+x` indices. */
export interface HintFiring {
  technique: HintTechnique;
  /** For a placement firing, the `[a, b]` (a < b) square pair to lay a domino. */
  place: [number, number] | null;
  /** For a barrier firing, the `[a, b]` ruled-out placements to bar. */
  barriers: Array<[number, number]>;
  /** Cells the deduction reasons over, to shade as evidence. */
  evidence: number[];
}

class SolverDomino {
  lo = 0;
  hi = 0;
  index = 0;
  /** Live count in `placements[0..nplacements-1]`. */
  nplacements = 0;
  placements: SolverPlacement[] = [];
}

class SolverPlacement {
  index = 0;
  /** The two squares this placement covers. */
  squares: [SolverSquare, SolverSquare];
  domino!: SolverDomino;
  /** Back-index of this placement in each square's placement list. */
  spi: [number, number] = [0, 0];
  /** Back-index of this placement in its domino's placement list. */
  dpi = 0;
  active = true;
  noverlaps = 0;
  overlaps: SolverPlacement[] = [];
  constructor(a: SolverSquare, b: SolverSquare) {
    this.squares = [a, b];
  }
}

class SolverSquare {
  x = 0;
  y = 0;
  index = 0;
  nplacements = 0;
  placements: SolverPlacement[] = [];
  number = 0;
}

/** Given two overlapping placements p,q, the index si such that
 * p.squares[si] is the square also in q. */
function commonSquareIndex(p: SolverPlacement, q: SolverPlacement): number {
  return p.squares[0] === q.squares[0] || p.squares[0] === q.squares[1] ? 0 : 1;
}

export class DominosaSolver {
  readonly n: number;
  readonly dc: number;
  readonly pc: number;
  readonly w: number;
  readonly h: number;
  readonly wh: number;
  maxDiffUsed = DIFF_TRIVIAL;

  readonly dominoes: SolverDomino[] = [];
  readonly placements: SolverPlacement[] = [];
  readonly squares: SolverSquare[] = [];

  private squaresByNumber: SolverSquare[] | null = null;
  private dsfScratch: FlipDsf | null = null;

  // --- hint recording (gated; runSolver / the generator never enable it) ----
  private recording = false;
  /** Edges (`[min, max]` square pair) ruled out during the current firing. */
  private recBarriers: Array<[number, number]> = [];
  /** Cell indices the current firing reasons over (shaded as evidence). */
  private recEvidence: number[] = [];
  /** For a placement-type firing, the square pair to lay a domino on. */
  private recPlace: [number, number] | null = null;

  private resetRec(): void {
    this.recBarriers = [];
    this.recEvidence = [];
    this.recPlace = null;
  }

  private recordEvidence(cells: number[]): void {
    if (this.recording) this.recEvidence = cells;
  }

  constructor(n: number) {
    const w = n + 2;
    const h = n + 1;
    const wh = w * h;
    const dc = DCOUNT(n);
    const pc = (w - 1) * h + w * (h - 1);
    this.n = n;
    this.dc = dc;
    this.pc = pc;
    this.w = w;
    this.h = h;
    this.wh = wh;

    // Dominoes, indexed by DINDEX.
    for (let hi = 0, di = 0; hi <= n; hi++)
      for (let lo = 0; lo <= hi; lo++, di++) {
        const d = new SolverDomino();
        d.hi = hi;
        d.lo = lo;
        d.index = di;
        this.dominoes.push(d);
      }

    // Squares.
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        const sq = new SolverSquare();
        sq.x = x;
        sq.y = y;
        sq.index = y * w + x;
        this.squares.push(sq);
      }

    // Placements: vertical first (each square with the one below), then
    // horizontal — the exact upstream order (iteration order feeds deductions).
    for (let y = 0; y < h - 1; y++)
      for (let x = 0; x < w; x++)
        this.placements.push(
          new SolverPlacement(this.squares[y * w + x], this.squares[(y + 1) * w + x]),
        );
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w - 1; x++)
        this.placements.push(
          new SolverPlacement(this.squares[y * w + x], this.squares[y * w + (x + 1)]),
        );

    // Full placement lists per square (temporarily) to compute overlaps.
    for (const sq of this.squares) sq.nplacements = 0;
    for (const p of this.placements)
      for (let si = 0; si < 2; si++) {
        const sq = p.squares[si];
        p.spi[si] = sq.nplacements;
        sq.placements[sq.nplacements++] = p;
      }
    for (const p of this.placements) {
      p.noverlaps = 0;
      for (let si = 0; si < 2; si++) {
        const sq = p.squares[si];
        for (let j = 0; j < sq.nplacements; j++) {
          const q = sq.placements[j];
          if (q !== p) p.overlaps[p.noverlaps++] = q;
        }
      }
    }
    for (let pi = 0; pi < this.pc; pi++) this.placements[pi].index = pi;
  }

  /** (Re)initialise per-board: assign numbers, rebuild the domino/square
   * placement lists, mark all placements active. Mirrors `solver_setup_grid`. */
  setupGrid(numbers: Int32Array | number[]): void {
    for (const sq of this.squares) {
      sq.nplacements = 0;
      sq.number = numbers[sq.index];
    }
    for (const p of this.placements)
      p.domino = this.dominoes[DINDEX(p.squares[0].number, p.squares[1].number)];

    for (const d of this.dominoes) d.nplacements = 0;
    for (const p of this.placements) p.domino.nplacements++;
    for (const d of this.dominoes) {
      d.placements = new Array(d.nplacements);
      d.nplacements = 0;
    }
    for (const p of this.placements) {
      p.dpi = p.domino.nplacements;
      p.domino.placements[p.domino.nplacements++] = p;
      p.active = true;
    }

    for (const sq of this.squares) sq.nplacements = 0;
    for (const p of this.placements)
      for (let si = 0; si < 2; si++) {
        const sq = p.squares[si];
        p.spi[si] = sq.nplacements;
        sq.placements[sq.nplacements++] = p;
      }

    this.maxDiffUsed = DIFF_TRIVIAL;
    this.squaresByNumber = null;
  }

  private ruleOutPlacement(p: SolverPlacement): void {
    const d = p.domino;
    p.active = false;

    if (this.recording) {
      const a = p.squares[0].index;
      const b = p.squares[1].index;
      this.recBarriers.push(a < b ? [a, b] : [b, a]);
    }

    let i = p.dpi;
    if (--d.nplacements !== i) {
      d.placements[i] = d.placements[d.nplacements];
      d.placements[i].dpi = i;
    }

    for (let si = 0; si < 2; si++) {
      const sq = p.squares[si];
      i = p.spi[si];
      if (--sq.nplacements !== i) {
        sq.placements[i] = sq.placements[sq.nplacements];
        const j = sq.placements[i].squares[0] === sq ? 0 : 1;
        sq.placements[i].spi[j] = i;
      }
    }
  }

  // --- Trivial ------------------------------------------------------------

  private deduceDominoSinglePlacement(di: number): boolean {
    const d = this.dominoes[di];
    if (d.nplacements !== 1) return false;
    const p = d.placements[0];
    let done = false;
    for (let oi = 0; oi < p.noverlaps; oi++) {
      const q = p.overlaps[oi];
      if (q.active) {
        done = true;
        this.ruleOutPlacement(q);
      }
    }
    return done;
  }

  private deduceSquareSinglePlacement(si: number): boolean {
    const sq = this.squares[si];
    if (sq.nplacements !== 1) return false;
    const p = sq.placements[0];
    const d = p.domino;
    if (d.nplacements <= 1) return false;
    if (this.recording) {
      const a = p.squares[0].index;
      const b = p.squares[1].index;
      this.recPlace = a < b ? [a, b] : [b, a];
      this.recEvidence = [sq.index];
    }
    while (d.nplacements > 1)
      this.ruleOutPlacement(d.placements[0] === p ? d.placements[1] : d.placements[0]);
    return true;
  }

  // --- Basic --------------------------------------------------------------

  private deduceSquareSingleDomino(si: number): boolean {
    const sq = this.squares[si];
    if (sq.nplacements < 2) return false;
    const d = sq.placements[0].domino;
    for (let i = 1; i < sq.nplacements; i++)
      if (sq.placements[i].domino !== d) return false;
    if (d.nplacements <= sq.nplacements) return false;
    this.recordEvidence([sq.index]);
    for (let i = d.nplacements; i-- > 0; ) {
      const p = d.placements[i];
      if (p.squares[0] !== sq && p.squares[1] !== sq) this.ruleOutPlacement(p);
    }
    return true;
  }

  private deduceDominoMustOverlap(di: number): boolean {
    const d = this.dominoes[di];
    if (d.nplacements < 2) return false;
    const intersection: SolverPlacement[] = [];
    let nint = 0;
    let p = d.placements[0];
    for (let i = 0; i < p.noverlaps; i++)
      if (p.overlaps[i].active) intersection[nint++] = p.overlaps[i];
    for (let j = 1; j < d.nplacements; j++) {
      p = d.placements[j];
      const oldN = nint;
      nint = 0;
      for (let k = 0; k < oldN; k++) {
        let found = false;
        for (let i = 0; i < p.noverlaps; i++)
          if (p.overlaps[i] === intersection[k]) {
            found = true;
            break;
          }
        if (found) intersection[nint++] = intersection[k];
      }
    }
    if (nint === 0) return false;
    if (this.recording) {
      const cells: number[] = [];
      for (let j = 0; j < d.nplacements; j++)
        cells.push(d.placements[j].squares[0].index, d.placements[j].squares[1].index);
      this.recEvidence = cells;
    }
    for (let i = 0; i < nint; i++) this.ruleOutPlacement(intersection[i]);
    return true;
  }

  private deduceLocalDuplicate(pi: number): boolean {
    const p = this.placements[pi];
    const d = p.domino;
    if (!p.active) return false;
    for (let i = 0; i < p.noverlaps; i++) {
      const q = p.overlaps[i];
      if (!q.active) continue;
      const sq = q.squares[1 - commonSquareIndex(q, p)];
      let bad = false;
      for (let j = 0; j < sq.nplacements; j++)
        if (sq.placements[j] !== q && sq.placements[j].domino !== d) {
          bad = true;
          break;
        }
      if (bad) continue;
      this.recordEvidence([sq.index]);
      this.ruleOutPlacement(p);
      return true;
    }
    return false;
  }

  private deduceLocalDuplicate2(pi: number): boolean {
    const p = this.placements[pi];
    if (!p.active) return false;
    for (let i = 0; i < p.noverlaps; i++) {
      const qi = p.overlaps[i];
      if (!qi.active) continue;
      const sqi = qi.squares[1 - commonSquareIndex(qi, p)];
      let di: SolverDomino | null = null;
      let badQi = false;
      for (let k = 0; k < sqi.nplacements; k++) {
        const pk = sqi.placements[k];
        if (pk === qi) continue;
        if (!di) di = pk.domino;
        else if (di !== pk.domino) {
          badQi = true;
          break;
        }
      }
      if (badQi || !di) continue;

      for (let j = 0; j < p.noverlaps; j++) {
        const qj = p.overlaps[j];
        if (j === i || !qj.active) continue;
        const sqj = qj.squares[1 - commonSquareIndex(qj, p)];
        let foundDi = false;
        let badQj = false;
        for (let k = 0; k < sqj.nplacements; k++) {
          const pk = sqj.placements[k];
          if (pk === qj) continue;
          if (pk.domino !== di) {
            badQj = true;
            break;
          }
          if (pk.squares[0] === sqi || pk.squares[1] === sqi) {
            badQj = true;
            break;
          }
          foundDi = true;
        }
        if (badQj || !foundDi) continue;
        this.recordEvidence([sqi.index, sqj.index]);
        this.ruleOutPlacement(p);
        return true;
      }
    }
    return false;
  }

  private deduceParity(): boolean {
    // Bridge-finding over the graph whose vertices are squares and whose edges
    // are active placements: a bridge is a domino whose placement would split
    // the unfilled area, and if both resulting sides are even-sized, placing it
    // would leave two odd (untileable) areas — so it can be ruled out.
    const result = findLoops(this.wh, (v) => {
      const sq = this.squares[v];
      const out: number[] = [];
      for (let i = 0; i < sq.nplacements; i++) {
        const pp = sq.placements[i];
        out.push(pp.squares[0].index + pp.squares[1].index - v);
      }
      return out;
    });

    let done = false;
    for (let pi = 0; pi < this.pc; pi++) {
      const p = this.placements[pi];
      if (!p.active) continue;
      const split = result.isBridge(p.squares[0].index, p.squares[1].index);
      if (!split) continue;
      if ((split.uVertices | split.vVertices) & 1) continue;
      this.ruleOutPlacement(p);
      done = true;
    }
    return done;
  }

  // --- Hard / Extreme: set analysis --------------------------------------

  private deduceSet(doubles: boolean): boolean {
    if (!this.squaresByNumber) {
      this.squaresByNumber = this.squares.slice();
      this.squaresByNumber.sort((a, b) =>
        a.number !== b.number ? a.number - b.number : a.index - b.index,
      );
    }
    const sqbn = this.squaresByNumber;
    const whScratch = new Int32Array(this.wh); // square index → local group index
    const ds: SolverDomino[] = new Array(this.n + 1);
    let done = false;

    let sqp = 0;
    for (let num = 0; num <= this.n; num++) {
      const sqs = sqp;
      while (sqp < this.wh && sqbn[sqp].number === num) sqp++;
      const nsq = sqp - sqs;

      if (nsq > 16) continue; // too large to enumerate subsets (never for valid boards)

      for (let i = 0; i < nsq; i++) whScratch[sqbn[sqs + i].index] = i;

      const dominoSets: number[] = new Array(nsq).fill(0);
      const adjacent: number[] = new Array(nsq).fill(0);
      for (let i = 0; i < nsq; i++) {
        const sq = sqbn[sqs + i];
        let mask = 0;
        for (let j = 0; j < sq.nplacements; j++) {
          const p = sq.placements[j];
          const othernum = p.domino.lo + p.domino.hi - num;
          mask |= 1 << othernum;
          ds[othernum] = p.domino;
          if (othernum === num) {
            const i2 = whScratch[p.squares[0].index + p.squares[1].index - sq.index];
            adjacent[i] |= 1 << i2;
            adjacent[i2] |= 1 << i;
          }
        }
        dominoSets[i] = mask;
      }

      let squaresDone = 0;
      for (let squares = 0; squares < 1 << nsq; squares++) {
        if (squares & squaresDone) continue;

        let dominoes = 0;
        let nsquares = 0;
        let gotAdj = false;
        for (let bit = 0; bit < nsq; bit++) {
          if (!((squares >> bit) & 1)) continue;
          if (adjacent[bit] & squares) gotAdj = true;
          dominoes |= dominoSets[bit];
          nsquares++;
        }

        let ndominoes = 0;
        for (let bit = 0; bit < nsq; bit++) ndominoes += (dominoes >> bit) & 1;

        let ruleOutNondoubles: boolean;
        let minNusedForDouble: number;
        if (!gotAdj) {
          if (ndominoes !== nsquares) continue;
          ruleOutNondoubles = true;
          minNusedForDouble = 1;
        } else {
          if (!doubles) continue;
          if (ndominoes === nsquares - 1) {
            ruleOutNondoubles = true;
            minNusedForDouble = 2;
          } else if (ndominoes === nsquares) {
            ruleOutNondoubles = false;
            minNusedForDouble = 1;
          } else {
            continue;
          }
        }

        // Skip sets of size 1 or whose complement has size 1 (a simpler
        // deduction handles those, and should, for cleaner diagnostics).
        if (ndominoes <= 1 || ndominoes >= nsq - 1) continue;

        if (ruleOutNondoubles) squaresDone |= squares;

        let reported = false;
        for (let bit = 0; bit < nsq; bit++) {
          if (!((dominoes >> bit) & 1)) continue;
          const d = ds[bit];
          for (let i = d.nplacements; i-- > 0; ) {
            const p = d.placements[i];
            let nused = 0;
            for (let si = 0; si < 2; si++) {
              const sq2 = p.squares[si];
              if (sq2.number === num && (squares >> whScratch[sq2.index]) & 1) nused++;
            }
            if (d.lo === d.hi) {
              if (nused >= minNusedForDouble) continue;
            } else {
              if (nused > 0 || !ruleOutNondoubles) continue;
            }
            if (!reported) {
              reported = true;
              done = true;
              squaresDone |= squares;
              if (this.recording) {
                const cells: number[] = [];
                for (let bb = 0; bb < nsq; bb++)
                  if ((squares >> bb) & 1) cells.push(sqbn[sqs + bb].index);
                this.recEvidence = cells;
              }
            }
            this.ruleOutPlacement(p);
          }
        }
      }
    }
    return done;
  }

  // --- Extreme: forcing chains -------------------------------------------

  private deduceForcingChain(): boolean {
    const pc = this.pc;
    const whScratch = new Int32Array(this.wh);
    const pcScratch = new Int32Array(pc); // placement → chain id (root*2 + inv)
    if (!this.dsfScratch) this.dsfScratch = new FlipDsf(pc);
    const dsf = this.dsfScratch;
    let done = false;

    // Bind placements that must occur together (a square with exactly two
    // placements links them as a flip pair — they are the two complementary
    // choices for that square).
    dsf.reinit();
    for (const sq of this.squares)
      if (sq.nplacements === 2)
        dsf.mergeFlip(sq.placements[0].index, sq.placements[1].index, true);

    for (let pi = 0; pi < pc; pi++) {
      const { root, inverse } = dsf.canonify(pi);
      pcScratch[pi] = root * 2 + (inverse ? 1 : 0);
    }

    // 1. A chain containing a duplicate domino is impossible → rule it out.
    let order = Array.from({ length: pc }, (_, i) => i);
    order.sort((a, b) => {
      if (pcScratch[a] !== pcScratch[b]) return pcScratch[a] - pcScratch[b];
      return this.placements[a].domino.index - this.placements[b].domino.index;
    });

    for (let j = 0; j < pc; ) {
      const ci = pcScratch[order[j]];
      const cstart = j;
      while (j < pc && pcScratch[order[j]] === ci) j++;
      const climit = j;
      let duplicated = false;
      for (let k = cstart; k + 1 < climit; k++) {
        if (this.placements[order[k]].domino === this.placements[order[k + 1]].domino) {
          duplicated = true;
          break;
        }
      }
      if (!duplicated) continue;
      for (let k = cstart; k < climit; k++)
        this.ruleOutPlacement(this.placements[order[k]]);
      done = true;
    }
    if (done) return true;

    // 2. A chain covering all placements of some other square is impossible.
    order = Array.from({ length: pc }, (_, i) => i);
    order.sort((a, b) => {
      if (this.placements[a].domino.index !== this.placements[b].domino.index)
        return this.placements[a].domino.index - this.placements[b].domino.index;
      return pcScratch[a] - pcScratch[b];
    });

    const dcScratch = new Int32Array(this.dc); // domino index → first entry in `order`
    for (let di = 0, j = 0; j < pc; j++) {
      while (di <= this.placements[order[j]].domino.index) dcScratch[di++] = j;
    }

    for (const sq of this.squares) {
      if (sq.nplacements < 2) continue;
      let listSize = 0;

      const exclude: number[] = [];
      for (let j = 0; j < sq.nplacements; j++)
        exclude.push(pcScratch[sq.placements[j].index]);

      for (let j = 0; j < sq.nplacements; j++) {
        const d = sq.placements[j].domino;
        let listOut = 0;
        let listPos = 0;
        for (
          let k = dcScratch[d.index];
          k < pc && this.placements[order[k]].domino === d;
          k++
        ) {
          const chain = pcScratch[order[k]];
          if (!this.placements[order[k]].active) continue;
          let keep: boolean;
          if (j === 0) keep = true;
          else {
            while (listPos < listSize && whScratch[listPos] < chain) listPos++;
            keep = listPos < listSize && whScratch[listPos] === chain;
          }
          for (let m = 0; m < exclude.length; m++)
            if (chain === exclude[m]) keep = false;
          if (keep) whScratch[listOut++] = chain;
        }
        listSize = listOut;
        if (listSize === 0) break;
      }

      for (let listPos = 0; listPos < listSize; listPos++) {
        const chain = whScratch[listPos];
        for (let pi = 0; pi < pc; pi++)
          if (pcScratch[pi] === chain) this.ruleOutPlacement(this.placements[pi]);
        done = true;
      }
    }

    // 3. A domino with placements in two complementary chains must occupy one
    // of them → rule out its placements elsewhere.
    for (let di = 0; di < this.dc; di++) {
      const d = this.dominoes[di];
      if (d.nplacements <= 2) continue;
      let hit = false;
      for (let j = 0; j + 1 < d.nplacements && !hit; j++) {
        const cj = pcScratch[d.placements[j].index];
        for (let k = j + 1; k < d.nplacements; k++) {
          const ck = pcScratch[d.placements[k].index];
          if ((cj ^ ck) === 1) {
            for (let i = d.nplacements; i-- > 0; )
              if (i !== j && i !== k) this.ruleOutPlacement(d.placements[i]);
            done = true;
            hit = true;
            break;
          }
        }
      }
    }

    return done;
  }

  // --- driver -------------------------------------------------------------

  /** Run to a fixpoint, capped at `maxDiffAllowed`. Returns 0 (impossible),
   * 1 (unique solution), or 2 (ambiguous / solver too weak). */
  runSolver(maxDiffAllowed: number): number {
    let progressed: boolean;
    do {
      progressed = false;

      for (let di = 0; di < this.dc; di++)
        if (this.deduceDominoSinglePlacement(di)) progressed = true;
      if (progressed) {
        this.maxDiffUsed = Math.max(this.maxDiffUsed, DIFF_TRIVIAL);
        continue;
      }
      for (let si = 0; si < this.wh; si++)
        if (this.deduceSquareSinglePlacement(si)) progressed = true;
      if (progressed) {
        this.maxDiffUsed = Math.max(this.maxDiffUsed, DIFF_TRIVIAL);
        continue;
      }
      if (maxDiffAllowed <= DIFF_TRIVIAL) continue;

      for (let si = 0; si < this.wh; si++)
        if (this.deduceSquareSingleDomino(si)) progressed = true;
      if (progressed) {
        this.maxDiffUsed = Math.max(this.maxDiffUsed, DIFF_BASIC);
        continue;
      }
      for (let di = 0; di < this.dc; di++)
        if (this.deduceDominoMustOverlap(di)) progressed = true;
      if (progressed) {
        this.maxDiffUsed = Math.max(this.maxDiffUsed, DIFF_BASIC);
        continue;
      }
      for (let pi = 0; pi < this.pc; pi++)
        if (this.deduceLocalDuplicate(pi)) progressed = true;
      if (progressed) {
        this.maxDiffUsed = Math.max(this.maxDiffUsed, DIFF_BASIC);
        continue;
      }
      for (let pi = 0; pi < this.pc; pi++)
        if (this.deduceLocalDuplicate2(pi)) progressed = true;
      if (progressed) {
        this.maxDiffUsed = Math.max(this.maxDiffUsed, DIFF_BASIC);
        continue;
      }
      if (this.deduceParity()) progressed = true;
      if (progressed) {
        this.maxDiffUsed = Math.max(this.maxDiffUsed, DIFF_BASIC);
        continue;
      }
      if (maxDiffAllowed <= DIFF_BASIC) continue;

      if (this.deduceSet(false)) progressed = true;
      if (progressed) {
        this.maxDiffUsed = Math.max(this.maxDiffUsed, DIFF_HARD);
        continue;
      }
      if (maxDiffAllowed <= DIFF_HARD) continue;

      if (this.deduceSet(true)) progressed = true;
      if (progressed) {
        this.maxDiffUsed = Math.max(this.maxDiffUsed, DIFF_EXTREME);
        continue;
      }
      if (this.deduceForcingChain()) progressed = true;
      if (progressed) {
        this.maxDiffUsed = Math.max(this.maxDiffUsed, DIFF_EXTREME);
      }
    } while (progressed);

    for (const d of this.dominoes) if (d.nplacements === 0) return 0;
    for (const d of this.dominoes) if (d.nplacements > 1) return 2;
    return 1;
  }

  /** After a unique solve, the forced domino placements as `[d1, d2]` pairs
   * (`d1 < d2`). Only meaningful when `runSolver` returned 1. */
  solutionPairs(): Array<[number, number]> {
    const out: Array<[number, number]> = [];
    for (const d of this.dominoes) {
      if (d.nplacements !== 1) continue;
      const p = d.placements[0];
      const a = p.squares[0].index;
      const b = p.squares[1].index;
      out.push(a < b ? [a, b] : [b, a]);
    }
    return out;
  }

  // --- hint driver --------------------------------------------------------

  /** Find the still-active placement covering squares `a` and `b`, or null. */
  private placementOf(a: number, b: number): SolverPlacement | null {
    const sq = this.squares[a];
    for (let k = 0; k < sq.nplacements; k++) {
      const p = sq.placements[k];
      if (p.squares[0].index === b || p.squares[1].index === b) return p;
    }
    return null;
  }

  /** Realise "a domino is placed on (a, b)": rule out the placement's active
   * overlaps and any other placements of its domino. Non-recording. */
  forcePlacement(a: number, b: number): void {
    const p = this.placementOf(a, b);
    if (!p) return;
    while (p.domino.nplacements > 1)
      this.ruleOutPlacement(
        p.domino.placements[0] === p ? p.domino.placements[1] : p.domino.placements[0],
      );
    for (let oi = 0; oi < p.noverlaps; oi++)
      if (p.overlaps[oi].active) this.ruleOutPlacement(p.overlaps[oi]);
  }

  /** Seed the scratch from the player's placed dominoes (forcing each). The
   * player's barrier annotations are deliberately NOT seeded (a wrong one must
   * never break the hint — the recorder re-derives every rule-out itself). */
  seedFromDominoes(grid: Int32Array): void {
    for (let i = 0; i < this.wh; i++) {
      const j = grid[i];
      if (j > i) this.forcePlacement(i, j);
    }
  }

  /** Run the deductions in `run_solver` order but return after the FIRST
   * firing, capturing what it did — the hint-plan primitive. `placed` holds the
   * domino indices already laid on the working board, so an already-placed
   * determined domino isn't re-suggested. Returns null when no deduction fires
   * (a fully-reduced or genuinely stuck board). */
  firstFiring(maxDiffAllowed: number, placed: ReadonlySet<number>): HintFiring | null {
    // A domino determined but not yet laid — the payoff "only spot" placement.
    for (const d of this.dominoes) {
      if (d.nplacements === 1 && !placed.has(d.index)) {
        const p = d.placements[0];
        const a = p.squares[0].index;
        const b = p.squares[1].index;
        return {
          technique: "onlySpot",
          place: a < b ? [a, b] : [b, a],
          barriers: [],
          evidence: [],
        };
      }
    }

    this.recording = true;
    try {
      const place = (technique: HintTechnique): HintFiring => ({
        technique,
        place: this.recPlace,
        barriers: [],
        evidence: this.recEvidence,
      });
      const barrier = (technique: HintTechnique): HintFiring => ({
        technique,
        place: null,
        barriers: this.recBarriers.slice(),
        evidence: this.recEvidence.slice(),
      });

      // Trivial
      for (let si = 0; si < this.wh; si++) {
        this.resetRec();
        if (this.deduceSquareSinglePlacement(si)) return place("squareOnly");
      }
      if (maxDiffAllowed <= DIFF_TRIVIAL) return null;

      // Basic
      for (let si = 0; si < this.wh; si++) {
        this.resetRec();
        if (this.deduceSquareSingleDomino(si)) return barrier("squareSingleDomino");
      }
      for (let di = 0; di < this.dc; di++) {
        this.resetRec();
        if (this.deduceDominoMustOverlap(di)) return barrier("mustOverlap");
      }
      for (let pi = 0; pi < this.pc; pi++) {
        this.resetRec();
        if (this.deduceLocalDuplicate(pi)) return barrier("localDuplicate");
      }
      for (let pi = 0; pi < this.pc; pi++) {
        this.resetRec();
        if (this.deduceLocalDuplicate2(pi)) return barrier("localDuplicate2");
      }
      this.resetRec();
      if (this.deduceParity()) return barrier("parity");
      if (maxDiffAllowed <= DIFF_BASIC) return null;

      // Hard
      this.resetRec();
      if (this.deduceSet(false)) return barrier("set");
      if (maxDiffAllowed <= DIFF_HARD) return null;

      // Extreme
      this.resetRec();
      if (this.deduceSet(true)) return barrier("set");
      this.resetRec();
      if (this.deduceForcingChain()) return barrier("forcingChain");

      return null;
    } finally {
      this.recording = false;
    }
  }
}

/** Convenience: solve a numbers grid from scratch. Returns the verdict, the
 * max difficulty used, and (when unique) the solution domino pairs. */
export function solveNumbers(
  n: number,
  numbers: Int32Array | number[],
  maxDiff: number,
): { result: number; maxDiffUsed: number; pairs: Array<[number, number]> } {
  const sc = new DominosaSolver(n);
  sc.setupGrid(numbers);
  const result = sc.runSolver(maxDiff);
  return {
    result,
    maxDiffUsed: sc.maxDiffUsed,
    pairs: result === 1 ? sc.solutionPairs() : [],
  };
}
