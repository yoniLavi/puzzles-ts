/**
 * Bridges solver — faithful port of the multi-stage deductive solver in
 * `puzzles/bridges.c` (`solve_sub` and friends). Byte-match fidelity of the
 * generator's difficulty grading depends on this reproducing C's verdict
 * exactly, so the deductions are transcribed rule-for-rule.
 *
 * Structure:
 *  - Stage 1 (Easy): whole-island arithmetic — fill when forced, mark full.
 *  - Stage 2 (Normal): per-connection reasoning — a direction that must carry a
 *    bridge, and loop-avoidance when `allowloops` is off.
 *  - Stage 3 (Tricky): group reasoning over a dsf — speculatively cap/force a
 *    direction to avoid an isolated finished subgraph or an impossibility.
 *
 * `solve_sub`'s `difficulty` is a monotone stage gate (0/1/2 = stage 1 / +2 /
 * +3), not a recursion depth; there is no guessing search. The dsf's canonical
 * root is never observed (only same-group and group-count queries), so the
 * shared union-by-size `Dsf` is safe here without root-identity discipline.
 */
import {
  type DeductionTechnique,
  type FiringTally,
  runDeductionFixpoint,
} from "../../engine/deduction-fixpoint.ts";
import { Dsf } from "../../engine/dsf.ts";
import { findLoops } from "../../engine/findloop.ts";
import type { StepBudget } from "../../engine/step-budget.ts";
import {
  type BridgesOp,
  type BridgesState,
  G_ISLAND,
  G_LINE,
  G_LINEH,
  G_LINEV,
  G_MARK,
  G_SWEEP,
  G_WARN,
  type Island,
} from "./state.ts";

// --- the recording projection: what a firing points at, and why ------------

/** A bridge span, by the two islands it runs between. */
export interface BridgesSpan {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

/**
 * The board one firing reasons **from**, captured inside the rung at the moment
 * it fires and before it changes anything.
 *
 * Captured there rather than reconstructed afterwards because two of the three
 * stages destroy their own premise: stage 3 rolls its trial back before the
 * conclusion is drawn, so the group it would have sealed off exists only while
 * the trial stands (docs/games/hints.md § "Show the evidence as an area").
 */
export interface BridgesEvidence {
  /** Island indices the argument counts. */
  islands: number[];
  /** Existing bridges it counts. */
  spans: BridgesSpan[];
}

/**
 * Why one firing is forced: the half of a hint `runDeductionFixpoint` is
 * *oblivious* to.
 *
 * One variant per narratable **premise**, not one per rung. Bridges has three
 * rungs and this is the count that matters, which is the measurement
 * `add-bridges-hint` exists to take. `island` is the island whose arithmetic
 * forces the move, and is the one the narration is about.
 *
 * The single rule that declares **no** reason is stage 1's "this island now has
 * all its bridges, mark it complete": a bookkeeping annotation the fork's own
 * auto-mark aid already draws, so the plan hides it
 * (docs/games/hints.md § "Show only what the board does not already say").
 */
export type BridgesReason = { ev: BridgesEvidence; island: number } & (
  | { kind: "exactSpace"; missing: number }
  | { kind: "everyNeighbor"; neighbors: number }
  | { kind: "wouldCloseLoop" }
  | { kind: "needsThisWay"; elsewhere: number }
  | { kind: "wouldSealGroup"; group: number }
  | { kind: "wouldStarve" }
  | { kind: "mustReachOut"; group: number }
);

/** One firing: the moves it forces, and the premise that forced them. */
export interface BridgesFiring {
  reason: BridgesReason | null;
  ops: BridgesOp[];
}

/** What the solver writes a firing into while a hint is being planned. */
interface BridgesRecorder {
  reason: BridgesReason | null;
  ops: BridgesOp[];
}

/**
 * Neighbors of grid vertex `v` for loop detection — mirrors C
 * `bridges_neighbour`. An island vertex reports every island it currently has a
 * bridge to; a bridge-carrying empty square reports the two cells the line runs
 * between (each edge is thus reported from both ends, as findloop requires).
 */
function bridgesNeighbors(st: BridgesState, v: number): number[] {
  const w = st.w;
  const x = v % w;
  const y = (v / w) | 0;
  const grid = st.gridAt(x, y);
  const out: number[] = [];
  const is = st.islandAt(x, y);
  if (is) {
    for (const pt of is.points) {
      const gline = pt.dx ? G_LINEH : G_LINEV;
      if (st.gridAt(pt.x, pt.y) & gline) out.push(pt.y * w + pt.x);
    }
  } else {
    const gline = grid & G_LINE;
    if (gline) {
      let x1: number;
      let y1: number;
      let x2: number;
      let y2: number;
      if (gline & G_LINEV) {
        x1 = x2 = x;
        y1 = y - 1;
        y2 = y + 1;
      } else {
        x1 = x - 1;
        x2 = x + 1;
        y1 = y2 = y;
      }
      if (st.gridAt(x1, y1) & (gline | G_ISLAND)) out.push(y1 * w + x1);
      if (st.gridAt(x2, y2) & (gline | G_ISLAND)) out.push(y2 * w + x2);
    }
  }
  return out;
}

/** C `map_hasloops`: returns true if the current bridges contain a loop. */
function mapHasloops(st: BridgesState, mark: boolean): boolean {
  const wh = st.w * st.h;
  const res = findLoops(wh, (v) => bridgesNeighbors(st, v));
  if (mark) {
    for (let y = 0; y < st.h; y++) {
      for (let x = 0; x < st.w; x++) {
        const u = y * st.w + x;
        for (const v of bridgesNeighbors(st, u)) {
          if (res.isLoopEdge(u, v)) st.grid[u] |= G_WARN;
        }
      }
    }
  }
  return res.anyLoop;
}

class Solver {
  st: BridgesState;
  dsf: Dsf;
  /**
   * Present only on the hint path. Every reason is built behind `if (rec)`,
   * which is load-bearing rather than stylistic: a reason carries its evidence,
   * and some of that evidence costs a walk of the whole island list, on the
   * generator's hot path where nothing would read it.
   */
  rec: BridgesRecorder | null = null;

  constructor(st: BridgesState) {
    this.st = st;
    this.dsf = new Dsf(st.w * st.h);
  }

  // --- recording helpers (no-ops with no recorder attached) ---------------

  /** `is`'s place in the island list — how a reason names an island. */
  private islandIndex(is: Island): number {
    return this.st.gridi[this.st.idx(is.x, is.y)];
  }

  /** The islands `is` can still reach a bridge to, as island indices. This is
   * the set `islandCountadj` counts, so a sentence quoting that count and a
   * picture ringing this list cannot disagree. */
  private adjacentIslands(is: Island): number[] {
    const st = this.st;
    const out: number[] = [];
    for (let i = 0; i < is.points.length; i++) {
      if (!is.points[i].off) continue;
      if (!st.islandIsadj(is, i)) continue;
      out.push(st.gridi[st.idx(st.islandOrthX(is, i), st.islandOrthY(is, i))]);
    }
    return out;
  }

  /** {@link adjacentIslands} without the one `direction` points at — the "other
   * neighbors" a counting argument is about. */
  private adjacentIslandsExcept(is: Island, direction: number): number[] {
    const st = this.st;
    const skip =
      st.gridi[st.idx(st.islandOrthX(is, direction), st.islandOrthY(is, direction))];
    return this.adjacentIslands(is).filter((i) => i !== skip);
  }

  /** The islands of the group `canon` roots, as island indices. */
  private groupIslands(canon: number): number[] {
    const st = this.st;
    const out: number[] = [];
    for (let i = 0; i < st.islands.length; i++) {
      const is = st.islands[i];
      if (this.dsf.canonify(st.idx(is.x, is.y)) === canon) out.push(i);
    }
    return out;
  }

  /** The bridges running between the islands of `group`, for its evidence. */
  private groupSpans(group: readonly number[]): BridgesSpan[] {
    const st = this.st;
    const out: BridgesSpan[] = [];
    const members = new Set(group);
    for (const i of group) {
      const is = st.islands[i];
      for (let d = 0; d < is.points.length; d++) {
        const pt = is.points[d];
        if (pt.dx === -1 || pt.dy === -1) continue; // span once (right/down)
        const other = st.islandFindConnection(is, d);
        if (!other) continue;
        const oi = st.gridi[st.idx(other.x, other.y)];
        if (!members.has(oi)) continue;
        out.push({ x1: is.x, y1: is.y, x2: other.x, y2: other.y });
      }
    }
    return out;
  }

  /** Record a bridge count the firing sets in `direction`. */
  private recordJoin(is: Island, direction: number, n: number): void {
    const rec = this.rec;
    if (!rec) return;
    rec.ops.push({
      op: "L",
      x1: is.x,
      y1: is.y,
      x2: this.st.islandOrthX(is, direction),
      y2: this.st.islandOrthY(is, direction),
      n,
    });
  }

  /** Record the no-line the firing draws in `direction`. */
  private recordNoline(is: Island, direction: number): void {
    const rec = this.rec;
    if (!rec) return;
    rec.ops.push({
      op: "N",
      x1: is.x,
      y1: is.y,
      x2: this.st.islandOrthX(is, direction),
      y2: this.st.islandOrthY(is, direction),
    });
  }

  // --- Grouping (C map_group / map_group_check / map_group_full) ---

  mapGroup(): void {
    const st = this.st;
    const dsf = this.dsf;
    dsf.reinit();
    for (let x = 0; x < st.w; x++) {
      for (let y = 0; y < st.h; y++) {
        st.grid[y * st.w + x] &= ~(G_SWEEP | G_WARN);
        const is = st.islandAt(x, y);
        if (!is) continue;
        const d1 = st.idx(x, y);
        for (let i = 0; i < is.points.length; i++) {
          const pt = is.points[i];
          if (pt.dx === -1 || pt.dy === -1) continue; // only right/down
          const isJoin = st.islandFindConnection(is, i);
          if (!isJoin) continue;
          // Merge every square between the two islands (a straight line).
          for (let x2 = x; x2 <= isJoin.x; x2++) {
            for (let y2 = y; y2 <= isJoin.y; y2++) {
              const d2 = st.idx(x2, y2);
              if (d1 !== d2) dsf.merge(d1, d2);
            }
          }
        }
      }
    }
  }

  /** Sweep the group with canon `canon`; returns [allfull, nislands]. */
  mapGroupCheck(canon: number, warn: boolean): [boolean, number] {
    const st = this.st;
    const dsf = this.dsf;
    let nislands = 0;
    let allfull = true;
    for (const is of st.islands) {
      if (dsf.canonify(st.idx(is.x, is.y)) !== canon) continue;
      st.grid[is.y * st.w + is.x] |= G_SWEEP;
      nislands++;
      if (st.islandCountbridges(is) !== is.count) allfull = false;
    }
    if (warn && allfull && nislands !== st.islands.length) {
      for (let x = 0; x < st.w; x++) {
        for (let y = 0; y < st.h; y++) {
          if (dsf.canonify(st.idx(x, y)) === canon) st.grid[y * st.w + x] |= G_WARN;
        }
      }
    }
    return [allfull, nislands];
  }

  /** Returns [anyfull, ngroups]. Assumes G_SWEEP already cleared (by mapGroup). */
  mapGroupFull(): [boolean, number] {
    const st = this.st;
    let ngroups = 0;
    let anyfull = false;
    for (const is of st.islands) {
      if (st.grid[is.y * st.w + is.x] & G_SWEEP) continue;
      ngroups++;
      const [full] = this.mapGroupCheck(this.dsf.canonify(st.idx(is.x, is.y)), true);
      if (full) anyfull = true;
    }
    return [anyfull, ngroups];
  }

  /** Upstream's `map_check`: whether the board is complete. As a deliberate
   * side effect it leaves `G_WARN`/`G_SWEEP` set on loop edges and on
   * prematurely satisfied groups, which is the warning overlay the renderer
   * reads. */
  mapCheck(): boolean {
    const st = this.st;
    if (!st.allowloops && mapHasloops(st, true)) return false;
    this.mapGroup(); // clears WARN and SWEEP
    const [anyfull, ngroups] = this.mapGroupFull();
    return anyfull && ngroups === 1;
  }

  // --- Join with dsf bookkeeping (C solve_join) ---

  solveJoin(is: Island, direction: number, n: number, isMax: boolean): void {
    const st = this.st;
    const isOrth = st.islandAt(
      st.islandOrthX(is, direction),
      st.islandOrthY(is, direction),
    );
    if (!isOrth) throw new Error("solveJoin: no orthogonal island");
    st.islandJoin(is, isOrth, n, isMax);
    if (n > 0 && !isMax) {
      const d1 = st.idx(is.x, is.y);
      const d2 = st.idx(isOrth.x, isOrth.y);
      if (!this.dsf.equivalent(d1, d2)) this.dsf.merge(d1, d2);
    }
  }

  // --- Stage-1 primitives (C solve_fillone / solve_fill) ---

  solveFillone(is: Island): number {
    const st = this.st;
    let nadded = 0;
    for (let i = 0; i < is.points.length; i++) {
      if (st.islandIsadj(is, i) && !st.islandHasbridge(is, i)) {
        this.solveJoin(is, i, 1, false);
        this.recordJoin(is, i, 1);
        nadded++;
      }
    }
    return nadded;
  }

  solveFill(is: Island): number {
    const st = this.st;
    let nadded = 0;
    const missing = is.count - st.islandCountbridges(is);
    if (missing < 0) return 0;
    for (let i = 0; i < is.points.length; i++) {
      const nnew = st.islandAdjspace(is, true, missing, i);
      if (nnew) {
        const pt = is.points[i];
        const ncurr = st.gridCount(pt.x, pt.y, pt.dx ? G_LINEH : G_LINEV);
        this.solveJoin(is, i, nnew + ncurr, false);
        this.recordJoin(is, i, nnew + ncurr);
        nadded += nnew;
      }
    }
    return nadded;
  }

  /** `ok` is false when this island proves the puzzle unsolvable. */
  solveIslandStage1(is: Island): { ok: boolean; didsth: boolean } {
    const st = this.st;
    const rec = this.rec;
    const bridges = st.islandCountbridges(is);
    const nspaces = st.islandCountspaces(is, true);
    const nadj = st.islandCountadj(is);
    let didsth = false;

    if (bridges > is.count) {
      return { ok: false, didsth: false }; // overpopulated
    } else if (bridges === is.count) {
      if (!(st.gridAt(is.x, is.y) & G_MARK)) {
        st.islandTogglemark(is);
        // No reason: the island's own digit against its own bridges says this,
        // and the fork's auto-mark aid grays it. The plan hides the firing and
        // never asks the player for the `M` move.
        rec?.ops.push({ op: "M", x: is.x, y: is.y });
        didsth = true;
      }
    } else if (st.gridAt(is.x, is.y) & G_MARK) {
      return { ok: false, didsth: false }; // marked but unfinished
    } else if (is.count === bridges + nspaces) {
      if (rec) {
        rec.reason = {
          kind: "exactSpace",
          island: this.islandIndex(is),
          missing: is.count - bridges,
          ev: { islands: [], spans: [] },
        };
      }
      if (this.solveFill(is) > 0) didsth = true;
      else if (rec) rec.reason = null;
    } else if (is.count > (nadj - 1) * st.maxb) {
      if (rec) {
        rec.reason = {
          kind: "everyNeighbor",
          island: this.islandIndex(is),
          neighbors: nadj,
          // The neighbors are what the sentence counts, so it says `nadj` and
          // the picture rings exactly that many.
          ev: { islands: this.adjacentIslands(is), spans: [] },
        };
      }
      if (this.solveFillone(is) > 0) didsth = true;
      else if (rec) rec.reason = null;
    }
    if (didsth) st.mapUpdatePossibles();
    return { ok: true, didsth };
  }

  // --- Stage-2 (C solve_island_checkloop / solve_island_stage2) ---

  /** True if a new line in `direction` would close a loop (loops disallowed). */
  solveIslandCheckloop(is: Island, direction: number): boolean {
    const st = this.st;
    if (st.allowloops) return false;
    if (st.islandHasbridge(is, direction)) return false;
    if (st.islandIsadj(is, direction) === 0) return false;
    const isOrth = st.islandAt(
      st.islandOrthX(is, direction),
      st.islandOrthY(is, direction),
    );
    if (!isOrth) return false;
    return this.dsf.equivalent(st.idx(is.x, is.y), st.idx(isOrth.x, isOrth.y));
  }

  /**
   * Two separate teachable rules in one rung — a bridge that would close a loop
   * and a direction the island's count cannot do without — so on the recording
   * path each returns as soon as it fires
   * (docs/games/hints.md § "A rung is not a premise, so return per premise").
   */
  solveIslandStage2(is: Island): { ok: boolean; didsth: boolean } {
    const st = this.st;
    const rec = this.rec;
    let navail = 0;
    let added = false;
    let removed = false;

    for (let i = 0; i < is.points.length; i++) {
      if (this.solveIslandCheckloop(is, i)) {
        if (rec) {
          // The group is the premise, and joining is about to enlarge it, so
          // it is read here rather than after.
          const group = this.groupIslands(this.dsf.canonify(st.idx(is.x, is.y)));
          rec.reason = {
            kind: "wouldCloseLoop",
            island: this.islandIndex(is),
            ev: { islands: group, spans: this.groupSpans(group) },
          };
        }
        this.solveJoin(is, i, -1, false);
        this.recordNoline(is, i);
        st.mapUpdatePossibles();
        removed = true;
        if (rec) return { ok: true, didsth: true };
      } else {
        navail += st.islandIsadj(is, i);
      }
    }

    for (let i = 0; i < is.points.length; i++) {
      if (!st.islandHasbridge(is, i)) {
        const nadj = st.islandIsadj(is, i);
        if (nadj > 0 && navail - nadj < is.count) {
          if (rec) {
            rec.reason = {
              kind: "needsThisWay",
              island: this.islandIndex(is),
              elsewhere: navail - nadj,
              ev: { islands: this.adjacentIslandsExcept(is, i), spans: [] },
            };
          }
          this.solveJoin(is, i, 1, false);
          this.recordJoin(is, i, 1);
          added = true;
          if (rec) {
            st.mapUpdatePossibles();
            return { ok: true, didsth: true };
          }
        }
      }
    }
    if (added) st.mapUpdatePossibles();
    return { ok: true, didsth: added || removed };
  }

  // --- Stage-3 (C solve_island_subgroup / _impossible / _stage3) ---

  /** True if the (full) island's group is a finished subgraph that isn't the whole set. */
  solveIslandSubgroup(is: Island, direction: number): boolean {
    const st = this.st;
    if (st.islandCountbridges(is) < is.count) return false;
    if (direction >= 0) {
      const isJoin = st.islandAt(
        st.islandOrthX(is, direction),
        st.islandOrthY(is, direction),
      );
      if (!isJoin) throw new Error("solveIslandSubgroup: no join island");
      if (st.islandCountbridges(isJoin) < isJoin.count) return false;
    }
    const [full, nislands] = this.mapGroupCheck(
      this.dsf.canonify(st.idx(is.x, is.y)),
      false,
    );
    return full && nislands < st.islands.length;
  }

  /** The first island the current board leaves unsatisfiable, or -1. The index
   * rather than a boolean, so a firing forced by one can ring it. */
  firstImpossibleIsland(): number {
    for (let i = 0; i < this.st.islands.length; i++) {
      if (this.st.islandImpossible(this.st.islands[i], false)) return i;
    }
    return -1;
  }

  solveIslandImpossible(): boolean {
    return this.firstImpossibleIsland() >= 0;
  }

  /**
   * Two rules again, and both are **Checks** rather than Searches
   * ([`solver-and-generator.md`](../../../docs/games/solver-and-generator.md)
   * § "Check, Tactic, Search"): each places bridges, asks two validators that
   * run no fixpoint and no sub-solve, and rolls back. So both narrate directly
   * at Tricky, and the per-premise early return applies here as it does above.
   */
  solveIslandStage3(is: Island): { ok: boolean; didsth: boolean } {
    const st = this.st;
    const rec = this.rec;
    let didsth = false;
    const missing = is.count - st.islandCountbridges(is);
    if (missing <= 0) return { ok: true, didsth: false };

    // Pass 1: each direction, cap or forbid bridges that would isolate a subgraph.
    for (let i = 0; i < is.points.length; i++) {
      const pt = is.points[i];
      const spc = st.islandAdjspace(is, true, missing, i);
      if (spc === 0) continue;
      const curr = st.gridCount(pt.x, pt.y, pt.dx ? G_LINEH : G_LINEV);

      let maxb = -1;
      // Which of the two validators refused, read while the trial still
      // stands: rolling it back destroys both answers, and naming the wrong
      // one is docs/games/hints.md § "The premise must single out the
      // conclusion".
      let sealed: number[] | null = null;
      let starved = -1;
      const saved = this.dsf.clone(); // C: dsf_copy(tmpdsf, dsf)
      for (let n = curr + 1; n <= curr + spc; n++) {
        this.solveJoin(is, i, n, false);
        st.mapUpdatePossibles();
        const subgroup = this.solveIslandSubgroup(is, i);
        if (subgroup || this.solveIslandImpossible()) {
          maxb = n - 1;
          if (rec && maxb === 0) {
            if (subgroup) {
              sealed = this.groupIslands(this.dsf.canonify(st.idx(is.x, is.y)));
            } else {
              starved = this.firstImpossibleIsland();
            }
          }
          break;
        }
      }
      this.solveJoin(is, i, curr, false); // put grid back
      this.dsf = saved; // C: dsf_copy(dsf, tmpdsf)

      if (maxb !== -1) {
        if (maxb === 0) {
          if (rec) {
            rec.reason = sealed
              ? {
                  kind: "wouldSealGroup",
                  island: this.islandIndex(is),
                  group: sealed.length,
                  ev: { islands: sealed, spans: this.groupSpans(sealed) },
                }
              : {
                  kind: "wouldStarve",
                  island: this.islandIndex(is),
                  ev: { islands: starved >= 0 ? [starved] : [], spans: [] },
                };
          }
          this.solveJoin(is, i, -1, false); // NOLINE
          this.recordNoline(is, i);
        } else {
          // A per-direction maximum. Upstream gives the player no way to write
          // one down, so it is real progress with no move to offer: it changes
          // the working board, declares no reason, and emits no op.
          this.solveJoin(is, i, maxb, true);
        }
        didsth = true;
      }
      st.mapUpdatePossibles();
      if (rec && didsth) return { ok: true, didsth };
    }

    // Pass 2: a currently-empty direction that must carry >=1 bridge to avoid
    // isolating a subgraph reached by connecting maximally to all *other*
    // neighbors at once (the multi-target case pass 1 can't see).
    for (let i = 0; i < is.points.length; i++) {
      if (st.islandAdjspace(is, true, missing, i) === 0) continue;
      const before = is.points.map((pt) =>
        st.gridCount(pt.x, pt.y, pt.dx ? G_LINEH : G_LINEV),
      );
      if (before[i] !== 0) continue;

      const saved = this.dsf.clone();
      for (let j = 0; j < is.points.length; j++) {
        if (j === i) continue;
        const spc = st.islandAdjspace(is, true, missing, j);
        if (spc) this.solveJoin(is, j, before[j] + spc, false);
      }
      st.mapUpdatePossibles();
      const got = this.solveIslandSubgroup(is, -1);
      // Membership while the trial stands; the *bridges* after it is rolled
      // back, so the picture outlines only spans the player can actually see.
      const sealed =
        rec && got ? this.groupIslands(this.dsf.canonify(st.idx(is.x, is.y))) : null;
      for (let j = 0; j < is.points.length; j++) {
        this.solveJoin(is, j, before[j], false);
      }
      this.dsf = saved;

      if (got) {
        if (rec && sealed) {
          rec.reason = {
            kind: "mustReachOut",
            island: this.islandIndex(is),
            group: sealed.length,
            ev: { islands: sealed, spans: this.groupSpans(sealed) },
          };
        }
        this.solveJoin(is, i, 1, false);
        this.recordJoin(is, i, 1);
        didsth = true;
      }
      st.mapUpdatePossibles();
      if (rec && didsth) return { ok: true, didsth };
    }

    return { ok: true, didsth };
  }

  // --- Driver (C solve_sub) ---

  /**
   * The three stages as ladder rungs.
   *
   * **A "rung" here sweeps every island before reporting**, which is the
   * runner's contract at the *ladder* level rather than a violation of it: the
   * runner restarts the ladder the moment a rung reports progress, and a rung is
   * free to do as much work as it likes before it does. The distinction that
   * would matter — a pass that must sweep the whole ladder before restarting —
   * is Lightup's, and it is why Lightup stays out.
   *
   * `!ok` is a contradiction, which is the runner's `< 0`; `solveSub` reports it
   * as 0.
   *
   * **On the recording path a sweep stops at the first island that moved**, so
   * that one firing is one hint step. A stage that reports after sweeping
   * sixty-seven islands is the right unit for a *grade* and the wrong one for a
   * *sentence* (docs/games/hints.md § "A rung is not a premise, so return per
   * premise"); the generator keeps the accumulate-across-the-whole-list pass it
   * always had, which `bridges-differential.test.ts` proves.
   */
  ladder(): DeductionTechnique[] {
    const st = this.st;
    const sweep = (
      run: (is: Island) => { ok: boolean; didsth: boolean },
      skip?: (is: Island) => boolean,
    ): number => {
      let didsth = false;
      for (const is of st.islands) {
        if (skip?.(is)) continue;
        const r = run(is);
        if (!r.ok) return -1;
        if (r.didsth) {
          didsth = true;
          if (this.rec) return 1;
        }
      }
      return didsth ? 1 : 0;
    };
    return [
      {
        id: "stage1-arithmetic",
        tier: 0,
        run: () => sweep((is) => this.solveIslandStage1(is)),
      },
      {
        id: "stage2-counting",
        tier: 1,
        // CONTINUE_IF_FULL: a marked-complete island is skipped, as upstream.
        run: () =>
          sweep(
            (is) => this.solveIslandStage2(is),
            (is) => (st.gridAt(is.x, is.y) & G_MARK) !== 0,
          ),
      },
      {
        id: "stage3-connectivity",
        tier: 2,
        run: () => sweep((is) => this.solveIslandStage3(is)),
      },
    ];
  }

  solveSub(difficulty: number, firings?: FiringTally): number {
    const { impossible } = runDeductionFixpoint({
      techniques: this.ladder(),
      firings,
      // The ladder is tier-sorted, so a `maxTier` cap agrees with the stage
      // gates of `solveSubLegacy`.
      maxTier: difficulty,
    });
    if (impossible) return 0;
    return this.mapCheck() ? 1 : 0;
  }

  /** The hand-written stage loop, kept as the oracle `bridges-ladder.test.ts`
   * proves the runner against. */
  solveSubLegacy(difficulty: number): number {
    const st = this.st;
    while (true) {
      let didsth = false;

      for (const is of st.islands) {
        const r = this.solveIslandStage1(is);
        if (!r.ok) return 0;
        if (r.didsth) didsth = true;
      }
      if (didsth) continue;
      else if (difficulty < 1) break;

      for (const is of st.islands) {
        if (st.gridAt(is.x, is.y) & G_MARK) continue; // CONTINUE_IF_FULL
        const r = this.solveIslandStage2(is);
        if (!r.ok) return 0;
        if (r.didsth) didsth = true;
      }
      if (didsth) continue;
      else if (difficulty < 2) break;

      for (const is of st.islands) {
        const r = this.solveIslandStage3(is);
        if (!r.ok) return 0;
        if (r.didsth) didsth = true;
      }
      if (!didsth) break;
    }
    return this.mapCheck() ? 1 : 0;
  }
}

/**
 * Solve `state` in place from the clue-only position at `difficulty` (0/1/2).
 * Clears all bridges first (C `solve_from_scratch` → `map_clear`), so the passed
 * state must be a working copy the caller is happy to have overwritten.
 * Returns 1 if fully solved, 0 otherwise.
 */
export function solveFromScratch(
  state: BridgesState,
  difficulty: number,
  firings?: FiringTally,
): number {
  state.mapClear();
  const solver = new Solver(state);
  solver.mapGroup();
  state.mapUpdatePossibles();
  return solver.solveSub(difficulty, firings);
}

/** {@link solveFromScratch} through the hand-written loop — the oracle
 * `bridges-ladder.test.ts` proves the runner against. */
export function solveFromScratchLegacy(
  state: BridgesState,
  difficulty: number,
): number {
  state.mapClear();
  const solver = new Solver(state);
  solver.mapGroup();
  state.mapUpdatePossibles();
  return solver.solveSubLegacy(difficulty);
}

/**
 * What a hint asks the deduction for: the next firing from the board in front
 * of it, whether that board is finished, and whether it has been proved
 * inconsistent.
 */
export interface BridgesRecordingPass {
  /** The next single firing, or `null` when deduction is exhausted. */
  next(): BridgesFiring | null;
  /** Upstream `map_check` over the working board. */
  solved(): boolean;
  /** A rung proved the board inconsistent. */
  impossible(): boolean;
}

/**
 * The recording projection: the *same three* `DeductionTechnique` objects
 * `solveFromScratch` runs, through one `runDeductionFixpoint` call, with a
 * recorder attached — no rung is reimplemented for the hint.
 *
 * Two hooks the runner already had do the whole single-firing job, exactly as
 * they do in Tracks: `settled` is documented as broader than "solved", so
 * *stop, this pass has a firing to narrate* is a legitimate reason to stop; and
 * `beforeTechnique` clears the standing reason, which is what makes "a rule
 * that declares no reason narrates nothing" a checked property rather than a
 * hope.
 *
 * `st` must be a working copy the caller is happy to have overwritten, and —
 * unlike {@link solveFromScratch} — it is **not** cleared: the deduction
 * resumes from the bridges the player has drawn.
 */
export function bridgesRecordingPass(
  st: BridgesState,
  cap: number,
  budget: StepBudget,
): BridgesRecordingPass {
  const solver = new Solver(st);
  solver.mapGroup();
  st.mapUpdatePossibles();
  // Seed the marks a from-scratch solve would already be holding at these
  // bridges. Stage 1 derives them itself, but only when its sweep reaches the
  // island — from empty that is always before any bridge lands on it, and on a
  // board the player has half-built it need not be. Marking first is what makes
  // a resumed position the same kind of position the ladder was certified on.
  for (const is of st.islands) {
    if (st.islandCountbridges(is) === is.count && !(st.gridAt(is.x, is.y) & G_MARK)) {
      st.islandTogglemark(is);
    }
  }
  const rec: BridgesRecorder = { reason: null, ops: [] };
  solver.rec = rec;
  const ladder = solver.ladder();
  let impossible = false;

  return {
    next(): BridgesFiring | null {
      rec.ops = [];
      rec.reason = null;
      const result = runDeductionFixpoint({
        techniques: ladder,
        maxTier: cap,
        budget,
        beforeTechnique: () => {
          rec.reason = null;
        },
        // A max-cap changes the board and offers the player nothing, so the
        // ladder keeps going until it has a move to show.
        settled: () => rec.ops.length > 0,
      });
      if (result.impossible) impossible = true;
      if (impossible || rec.ops.length === 0) return null;
      return { reason: rec.reason, ops: rec.ops };
    },
    solved: () => solver.mapCheck(),
    impossible: () => impossible,
  };
}

/**
 * Run C `map_check` on `state` in place: true iff the board is complete (one
 * connected group, every island satisfied, no illegal loop). Like C, it leaves
 * the `G_WARN`/`G_SWEEP` flags set (loop edges, or a prematurely-satisfied
 * subgroup), which is how `executeMove`'s result carries the warning overlay
 * the renderer reads.
 */
export function runMapCheck(state: BridgesState): boolean {
  return new Solver(state).mapCheck();
}
