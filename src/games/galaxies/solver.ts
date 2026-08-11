/**
 * Galaxies solver — difficulty-graded deduction chain plus bounded
 * recursion for `Unreasonable`. Idiomatic TS port of `solver_state`
 * and friends in galaxies.c.
 *
 * The deduction rules take an optional {@link SolverRecorder}, which is how
 * `hint.ts` narrates them (one engine, two projections —
 * docs/games/hints.md § "Recording the deduction"). The generator and
 * `solve` pass none, so their path is byte-identical by construction and the
 * frozen differential is the guard.
 */
import { Dsf } from "../../engine/dsf.ts";
import {
  addAssoc,
  adjacencies,
  checkComplete,
  cloneState,
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

/** Re-exported so the hint can read the rules' return codes. */
export const SOLVER_IMPOSSIBLE = IMPOSSIBLE;
export const SOLVER_PROGRESS = PROGRESS;

// --- the recorder (the hint's projection of these same rules) --------

export interface Pos {
  readonly x: number;
  readonly y: number;
}

/**
 * One deduction firing, in the vocabulary of the rule that fired it. The
 * *reason* is built where the deduction is made — only the rule knows why the
 * other possibilities died (docs/games/hints.md § "The premise must single out
 * the conclusion").
 *
 * Every association firing carries `opp`, the 180° partner the game commits in
 * the same move (`addAssocWithOpposite`), because the hint's targets are the
 * pair and its narration says so.
 */
export type GalaxiesFiring =
  /** The cells a dot physically sits on belong to it. */
  | { kind: "dotTile"; dot: Pos; tiles: Pos[] }
  /** Two neighbours in different galaxies: a wall must run between them. */
  | { kind: "separate"; edge: Pos; tiles: [Pos, Pos]; dots: [Pos, Pos] }
  /** A galaxy's boundary is symmetric, so a wall is mirrored about the dot. */
  | { kind: "mirrorWall"; edge: Pos; from: Pos; tile: Pos; opp: Pos; dot: Pos }
  /** Every way out of a cell leads into the same galaxy. */
  | { kind: "enclosed"; tile: Pos; opp: Pos | null; dot: Pos; openings: Pos[] }
  /** Only one dot's galaxy can still stretch to a cell. */
  | { kind: "onlyReach"; tile: Pos; opp: Pos | null; dot: Pos; region: Pos[] }
  /** A detached piece of a galaxy has one square left to grow through. */
  | { kind: "exclave"; tile: Pos; opp: Pos | null; dot: Pos; component: Pos[] }
  /** Unreasonable: every other dot is refuted by contradiction (hint-only,
   * built in `hint.ts` — the C's recursion decides a whole board at once). */
  | {
      kind: "elimination";
      tile: Pos;
      opp: Pos | null;
      dot: Pos;
      refuted: { dot: Pos; because: GalaxiesContradiction | null }[];
    };

/** Why a board is inconsistent — recorded at the point the rule gives up, so
 * the Unreasonable rung can say what its hypothesis actually broke. */
export type GalaxiesContradiction =
  /** Two galaxies would both have to contain this cell. */
  | { kind: "claimed"; x: number; y: number }
  /** This cell's mirror image falls outside the board. */
  | { kind: "offBoard"; x: number; y: number }
  /** This cell is walled in on all four sides. */
  | { kind: "sealed"; x: number; y: number }
  /** No galaxy can reach this cell at all. */
  | { kind: "unreachable"; x: number; y: number }
  /** This piece of a galaxy is sealed off from its own dot. */
  | { kind: "cutOff"; x: number; y: number };

/**
 * The optional sink the rules record into.
 *
 * `stopAtFirstFiring` is what makes the hint's projection *stepwise*: a rule
 * normally sweeps the whole board and accumulates, which is right for solving
 * and wrong for narrating (one firing = one hint). The refutation pass in
 * `hint.ts` wants the fast accumulating sweep *and* the contradiction site, so
 * it passes a recorder with the flag off.
 */
export interface SolverRecorder {
  /** Return from a rule as soon as one firing is recorded. */
  stopAtFirstFiring: boolean;
  /** The firing this pass recorded, if any. */
  firing: GalaxiesFiring | null;
  /** Where the board first proved inconsistent, if it did. */
  contradiction: GalaxiesContradiction | null;
}

export function newRecorder(stopAtFirstFiring: boolean): SolverRecorder {
  return { stopAtFirstFiring, firing: null, contradiction: null };
}

/** Record the *first* contradiction only: later rules re-report the same
 * inconsistency as it propagates, and the first one is where it was found. */
function note(rec: SolverRecorder | undefined, c: GalaxiesContradiction): void {
  if (rec && !rec.contradiction) rec.contradiction = c;
}

/** True when this rule should return now — it has a firing and the caller
 * asked for one at a time. */
function stop(rec: SolverRecorder | undefined): boolean {
  return rec?.stopAtFirstFiring === true && rec.firing !== null;
}

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
  rec?: SolverRecorder,
): number {
  const ti = idx(s, tx, ty);
  if (s.flags[ti] & F_TILE_ASSOC) {
    if (s.dotx[ti] !== dx || s.doty[ti] !== dy) {
      note(rec, { kind: "claimed", x: tx, y: ty });
      return IMPOSSIBLE;
    }
    return NOTHING;
  }
  const opp = spaceOppositeDot(s, tx, ty, dx, dy);
  if (!opp) {
    note(rec, { kind: "offBoard", x: tx, y: ty });
    return IMPOSSIBLE;
  }
  const oi = idx(s, opp.x, opp.y);
  if (s.flags[oi] & F_TILE_ASSOC) {
    if (s.dotx[oi] !== dx || s.doty[oi] !== dy) {
      note(rec, { kind: "claimed", x: opp.x, y: opp.y });
      return IMPOSSIBLE;
    }
  }
  addAssoc(s, tx, ty, dx, dy);
  addAssoc(s, opp.x, opp.y, dx, dy);
  return PROGRESS;
}

/** Tiles directly orthogonally adjacent to a dot are associated with
 * it. Mirrors `solver_obvious_dot`. */
function solverObviousDot(
  s: GalaxiesState,
  dx: number,
  dy: number,
  rec?: SolverRecorder,
): number {
  let didsth = NOTHING;
  // One dot's own cells are one deduction ("a galaxy covers the cells its dot
  // sits on"), so the recorded firing is the whole set, not a cell at a time.
  //
  // Which cells changed is decided *before* the loop, not from its return
  // codes: `solverAddAssoc` claims the 180° partner as well, so the partner
  // reports NOTHING when its own turn comes round and a firing built from
  // PROGRESS alone lists half the cells its move actually claims — a hint
  // saying "this cell" while filling one of two (owner-visible, caught in the
  // browser).
  const own: Pos[] = [];
  for (let ddy = -1; ddy <= 1; ddy++) {
    for (let ddx = -1; ddx <= 1; ddx++) {
      const tx = dx + ddx;
      const ty = dy + ddy;
      if (!inGrid(s, tx, ty)) continue;
      if (spaceTypeAt(tx, ty) !== SpaceType.Tile) continue;
      own.push({ x: tx, y: ty });
    }
  }
  const fresh = own.filter((t) => !(s.flags[idx(s, t.x, t.y)] & F_TILE_ASSOC));
  for (const t of own) {
    const r = solverAddAssoc(s, t.x, t.y, dx, dy, rec);
    if (r === IMPOSSIBLE) return IMPOSSIBLE;
    if (r === PROGRESS) didsth = PROGRESS;
  }
  if (rec && didsth === PROGRESS) {
    rec.firing = { kind: "dotTile", dot: { x: dx, y: dy }, tiles: fresh };
  }
  return didsth;
}

export function solverObvious(s: GalaxiesState, rec?: SolverRecorder): number {
  let didsth = NOTHING;
  for (const dot of s.dots) {
    const r = solverObviousDot(s, dot.x, dot.y, rec);
    if (r === IMPOSSIBLE) return IMPOSSIBLE;
    if (r === PROGRESS) didsth = PROGRESS;
    if (stop(rec)) return PROGRESS;
  }
  return didsth;
}

/**
 * Which of this rule's two halves to apply. Both, always, on the solve path —
 * the parameter exists because the *hint* wants them as separate rungs: the
 * "different dots, so a wall" half is the technique that advances the board,
 * and the mirror half is the clever one, better shown when it is needed than
 * as the routine way walls appear. Splitting the order changes nothing about
 * what is deducible.
 */
interface LineRules {
  separate: boolean;
  mirror: boolean;
}

const BOTH_LINE_RULES: LineRules = { separate: true, mirror: true };

/** For each set edge, also set its 180°-opposite edge through the
 * associated tiles' dot. Mirrors `solver_lines_opposite_cb` run
 * across every edge. */
function solverLinesOpposite(
  s: GalaxiesState,
  rec?: SolverRecorder,
  rules: LineRules = BOTH_LINE_RULES,
): number {
  let didsth = NOTHING;
  for (let y = 0; y < s.sy; y++) {
    for (let x = 0; x < s.sx; x++) {
      if (spaceTypeAt(x, y) !== SpaceType.Edge) continue;
      const ei = idx(s, x, y);
      const tiles = tilesFromEdge(s, x, y);

      // If both tile-neighbours are associated with different dots,
      // there must be an edge between them.
      if (
        rules.separate &&
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
          if (rec) {
            const t0 = tiles[0];
            const t1 = tiles[1];
            rec.firing = {
              kind: "separate",
              edge: { x, y },
              tiles: [t0, t1],
              dots: [
                { x: s.dotx[i0], y: s.doty[i0] },
                { x: s.dotx[i1], y: s.doty[i1] },
              ],
            };
            if (rec.stopAtFirstFiring) return PROGRESS;
          }
        }
      }

      if (!rules.mirror) continue;
      if (!(s.flags[ei] & F_EDGE_SET)) continue;

      // Mirror set edges across each adjacent associated tile's dot.
      for (let n = 0; n < 2; n++) {
        const t = tiles[n];
        if (!t) continue;
        const ti = idx(s, t.x, t.y);
        if (!(s.flags[ti] & F_TILE_ASSOC)) continue;
        const opp = tileOpposite(s, t.x, t.y);
        if (!opp) {
          note(rec, { kind: "offBoard", x: t.x, y: t.y });
          return IMPOSSIBLE;
        }
        const ddx = t.x - x;
        const ddy = t.y - y;
        const ox = opp.x + ddx;
        const oy = opp.y + ddy;
        if (!inGrid(s, ox, oy)) {
          note(rec, { kind: "offBoard", x: opp.x, y: opp.y });
          return IMPOSSIBLE;
        }
        const oei = idx(s, ox, oy);
        if (!(s.flags[oei] & F_EDGE_SET)) {
          s.flags[oei] |= F_EDGE_SET;
          didsth = PROGRESS;
          if (rec) {
            rec.firing = {
              kind: "mirrorWall",
              edge: { x: ox, y: oy },
              from: { x, y },
              tile: { x: t.x, y: t.y },
              opp,
              dot: { x: s.dotx[ti], y: s.doty[ti] },
            };
            if (rec.stopAtFirstFiring) return PROGRESS;
          }
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
function solverSpacesOneposs(s: GalaxiesState, rec?: SolverRecorder): number {
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
      // The ways out: neighbours reached through an unwalled side. Every one
      // of them belongs to the single dot below, which is the whole premise.
      const openings: Pos[] = [];
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
          openings.push({ x: t.x, y: t.y });
        }
      }
      if (abort) continue;
      if (eset === 4) {
        note(rec, { kind: "sealed", x, y });
        return IMPOSSIBLE;
      }
      if (dx === -1) continue;
      if (rec) {
        rec.firing = {
          kind: "enclosed",
          tile: { x, y },
          opp: spaceOppositeDot(s, x, y, dx, dy),
          dot: { x: dx, y: dy },
          openings,
        };
      }
      const r = solverAddAssoc(s, x, y, dx, dy, rec);
      if (r === IMPOSSIBLE) return IMPOSSIBLE;
      if (r === PROGRESS) {
        didsth = PROGRESS;
        if (stop(rec)) return PROGRESS;
      } else if (rec) {
        // Recorded a firing that turned out to change nothing — drop it, or
        // the hint would offer a move the board already has.
        rec.firing = null;
      }
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
  reached?: number[],
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
    // The queue is the *reachable* set; `ctx.mark` is wider than that (it also
    // marks neighbours the pair test rejected), so a hint that shaded `mark`
    // would claim reach the galaxy does not have.
    reached?.push(enc);
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

/** Every tile one dot's mirror-pair flood can still reach — the shaded area
 * behind an `onlyReach` firing's "this is as far as that galaxy can stretch".
 * Recomputed for the one winning dot rather than kept for all of them: the
 * solve path never needs it, and a hint fires at most once per pass. */
function reachOfDot(s: GalaxiesState, dx: number, dy: number): Pos[] {
  const sz = s.sx * s.sy;
  const ctx: ExpandCtx = {
    mark: new Uint8Array(sz),
    scratch: new Int32Array(sz),
    reach: new Uint8Array(sz),
    reachDotX: new Int16Array(sz),
    reachDotY: new Int16Array(sz),
  };
  const reached: number[] = [];
  solverExpandFromdot(s, dx, dy, ctx, reached);
  const out: Pos[] = [];
  const seen = new Set<number>();
  for (const enc of reached) {
    if (seen.has(enc)) continue;
    seen.add(enc);
    out.push({ x: enc % s.sx, y: (enc / s.sx) | 0 });
  }
  return out;
}

function solverExpandDots(s: GalaxiesState, rec?: SolverRecorder): number {
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
      if (!(ctx.reach[ti] & M_REACHABLE)) {
        note(rec, { kind: "unreachable", x, y });
        return IMPOSSIBLE;
      }
      if (ctx.reach[ti] & M_MULTIPLE) continue;
      const dx = ctx.reachDotX[ti];
      const dy = ctx.reachDotY[ti];
      // Record before applying: the reachable area is the argument, and the
      // association about to be made would be part of it.
      if (rec) {
        rec.firing = {
          kind: "onlyReach",
          tile: { x, y },
          opp: spaceOppositeDot(s, x, y, dx, dy),
          dot: { x: dx, y: dy },
          region: reachOfDot(s, dx, dy),
        };
      }
      const r = solverAddAssoc(s, x, y, dx, dy, rec);
      if (r === IMPOSSIBLE) return IMPOSSIBLE;
      if (r === PROGRESS) {
        didsth = PROGRESS;
        if (stop(rec)) return PROGRESS;
      } else if (rec) {
        rec.firing = null;
      }
    }
  }
  return didsth;
}

function solverExtendExclaves(s: GalaxiesState, rec?: SolverRecorder): number {
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
      if (iscratch[i] === 0) {
        note(rec, { kind: "cutOff", x, y });
        return IMPOSSIBLE;
      }
      if (iscratch[i] !== 1) continue;
      const libIdx = iscratch[i - 1];
      const lx = libIdx % s.sx;
      const ly = (libIdx / s.sx) | 0;
      const li = idx(s, lx, ly);
      if (s.flags[li] & F_TILE_ASSOC) continue;
      if (rec) {
        rec.firing = {
          kind: "exclave",
          tile: { x: lx, y: ly },
          opp: spaceOppositeDot(s, lx, ly, dx, dy),
          dot: { x: dx, y: dy },
          component: membersOf(s, dsf, i),
        };
      }
      const r = solverAddAssoc(s, lx, ly, dx, dy, rec);
      if (r === IMPOSSIBLE) return IMPOSSIBLE;
      if (r === PROGRESS) {
        didsth = PROGRESS;
        if (stop(rec)) return PROGRESS;
      } else if (rec) {
        rec.firing = null;
      }
    }
  }
  return didsth;
}

/** The tiles of one `solverExtendExclaves` component — the detached piece an
 * `exclave` firing shades as its evidence. */
function membersOf(s: GalaxiesState, dsf: Dsf, canon: number): Pos[] {
  const out: Pos[] = [];
  for (let y = 1; y < s.sy - 1; y += 2) {
    for (let x = 1; x < s.sx - 1; x += 2) {
      const i = idx(s, x, y);
      if (!(s.flags[i] & F_TILE_ASSOC)) continue;
      if (dsf.canonify(i) === canon) out.push({ x, y });
    }
  }
  return out;
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
  rec?: SolverRecorder,
): GalaxiesDiff {
  let ret = solverObvious(s, rec);
  if (ret === IMPOSSIBLE) return GalaxiesDiff.Impossible;

  let diff = GalaxiesDiff.Normal;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    ret = solverLinesOpposite(s, rec);
    if (ret === IMPOSSIBLE) return GalaxiesDiff.Impossible;
    if (ret === PROGRESS) {
      diff = Math.max(diff, GalaxiesDiff.Normal);
      continue;
    }
    ret = solverSpacesOneposs(s, rec);
    if (ret === IMPOSSIBLE) return GalaxiesDiff.Impossible;
    if (ret === PROGRESS) {
      diff = Math.max(diff, GalaxiesDiff.Normal);
      continue;
    }
    ret = solverExpandDots(s, rec);
    if (ret === IMPOSSIBLE) return GalaxiesDiff.Impossible;
    if (ret === PROGRESS) {
      diff = Math.max(diff, GalaxiesDiff.Normal);
      continue;
    }
    ret = solverExtendExclaves(s, rec);
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

// --- the hint's two entry points into these rules --------------------

/**
 * Advance `s` by **one** deduction and return what fired, or `null` when no
 * rule applies (the board is finished, stuck, or inconsistent).
 *
 * The rungs run in the solver's own order, so the hint teaches the techniques
 * in the order the game itself finds them easiest.
 */
export function nextFiring(s: GalaxiesState): GalaxiesFiring | null {
  const rec = newRecorder(true);
  const separateOnly: LineRules = { separate: true, mirror: false };
  const mirrorOnly: LineRules = { separate: false, mirror: true };
  const rungs: ((s: GalaxiesState, rec: SolverRecorder) => number)[] = [
    solverObvious,
    (b, r) => solverLinesOpposite(b, r, separateOnly),
    solverSpacesOneposs,
    solverExpandDots,
    solverExtendExclaves,
    // Last, deliberately. Mirroring a wall is Galaxies' signature technique
    // and stays in the plan — but as the *routine* source of walls it buried
    // everything else (58% of a 7x7 plan's steps, measured), while the walls
    // it drew early are the same ones "these two cells are in different
    // galaxies" narrates later, in the game's plainest terms. Demoted, it
    // fires only where it is genuinely the deduction that unsticks the board.
    (b, r) => solverLinesOpposite(b, r, mirrorOnly),
  ];
  for (const rung of rungs) {
    if (rung(s, rec) === IMPOSSIBLE) return null;
    if (rec.firing) return rec.firing;
  }
  return null;
}

/**
 * Would assuming `tile` belongs to `dot` break the board? Runs the ordinary
 * deduction chain — no recursion, so nothing here is a guess about a guess —
 * on a private copy, and reports *what* broke.
 *
 * This is the Unreasonable rung's primitive: a cell whose every other dot is
 * refuted this way must belong to the one that survives.
 */
export function refuteAssoc(
  s: GalaxiesState,
  tx: number,
  ty: number,
  dx: number,
  dy: number,
): { refuted: boolean; because: GalaxiesContradiction | null } {
  const t = cloneState(s);
  // The accumulating sweep, not the stepwise one: this pass wants the whole
  // fixpoint at full speed and only the contradiction out of it.
  const rec = newRecorder(false);
  const seed = solverAddAssoc(t, tx, ty, dx, dy, rec);
  if (seed === IMPOSSIBLE) return { refuted: true, because: rec.contradiction };
  const ret = solverStateInner(t, GalaxiesDiff.Normal, 0, rec);
  return ret === GalaxiesDiff.Impossible
    ? { refuted: true, because: rec.contradiction }
    : { refuted: false, because: null };
}

/** Every dot `(tx, ty)` could still belong to as far as symmetry alone can
 * tell — the candidate set the Unreasonable rung tries to whittle to one.
 * Mirrors the C recursion's own `dot_for_tile` filter. */
export function candidateDots(s: GalaxiesState, tx: number, ty: number): Pos[] {
  return s.dots.filter((d) => dotForTile(s, tx, ty, d.x, d.y));
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
