/**
 * Bridges solver — faithful port of the multi-stage deductive solver in
 * `puzzles/bridges.c` (`solve_sub` and friends). Byte-match fidelity of the
 * generator's difficulty grading depends on this reproducing C's verdict
 * exactly, so the deductions are transcribed rule-for-rule.
 *
 * Structure:
 *  - Stage 1 (Easy): whole-island arithmetic — fill when forced, mark full.
 *  - Stage 2 (Medium): per-connection reasoning — a direction that must carry a
 *    bridge, and loop-avoidance when `allowloops` is off.
 *  - Stage 3 (Hard): group reasoning over a dsf — speculatively cap/force a
 *    direction to avoid an isolated finished subgraph or an impossibility.
 *
 * `solve_sub`'s `difficulty` is a monotone stage gate (0/1/2 = stage 1 / +2 /
 * +3), not a recursion depth; there is no guessing search. The dsf's canonical
 * root is never observed (only same-group and group-count queries), so the
 * shared union-by-size `Dsf` is safe here without root-identity discipline.
 */
import { Dsf } from "../../engine/dsf.ts";
import { findLoops } from "../../engine/findloop.ts";
import {
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

/** Vertex index used by the dsf and findloop — matches C `DINDEX`/`y*w+x`. */
function dindex(st: BridgesState, x: number, y: number): number {
  return y * st.w + x;
}

/**
 * Neighbours of grid vertex `v` for loop detection — mirrors C
 * `bridges_neighbour`. An island vertex reports every island it currently has a
 * bridge to; a bridge-carrying empty square reports the two cells the line runs
 * between (each edge is thus reported from both ends, as findloop requires).
 */
function bridgesNeighbours(st: BridgesState, v: number): number[] {
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
  const res = findLoops(wh, (v) => bridgesNeighbours(st, v));
  if (mark) {
    for (let y = 0; y < st.h; y++) {
      for (let x = 0; x < st.w; x++) {
        const u = y * st.w + x;
        for (const v of bridgesNeighbours(st, u)) {
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

  constructor(st: BridgesState) {
    this.st = st;
    this.dsf = new Dsf(st.w * st.h);
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
        const d1 = dindex(st, x, y);
        for (let i = 0; i < is.points.length; i++) {
          const pt = is.points[i];
          if (pt.dx === -1 || pt.dy === -1) continue; // only right/down
          const isJoin = st.islandFindConnection(is, i);
          if (!isJoin) continue;
          // Merge every square between the two islands (a straight line).
          for (let x2 = x; x2 <= isJoin.x; x2++) {
            for (let y2 = y; y2 <= isJoin.y; y2++) {
              const d2 = dindex(st, x2, y2);
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
      if (dsf.canonify(dindex(st, is.x, is.y)) !== canon) continue;
      st.grid[is.y * st.w + is.x] |= G_SWEEP;
      nislands++;
      if (st.islandCountbridges(is) !== is.count) allfull = false;
    }
    if (warn && allfull && nislands !== st.islands.length) {
      for (let x = 0; x < st.w; x++) {
        for (let y = 0; y < st.h; y++) {
          if (dsf.canonify(dindex(st, x, y)) === canon) st.grid[y * st.w + x] |= G_WARN;
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
      const [full] = this.mapGroupCheck(
        this.dsf.canonify(dindex(st, is.x, is.y)),
        true,
      );
      if (full) anyfull = true;
    }
    return [anyfull, ngroups];
  }

  mapCheck(): boolean {
    const st = this.st;
    if (!st.allowloops) {
      if (mapHasloops(st, true)) return false;
    }
    this.mapGroup(); // clears WARN and SWEEP
    const [anyfull, ngroups] = this.mapGroupFull();
    if (anyfull && ngroups === 1) return true;
    return false;
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
      const d1 = dindex(st, is.x, is.y);
      const d2 = dindex(st, isOrth.x, isOrth.y);
      if (!this.dsf.equivalent(d1, d2)) this.dsf.merge(d1, d2);
    }
  }

  // --- Stage-1 primitives (C solve_fillone / solve_fill) ---

  solveFillone(is: Island): number {
    const st = this.st;
    let nadded = 0;
    for (let i = 0; i < is.points.length; i++) {
      if (st.islandIsadj(is, i)) {
        if (st.islandHasbridge(is, i)) {
          // already attached; do nothing.
        } else {
          this.solveJoin(is, i, 1, false);
          nadded++;
        }
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
        nadded += nnew;
      }
    }
    return nadded;
  }

  /** Returns false if the puzzle is provably unsolvable from here. */
  solveIslandStage1(is: Island): { ok: boolean; didsth: boolean } {
    const st = this.st;
    const bridges = st.islandCountbridges(is);
    const nspaces = st.islandCountspaces(is, true);
    const nadj = st.islandCountadj(is);
    let didsth = false;

    if (bridges > is.count) {
      return { ok: false, didsth: false }; // overpopulated
    } else if (bridges === is.count) {
      if (!(st.gridAt(is.x, is.y) & G_MARK)) {
        st.islandTogglemark(is);
        didsth = true;
      }
    } else if (st.gridAt(is.x, is.y) & G_MARK) {
      return { ok: false, didsth: false }; // marked but unfinished
    } else {
      if (is.count === bridges + nspaces) {
        if (this.solveFill(is) > 0) didsth = true;
      } else if (is.count > (nadj - 1) * st.maxb) {
        if (this.solveFillone(is) > 0) didsth = true;
      }
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
    const d1 = dindex(st, is.x, is.y);
    const d2 = dindex(st, isOrth.x, isOrth.y);
    return this.dsf.equivalent(d1, d2);
  }

  solveIslandStage2(is: Island): { ok: boolean; didsth: boolean } {
    const st = this.st;
    let navail = 0;
    let added = false;
    let removed = false;

    for (let i = 0; i < is.points.length; i++) {
      if (this.solveIslandCheckloop(is, i)) {
        this.solveJoin(is, i, -1, false);
        st.mapUpdatePossibles();
        removed = true;
      } else {
        navail += st.islandIsadj(is, i);
      }
    }

    for (let i = 0; i < is.points.length; i++) {
      if (!st.islandHasbridge(is, i)) {
        const nadj = st.islandIsadj(is, i);
        if (nadj > 0 && navail - nadj < is.count) {
          this.solveJoin(is, i, 1, false);
          added = true;
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
      this.dsf.canonify(dindex(st, is.x, is.y)),
      false,
    );
    if (full && nislands < st.islands.length) return true;
    return false;
  }

  solveIslandImpossible(): boolean {
    for (const is of this.st.islands) {
      if (this.st.islandImpossible(is, false)) return true;
    }
    return false;
  }

  solveIslandStage3(is: Island): { ok: boolean; didsth: boolean } {
    const st = this.st;
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
      const saved = this.dsf.clone(); // C: dsf_copy(tmpdsf, dsf)
      for (let n = curr + 1; n <= curr + spc; n++) {
        this.solveJoin(is, i, n, false);
        st.mapUpdatePossibles();
        if (this.solveIslandSubgroup(is, i) || this.solveIslandImpossible()) {
          maxb = n - 1;
          break;
        }
      }
      this.solveJoin(is, i, curr, false); // put grid back
      this.dsf = saved; // C: dsf_copy(dsf, tmpdsf)

      if (maxb !== -1) {
        if (maxb === 0)
          this.solveJoin(is, i, -1, false); // NOLINE
        else this.solveJoin(is, i, maxb, true); // set maximum
        didsth = true;
      }
      st.mapUpdatePossibles();
    }

    // Pass 2: a currently-empty direction that must carry >=1 bridge to avoid
    // isolating a subgraph reached by connecting maximally to all *other*
    // neighbours at once (the multi-target case pass 1 can't see).
    for (let i = 0; i < is.points.length; i++) {
      let got = false;
      const before: number[] = [];

      let spc = st.islandAdjspace(is, true, missing, i);
      if (spc === 0) continue;

      for (let j = 0; j < is.points.length; j++) {
        const pt = is.points[j];
        before[j] = st.gridCount(pt.x, pt.y, pt.dx ? G_LINEH : G_LINEV);
      }
      if (before[i] !== 0) continue;

      const saved = this.dsf.clone();
      for (let j = 0; j < is.points.length; j++) {
        spc = st.islandAdjspace(is, true, missing, j);
        if (spc === 0) continue;
        if (j === i) continue;
        this.solveJoin(is, j, before[j] + spc, false);
      }
      st.mapUpdatePossibles();

      if (this.solveIslandSubgroup(is, -1)) got = true;

      for (let j = 0; j < is.points.length; j++)
        this.solveJoin(is, j, before[j], false);
      this.dsf = saved;

      if (got) {
        this.solveJoin(is, i, 1, false);
        didsth = true;
      }
      st.mapUpdatePossibles();
    }

    if (didsth) return { ok: true, didsth: true };
    return { ok: true, didsth: false };
  }

  // --- Driver (C solve_sub) ---

  solveSub(difficulty: number): number {
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
      if (didsth) continue;
      else if (difficulty < 3) break;

      break;
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
export function solveFromScratch(state: BridgesState, difficulty: number): number {
  state.mapClear();
  const solver = new Solver(state);
  solver.mapGroup();
  state.mapUpdatePossibles();
  return solver.solveSub(difficulty);
}

/**
 * Run C `map_check` on `state` in place: detect completion (one connected
 * group, all islands satisfied, no illegal loop) and — as a deliberate side
 * effect matching C — leave `G_WARN`/`G_SWEEP` display flags set on the grid
 * (loop edges, or a prematurely-satisfied subgroup). `executeMove` calls this
 * so the returned state carries both the completion verdict and the warning
 * overlay the renderer reads. Returns true iff the board is completed.
 */
export function runMapCheck(state: BridgesState): boolean {
  return new Solver(state).mapCheck();
}

/**
 * Solve `state` in place from its *current* bridges (C `solve_for_hint`: no
 * map_clear, and — like C — no `map_update_possibles`; it trusts the caller to
 * have kept possibles current through play) at unlimited difficulty. Used by
 * the 'h' single-step hint. Returns 1 if fully solved, 0 otherwise.
 */
export function solveForHint(state: BridgesState): number {
  const solver = new Solver(state);
  solver.mapGroup();
  return solver.solveSub(10);
}
