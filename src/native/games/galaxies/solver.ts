/**
 * Galaxies solver — difficulty-graded deduction chain plus bounded
 * recursion for `Unreasonable`. Idiomatic TS port of `solver_state`
 * and friends in galaxies.c.
 */
import { Dsf } from "./dsf.ts";
import {
  addAssoc,
  adjacencies,
  checkComplete,
  F_DOT,
  F_DOT_BLACK,
  F_EDGE_SET,
  F_TILE_ASSOC,
  type GalaxiesState,
  idx,
  inGrid,
  SpaceType,
  spaceOppositeDot,
  spaceTypeAt,
  tileOpposite,
  tilesFromEdge,
} from "./state.ts";

export enum GalaxiesDiff {
  /** Solvable with only the basic deduction chain. */
  Normal = 0,
  /** Required bounded recursion to solve uniquely. */
  Unreasonable = 1,
  /** No consistent solution exists. */
  Impossible = 2,
  /** More than one solution exists. */
  Ambiguous = 3,
  /** Solver gave up — exceeded recursion limit. */
  Unfinished = 4,
}

const MAX_RECURSE = 5;
const IMPOSSIBLE = -1;
const NOTHING = 0;
const PROGRESS = 1;

// Solver-internal scratch flags, kept in a side-buffer rather than
// the public state's `flags` (we don't want the solver to leak
// transient bits into a saved game).
const M_MARK = 1;
const M_REACHABLE = 2;
const M_MULTIPLE = 4;

/** Try to add `tile ↔ dot` association; also mark the opposite tile.
 * Returns IMPOSSIBLE / NOTHING / PROGRESS. Mirrors `solver_add_assoc`. */
function solverAddAssoc(
  s: GalaxiesState,
  tx: number,
  ty: number,
  dx: number,
  dy: number,
): number {
  const ti = idx(s, tx, ty);
  if (s.flags[ti] & F_TILE_ASSOC) {
    if (s.dotx[ti] !== dx || s.doty[ti] !== dy) return IMPOSSIBLE;
    return NOTHING;
  }
  const opp = spaceOppositeDot(s, tx, ty, dx, dy);
  if (!opp) return IMPOSSIBLE;
  const oi = idx(s, opp.x, opp.y);
  if (s.flags[oi] & F_TILE_ASSOC) {
    if (s.dotx[oi] !== dx || s.doty[oi] !== dy) return IMPOSSIBLE;
  }
  addAssoc(s, tx, ty, dx, dy);
  addAssoc(s, opp.x, opp.y, dx, dy);
  return PROGRESS;
}

/** Tiles directly orthogonally adjacent to a dot are associated with
 * it. Mirrors `solver_obvious_dot`. */
function solverObviousDot(s: GalaxiesState, dx: number, dy: number): number {
  let didsth = NOTHING;
  for (let ddy = -1; ddy <= 1; ddy++) {
    for (let ddx = -1; ddx <= 1; ddx++) {
      const tx = dx + ddx;
      const ty = dy + ddy;
      if (!inGrid(s, tx, ty)) continue;
      if (spaceTypeAt(tx, ty) !== SpaceType.Tile) continue;
      const r = solverAddAssoc(s, tx, ty, dx, dy);
      if (r === IMPOSSIBLE) return IMPOSSIBLE;
      if (r === PROGRESS) didsth = PROGRESS;
    }
  }
  return didsth;
}

export function solverObvious(s: GalaxiesState): number {
  let didsth = NOTHING;
  for (const dot of s.dots) {
    const r = solverObviousDot(s, dot.x, dot.y);
    if (r === IMPOSSIBLE) return IMPOSSIBLE;
    if (r === PROGRESS) didsth = PROGRESS;
  }
  return didsth;
}

/** For each set edge, also set its 180°-opposite edge through the
 * associated tiles' dot. Mirrors `solver_lines_opposite_cb` run
 * across every edge. */
function solverLinesOpposite(s: GalaxiesState): number {
  let didsth = NOTHING;
  for (let y = 0; y < s.sy; y++) {
    for (let x = 0; x < s.sx; x++) {
      if (spaceTypeAt(x, y) !== SpaceType.Edge) continue;
      const ei = idx(s, x, y);
      const tiles = tilesFromEdge(s, x, y);

      // If both tile-neighbours are associated with different dots,
      // there must be an edge between them.
      if (
        !(s.flags[ei] & F_EDGE_SET) &&
        tiles[0] &&
        tiles[1] &&
        s.flags[idx(s, tiles[0].x, tiles[0].y)] & F_TILE_ASSOC &&
        s.flags[idx(s, tiles[1].x, tiles[1].y)] & F_TILE_ASSOC
      ) {
        const i0 = idx(s, tiles[0].x, tiles[0].y);
        const i1 = idx(s, tiles[1].x, tiles[1].y);
        if (s.dotx[i0] !== s.dotx[i1] || s.doty[i0] !== s.doty[i1]) {
          s.flags[ei] |= F_EDGE_SET;
          didsth = PROGRESS;
        }
      }

      if (!(s.flags[ei] & F_EDGE_SET)) continue;

      // Mirror set edges across each adjacent associated tile's dot.
      for (let n = 0; n < 2; n++) {
        const t = tiles[n];
        if (!t) continue;
        const ti = idx(s, t.x, t.y);
        if (!(s.flags[ti] & F_TILE_ASSOC)) continue;
        const opp = tileOpposite(s, t.x, t.y);
        if (!opp) return IMPOSSIBLE;
        const ddx = t.x - x;
        const ddy = t.y - y;
        const ox = opp.x + ddx;
        const oy = opp.y + ddy;
        if (!inGrid(s, ox, oy)) return IMPOSSIBLE;
        const oei = idx(s, ox, oy);
        if (!(s.flags[oei] & F_EDGE_SET)) {
          s.flags[oei] |= F_EDGE_SET;
          didsth = PROGRESS;
        }
      }
    }
  }
  return didsth;
}

/** Each empty tile whose four adjacent edges are either set or
 * neighbour-an-already-associated-tile-of-the-same-dot must itself
 * be associated with that single dot. Mirrors
 * `solver_spaces_oneposs_cb` run across every tile. */
function solverSpacesOneposs(s: GalaxiesState): number {
  let didsth = NOTHING;
  for (let y = 1; y < s.sy - 1; y += 2) {
    for (let x = 1; x < s.sx - 1; x += 2) {
      const ti = idx(s, x, y);
      if (s.flags[ti] & F_TILE_ASSOC) continue;
      const { edges, tiles } = adjacencies(s, x, y);
      let eset = 0;
      let dx = -1;
      let dy = -1;
      let abort = false;
      for (let n = 0; n < 4 && !abort; n++) {
        const e = edges[n];
        if (!e) continue;
        const ei = idx(s, e.x, e.y);
        if (s.flags[ei] & F_EDGE_SET) {
          eset++;
        } else {
          const t = tiles[n];
          if (!t) continue;
          const ai = idx(s, t.x, t.y);
          if (!(s.flags[ai] & F_TILE_ASSOC)) {
            abort = true;
            continue;
          }
          if (dx !== -1 && (s.dotx[ai] !== dx || s.doty[ai] !== dy)) {
            abort = true;
            continue;
          }
          dx = s.dotx[ai];
          dy = s.doty[ai];
        }
      }
      if (abort) continue;
      if (eset === 4) return IMPOSSIBLE;
      if (dx === -1) continue;
      const r = solverAddAssoc(s, x, y, dx, dy);
      if (r === IMPOSSIBLE) return IMPOSSIBLE;
      if (r === PROGRESS) didsth = PROGRESS;
    }
  }
  return didsth;
}

interface ExpandCtx {
  mark: Uint8Array;
  scratch: Int32Array; // pairs of (x, y) flat: each entry is encoded x + y * sx
  reach: Uint8Array;
  reachDotX: Int16Array;
  reachDotY: Int16Array;
}

/** Returns true iff `tile` is either unassociated or already
 * associated with `dot`. */
function expandCheckdot(
  s: GalaxiesState,
  tx: number,
  ty: number,
  dx: number,
  dy: number,
): boolean {
  const i = idx(s, tx, ty);
  if (!(s.flags[i] & F_TILE_ASSOC)) return true;
  return s.dotx[i] === dx && s.doty[i] === dy;
}

function solverExpandFromdot(
  s: GalaxiesState,
  dx: number,
  dy: number,
  ctx: ExpandCtx,
): void {
  // Reset M_MARK across tiles only.
  for (let y = 1; y < s.sy - 1; y += 2) {
    for (let x = 1; x < s.sx - 1; x += 2) {
      ctx.mark[idx(s, x, y)] &= ~M_MARK;
    }
  }

  // Seed with two tiles known to be associated with this dot.
  const t = spaceTypeAt(dx, dy);
  let s0x: number;
  let s0y: number;
  let s1x: number;
  let s1y: number;
  if (t === SpaceType.Tile) {
    s0x = s1x = dx;
    s0y = s1y = dy;
  } else if (t === SpaceType.Edge) {
    const ts = tilesFromEdge(s, dx, dy);
    if (!ts[0] || !ts[1]) return; // shouldn't happen for an interior dot
    s0x = ts[0].x;
    s0y = ts[0].y;
    s1x = ts[1].x;
    s1y = ts[1].y;
  } else {
    s0x = dx - 1;
    s0y = dy - 1;
    s1x = dx + 1;
    s1y = dy + 1;
  }
  const scratch = ctx.scratch;
  scratch[0] = s0y * s.sx + s0x;
  scratch[1] = s1y * s.sx + s1x;
  ctx.mark[scratch[0]] |= M_MARK;
  ctx.mark[scratch[1]] |= M_MARK;

  let start = 0;
  let end = 2;
  let next = 2;
  while (true) {
    for (let i = start; i < end; i += 2) {
      const enc = scratch[i];
      const tx = enc % s.sx;
      const ty = (enc / s.sx) | 0;
      const { edges, tiles } = adjacencies(s, tx, ty);
      for (let j = 0; j < 4; j++) {
        const e = edges[j];
        if (!e) continue;
        const ei = idx(s, e.x, e.y);
        if (s.flags[ei] & F_EDGE_SET) continue;
        const tj = tiles[j];
        if (!tj) continue;
        const tji = idx(s, tj.x, tj.y);
        if (ctx.mark[tji] & M_MARK) continue;

        const opp = spaceOppositeDot(s, tj.x, tj.y, dx, dy);
        if (!opp) {
          ctx.mark[tji] |= M_MARK;
          continue;
        }
        const oi = idx(s, opp.x, opp.y);
        // C asserts neither tile is M_MARKed (both seen or neither).
        if (
          expandCheckdot(s, tj.x, tj.y, dx, dy) &&
          expandCheckdot(s, opp.x, opp.y, dx, dy)
        ) {
          scratch[next++] = tji;
          scratch[next++] = oi;
        }
        ctx.mark[tji] |= M_MARK;
        ctx.mark[oi] |= M_MARK;
      }
    }
    if (next === end) break;
    start = end;
    end = next;
  }

  // For every newly-reached empty tile, update reachability.
  for (let i = 0; i < end; i++) {
    const enc = scratch[i];
    if (s.flags[enc] & F_TILE_ASSOC) continue;
    if (ctx.reach[enc] & M_REACHABLE) {
      ctx.reach[enc] |= M_MULTIPLE;
    } else {
      ctx.reach[enc] |= M_REACHABLE;
      ctx.reachDotX[enc] = dx;
      ctx.reachDotY[enc] = dy;
    }
  }
}

function solverExpandDots(s: GalaxiesState): number {
  const sz = s.sx * s.sy;
  const ctx: ExpandCtx = {
    mark: new Uint8Array(sz),
    scratch: new Int32Array(sz),
    reach: new Uint8Array(sz),
    reachDotX: new Int16Array(sz),
    reachDotY: new Int16Array(sz),
  };
  for (const dot of s.dots) solverExpandFromdot(s, dot.x, dot.y, ctx);

  let didsth = NOTHING;
  for (let y = 1; y < s.sy - 1; y += 2) {
    for (let x = 1; x < s.sx - 1; x += 2) {
      const ti = idx(s, x, y);
      if (s.flags[ti] & F_TILE_ASSOC) continue;
      if (!(ctx.reach[ti] & M_REACHABLE)) return IMPOSSIBLE;
      if (ctx.reach[ti] & M_MULTIPLE) continue;
      const r = solverAddAssoc(s, x, y, ctx.reachDotX[ti], ctx.reachDotY[ti]);
      if (r === IMPOSSIBLE) return IMPOSSIBLE;
      if (r === PROGRESS) didsth = PROGRESS;
    }
  }
  return didsth;
}

function solverExtendExclaves(s: GalaxiesState): number {
  const sz = s.sx * s.sy;
  const dsf = new Dsf(sz);
  // Unify adjacent tiles sharing a dot association.
  for (let x = 1; x < s.sx; x += 2) {
    for (let y = 1; y < s.sy; y += 2) {
      const ti = idx(s, x, y);
      if (!(s.flags[ti] & F_TILE_ASSOC)) continue;
      const dx = s.dotx[ti];
      const dy = s.doty[ti];
      if (inGrid(s, x + 2, y)) {
        const oi = idx(s, x + 2, y);
        if (s.flags[oi] & F_TILE_ASSOC && s.dotx[oi] === dx && s.doty[oi] === dy) {
          dsf.merge(ti, oi);
        }
      }
      if (inGrid(s, x, y + 2)) {
        const oi = idx(s, x, y + 2);
        if (s.flags[oi] & F_TILE_ASSOC && s.dotx[oi] === dx && s.doty[oi] === dy) {
          dsf.merge(ti, oi);
        }
      }
    }
  }

  // Count the 'liberties' of each connected component, in the Go
  // sense: the number of currently unassociated squares adjacent to
  // the component. If an exclave has just one liberty, that square
  // _must_ extend the exclave, or the exclave gets cut off from its
  // home dot.
  //
  // We count each adjacent square just once even if it borders the
  // component on multiple edges, so we walk each unassociated square
  // and de-duplicate its neighbours (not the other way round).
  //
  // Storage trick (from upstream's solver_extend_exclaves): we store
  // the liberty count in `iscratch[i]` at the centre of each square
  // (odd coords), and use `iscratch[i-1]` (an even-coord cell to the
  // left, which never carries any tile data itself) to remember the
  // *index* of the single liberty when there is exactly one. The
  // i-1 slot is a free sidecar — no overlap is possible because no
  // two square centres share the same i-1 neighbour.
  //
  // Non-canonical square centres are marked with iscratch[i] = -1,
  // so the later loop can detect "this square has since become
  // associated and is no longer the canonical dsf element it was
  // when the dsf was built" without re-walking the dsf.
  const iscratch = new Int32Array(sz);
  for (let x = 1; x < s.sx; x += 2) {
    for (let y = 1; y < s.sy; y += 2) {
      const i = idx(s, x, y);
      if (!(s.flags[i] & F_TILE_ASSOC) || dsf.canonify(i) !== i) {
        iscratch[i] = -1;
      } else {
        iscratch[i] = 0;
        iscratch[i - 1] = 0;
      }
    }
  }

  // Count distinct liberties per component.
  for (let x = 1; x < s.sx; x += 2) {
    for (let y = 1; y < s.sy; y += 2) {
      const ti = idx(s, x, y);
      if (s.flags[ti] & F_TILE_ASSOC) continue;
      const ni: number[] = [];
      for (let dx = -1; dx <= 1; dx++) {
        for (let dy = -1; dy <= 1; dy++) {
          if (dx !== 0 && dy !== 0) continue;
          if (dx === 0 && dy === 0) continue;
          const nx = x + 2 * dx;
          const ny = y + 2 * dy;
          if (!inGrid(s, nx, ny)) continue;
          const ai = idx(s, nx, ny);
          if (!(s.flags[ai] & F_TILE_ASSOC)) continue;
          const can = dsf.canonify(ai);
          if (ni.includes(can)) continue;
          iscratch[can]++;
          iscratch[can - 1] = ti;
          ni.push(can);
        }
      }
    }
  }

  let didsth = NOTHING;
  for (let x = 1; x < s.sx; x += 2) {
    for (let y = 1; y < s.sy; y += 2) {
      const i = idx(s, x, y);
      if (iscratch[i] === -1) continue;
      if (!(s.flags[i] & F_TILE_ASSOC)) continue;
      const dx = s.dotx[i];
      const dy = s.doty[i];
      // Skip if this component contains its own dot.
      if (i === dsf.canonify((dy | 1) * s.sx + (dx | 1))) continue;
      if (iscratch[i] === 0) return IMPOSSIBLE;
      if (iscratch[i] !== 1) continue;
      const libIdx = iscratch[i - 1];
      const lx = libIdx % s.sx;
      const ly = (libIdx / s.sx) | 0;
      const li = idx(s, lx, ly);
      if (s.flags[li] & F_TILE_ASSOC) continue;
      const r = solverAddAssoc(s, lx, ly, dx, dy);
      if (r === IMPOSSIBLE) return IMPOSSIBLE;
      if (r === PROGRESS) didsth = PROGRESS;
    }
  }
  return didsth;
}

/** Pick the unassociated tile with the most plausible dot
 * assignments — the recursion branch-point. */
function pickRecurseTarget(s: GalaxiesState): {
  x: number;
  y: number;
  n: number;
} | null {
  let bestX = -1;
  let bestY = -1;
  let bestN = 0;
  for (let y = 1; y < s.sy - 1; y += 2) {
    for (let x = 1; x < s.sx - 1; x += 2) {
      const ti = idx(s, x, y);
      if (s.flags[ti] & F_TILE_ASSOC) continue;
      let n = 0;
      for (const dot of s.dots) {
        const opp = spaceOppositeDot(s, x, y, dot.x, dot.y);
        if (!opp) continue;
        const oi = idx(s, opp.x, opp.y);
        if (
          s.flags[oi] & F_TILE_ASSOC &&
          (s.dotx[oi] !== dot.x || s.doty[oi] !== dot.y)
        ) {
          continue;
        }
        n++;
      }
      if (n > bestN) {
        bestN = n;
        bestX = x;
        bestY = y;
      }
    }
  }
  if (bestN === 0) return null;
  return { x: bestX, y: bestY, n: bestN };
}

function dotForTile(
  s: GalaxiesState,
  tx: number,
  ty: number,
  dx: number,
  dy: number,
): boolean {
  const opp = spaceOppositeDot(s, tx, ty, dx, dy);
  if (!opp) return false;
  const oi = idx(s, opp.x, opp.y);
  if (s.flags[oi] & F_TILE_ASSOC && (s.dotx[oi] !== dx || s.doty[oi] !== dy)) {
    return false;
  }
  return true;
}

function solverRecurse(
  s: GalaxiesState,
  maxDiff: GalaxiesDiff,
  depth: number,
): GalaxiesDiff {
  if (depth >= MAX_RECURSE) return GalaxiesDiff.Unfinished;
  const pick = pickRecurseTarget(s);
  if (!pick) return GalaxiesDiff.Impossible;

  // Save the current grid so we can replay it for each branch.
  const baseFlags = new Uint16Array(s.flags);
  const baseDotx = new Int16Array(s.dotx);
  const baseDoty = new Int16Array(s.doty);
  const baseNassoc = new Int16Array(s.nassoc);

  interface Snapshot {
    flags: Uint16Array;
    dotx: Int16Array;
    doty: Int16Array;
    nassoc: Int16Array;
  }
  let diff: GalaxiesDiff = GalaxiesDiff.Impossible;
  let best: Snapshot | null = null;

  for (const dot of s.dots) {
    s.flags.set(baseFlags);
    s.dotx.set(baseDotx);
    s.doty.set(baseDoty);
    s.nassoc.set(baseNassoc);
    if (!dotForTile(s, pick.x, pick.y, dot.x, dot.y)) continue;
    solverAddAssoc(s, pick.x, pick.y, dot.x, dot.y);

    const ret = solverStateInner(s, maxDiff, depth + 1);
    if (diff === GalaxiesDiff.Impossible && ret !== GalaxiesDiff.Impossible) {
      best = {
        flags: new Uint16Array(s.flags),
        dotx: new Int16Array(s.dotx),
        doty: new Int16Array(s.doty),
        nassoc: new Int16Array(s.nassoc),
      };
    }
    if (ret === GalaxiesDiff.Ambiguous || ret === GalaxiesDiff.Unfinished) {
      diff = ret;
    } else if (ret !== GalaxiesDiff.Impossible) {
      // Precisely one solution under this branch.
      if (diff === GalaxiesDiff.Impossible) diff = GalaxiesDiff.Unreasonable;
      else diff = GalaxiesDiff.Ambiguous;
    }
    if (diff === GalaxiesDiff.Ambiguous || diff === GalaxiesDiff.Unfinished) {
      break;
    }
  }

  if (best) {
    s.flags.set(best.flags);
    s.dotx.set(best.dotx);
    s.doty.set(best.doty);
    s.nassoc.set(best.nassoc);
  } else {
    s.flags.set(baseFlags);
    s.dotx.set(baseDotx);
    s.doty.set(baseDoty);
    s.nassoc.set(baseNassoc);
  }
  return diff;
}

function solverStateInner(
  s: GalaxiesState,
  maxDiff: GalaxiesDiff,
  depth: number,
): GalaxiesDiff {
  let ret = solverObvious(s);
  if (ret === IMPOSSIBLE) return GalaxiesDiff.Impossible;

  let diff = GalaxiesDiff.Normal;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    ret = solverLinesOpposite(s);
    if (ret === IMPOSSIBLE) return GalaxiesDiff.Impossible;
    if (ret === PROGRESS) {
      diff = Math.max(diff, GalaxiesDiff.Normal);
      continue;
    }
    ret = solverSpacesOneposs(s);
    if (ret === IMPOSSIBLE) return GalaxiesDiff.Impossible;
    if (ret === PROGRESS) {
      diff = Math.max(diff, GalaxiesDiff.Normal);
      continue;
    }
    ret = solverExpandDots(s);
    if (ret === IMPOSSIBLE) return GalaxiesDiff.Impossible;
    if (ret === PROGRESS) {
      diff = Math.max(diff, GalaxiesDiff.Normal);
      continue;
    }
    ret = solverExtendExclaves(s);
    if (ret === IMPOSSIBLE) return GalaxiesDiff.Impossible;
    if (ret === PROGRESS) {
      diff = Math.max(diff, GalaxiesDiff.Normal);
      continue;
    }
    break;
  }

  const { complete } = checkComplete(s, false);
  if (complete) return diff;
  if (maxDiff >= GalaxiesDiff.Unreasonable) {
    return solverRecurse(s, maxDiff, depth);
  }
  return GalaxiesDiff.Unfinished;
}

/** Run the difficulty-graded solver on `s` (mutated in place).
 * Returns the *minimum* difficulty at which the puzzle is uniquely
 * solvable, or `Ambiguous` / `Impossible` / `Unfinished`. */
export function solverState(s: GalaxiesState, maxDiff: GalaxiesDiff): GalaxiesDiff {
  return solverStateInner(s, maxDiff, 0);
}

/** Mirrors C's `clear_game(state, false)`: erase non-dot flags in the
 * interior (keep dots and border edges). Used to set up a starting
 * position for the generator's solver check. */
export function clearForSolve(s: GalaxiesState): void {
  for (let y = 1; y < s.sy - 1; y++) {
    for (let x = 1; x < s.sx - 1; x++) {
      const i = idx(s, x, y);
      s.flags[i] &= F_DOT | F_DOT_BLACK;
      s.dotx[i] = 0;
      s.doty[i] = 0;
      if (s.flags[i] & F_DOT) s.nassoc[i] = 0;
    }
  }
}

// Re-export the deduction primitives for testing.
export const _internals = {
  solverObvious,
  solverLinesOpposite,
  solverSpacesOneposs,
  solverExpandDots,
  solverExtendExclaves,
};
