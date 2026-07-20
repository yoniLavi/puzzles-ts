/**
 * The **spectre** aperiodic monotile tiling — the idiomatic TS port of upstream
 * `spectre.c` (and `spectre-internal.h`).
 *
 * The spectre, discovered in 2023, is a single 14-sided tile that tiles the
 * plane only aperiodically — no reflections needed, unlike the hat. Upstream's
 * generator does not lay tiles down one at a time and hope; it works in a
 * *substitution system* of nine marked hexagon types (lettered G D J L X P S F
 * Y), each of which expands into seven or eight smaller ones, with each hexagon
 * carrying one or two spectres.
 *
 * The consequence, and the thing worth understanding before reading any of the
 * code below, is that a spectre's address is a **sequence of digits read from
 * the bottom up**: "spectre 1 of hex 3 of hex 0 of hex 4 of … of a G hex". That
 * sequence is a {@link SpectreCoords}. Walking from one spectre to its
 * neighbour across an edge is then a *carry* operation on that address: usually
 * you just move to a sibling, but when you leave the parent hexagon entirely,
 * you recurse a level up, cross there, and come back down —
 * {@link SpectreContext.stepHex} and {@link SpectreContext.step} are those two
 * mutually recursive halves. If the recursion runs off the top of the known
 * address, a new enclosing hexagon is *invented* (randomly, weighted by the
 * limiting distribution), and the tiling grows outward for ever.
 *
 * Everything geometric is **exact integer arithmetic** in ℤ[d] where
 * `d = exp(iπ/6)`, projected at the very end into ℤ[√3] and only then rounded
 * to pixels. No floating point appears anywhere in this file.
 *
 * Upstream's writeup:
 * https://www.chiark.greenend.org.uk/~sgtatham/quasiblog/aperiodic-spectre/
 *
 * The grid glue — turning the emitted tiles into a `Grid` — lives next door in
 * `spectre-grid.ts`. The lookup tables are generated; see `spectre-tables.ts`.
 */

import { type RandomState, randomNew, randomUpto } from "../../random/index.ts";
import { retryLimit } from "../retry-limit.ts";
import {
  HEX_DATA,
  HEX_LETTERS,
  type Hex,
  type MapEntry,
  numSpectres,
  numSubhexes,
  POSS_SPECTRE,
  type Possibility,
  SPECTRE_ANGLES,
} from "./spectre-tables.ts";

/** Every spectre has fourteen vertices — including the collinear one. */
export const SPECTRE_NVERTICES = 14;

// ---------------------------------------------------------------------------
// Point arithmetic: the ring ℤ[d], d = exp(iπ/6) = a 1/12 turn.
// ---------------------------------------------------------------------------

/**
 * A point in the plane as an integer combination of `{1, d, d², d³}`, where `d`
 * is a 1/12 turn about the origin. Complex numbers, so they add, subtract and
 * multiply; multiplying by `pointRot(s)` rotates by `s` twelfths of a turn.
 *
 * Four coefficients suffice because `d` satisfies `d⁴ = d² − 1`, which is what
 * lets {@link pointMulByD} fold the fifth coefficient back down.
 */
export type Point = readonly [number, number, number, number];

export function pointAdd(a: Point, b: Point): Point {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2], a[3] + b[3]];
}

export function pointSub(a: Point, b: Point): Point {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2], a[3] - b[3]];
}

/** Multiply by `d`, folding `d⁴` back via the identity `d⁴ − d² + 1 = 0`. */
function pointMulByD(x: Point): Point {
  return [-x[3], x[0], x[1] + x[3], x[2]];
}

/** Complex multiplication, by Horner's rule in powers of `d`. */
export function pointMul(a: Point, b: Point): Point {
  // Start with `a` scaled by b's d³ term, then repeatedly multiply by d and add
  // the next coefficient down.
  let r: Point = [a[0] * b[3], a[1] * b[3], a[2] * b[3], a[3] * b[3]];
  for (let i = 2; i >= 0; i--) {
    const s = pointMulByD(r);
    r = [
      s[0] + a[0] * b[i],
      s[1] + a[1] * b[i],
      s[2] + a[2] * b[i],
      s[3] + a[3] * b[i],
    ];
  }
  return r;
}

const ROT_CACHE = new Map<number, Point>();

/**
 * The unit point at `s` twelfths of a turn anticlockwise — multiply by it to
 * rotate. Memoised on `s mod 12`: it is a pure function of a tiny domain and is
 * called once per vertex of every tile placed.
 */
export function pointRot(s: number): Point {
  // C's `%` truncates toward zero, and so does JS's, so a negative `s` lands in
  // (-12, 0] and needs the same correction. Do not "fix" this into a floor-mod.
  let n = s % 12;
  if (n < 0) n += 12;

  const cached = ROT_CACHE.get(n);
  if (cached) return cached;

  let r: Point = [1, 0, 0, 0];
  let dPower: Point = [0, 1, 0, 0];
  let bits = n;
  for (;;) {
    if (bits & 1) r = pointMul(r, dPower);
    bits >>= 1;
    if (!bits) break;
    dPower = pointMul(dPower, dPower);
  }

  ROT_CACHE.set(n, r);
  return r;
}

// ---------------------------------------------------------------------------
// Coord arithmetic: a single axis, in ℤ[√3].
// ---------------------------------------------------------------------------

/** One Cartesian coordinate, as the exact value `c1 + cr3·√3`. */
export interface Coord {
  readonly c1: number;
  readonly cr3: number;
}

/** The x coordinate of a point, exactly. */
export function pointX(p: Point): Coord {
  return { c1: 2 * p[0] + p[2], cr3: p[1] };
}

/** The y coordinate of a point, exactly. */
export function pointY(p: Point): Coord {
  return { c1: 2 * p[3] + p[1], cr3: p[2] };
}

/**
 * The sign of `c1 + cr3·√3`, exactly: −1, 0 or +1.
 *
 * When the two parts agree in sign the answer is immediate. Otherwise they are
 * compared by squaring, which is exact because √3 is irrational and the two
 * squares can therefore never tie.
 *
 * **Deliberately plain JS numbers — no `| 0`, no `Math.imul`.** This inverts
 * the rule the rest of this port follows, so it is worth being explicit about
 * why. In C these products are `int` multiplications that can overflow for a
 * large enough patch, which is a real (if remote) upstream fragility; masking
 * to 32 bits here would faithfully *reproduce* that overflow rather than avoid
 * it. JS doubles are exact to 2⁵³, far beyond anything a grid produces, so the
 * wider intermediate can only ever make this predicate right more often. It is
 * safe to diverge here specifically because this is a *predicate on exact
 * values* — nothing downstream can observe it except through the bounds test,
 * unlike a coordinate that feeds a desc or an RNG draw.
 */
export function coordSign(x: Coord): number {
  // `-0 === 0`, so a negative zero in either part is handled by these first
  // three tests exactly as a positive zero would be.
  if (x.c1 === 0 && x.cr3 === 0) return 0;
  if (x.c1 >= 0 && x.cr3 >= 0) return +1;
  if (x.c1 <= 0 && x.cr3 <= 0) return -1;

  if (x.c1 * x.c1 > 3 * x.cr3 * x.cr3) return x.c1 < 0 ? -1 : +1;
  return x.cr3 < 0 ? -1 : +1;
}

/** Compare two exact coordinates; sign convention as `coordSign(a − b)`. */
export function coordCmp(a: Coord, b: Coord): number {
  return coordSign({ c1: a.c1 - b.c1, cr3: a.cr3 - b.cr3 });
}

// ---------------------------------------------------------------------------
// Combinatorial coordinates.
// ---------------------------------------------------------------------------

/**
 * One level of a spectre's address: which child of its parent hexagon this
 * hexagon is, and what type it is.
 *
 * `index === UNDECIDED` means "we have not yet decided where this hexagon sits
 * inside a larger one". The topmost level of every address is always undecided;
 * it is settled — at random, or from a stored desc — the moment a step needs to
 * cross out of it.
 */
export interface HexCoord {
  index: number;
  type: Hex;
}

/** Sentinel for a hexagon whose place in its parent has not been chosen yet. */
export const UNDECIDED = -1;

/**
 * A spectre's full address: which spectre it is within its innermost hexagon,
 * plus the chain of hexagons-within-hexagons enclosing it.
 *
 * Mutable, and cloned per neighbour during the search — a step *rewrites* the
 * lower levels of the address in place, which is exactly the carry propagation
 * the substitution system performs.
 */
export interface SpectreCoords {
  /** Index of the spectre within the innermost (order-0) hexagon. */
  index: number;
  /** Enclosing hexagons, innermost first. The last entry is always undecided. */
  c: HexCoord[];
}

function copyCoords(sc: SpectreCoords): SpectreCoords {
  return { index: sc.index, c: sc.c.map((h) => ({ index: h.index, type: h.type })) };
}

/** True if `letter` names one of the nine hexagon types. */
export function spectreValidHexLetter(letter: string): boolean {
  return HEX_LETTERS.includes(letter);
}

function hexFromLetter(letter: string): Hex {
  return HEX_LETTERS.indexOf(letter);
}

function hexToLetter(h: Hex): string {
  return HEX_LETTERS[h];
}

/**
 * Pick a weighted-random entry from a possibility table.
 *
 * **The draw is unconditional, and that matters even when `poss` has a single
 * entry** (`poss_J` and `poss_L` both do). Consuming the random number is an
 * observable side effect: skipping it when the answer is forced desynchronises
 * the stream from the C's, and the result is not an error but a *different,
 * perfectly valid tiling* — no assertion fires, nothing looks wrong, and a
 * shared game ID silently stops reproducing. Do not optimise this.
 */
function choosePoss(rs: RandomState, poss: readonly Possibility[]): Possibility {
  let limit = 0;
  for (const p of poss) limit += p.prob;

  let value = randomUpto(rs, limit);

  for (let i = 0; i + 1 < poss.length; i++) {
    if (value < poss[i].prob) return poss[i];
    value -= poss[i].prob;
  }
  return poss[poss.length - 1];
}

/**
 * A run of the generation algorithm.
 *
 * `prototype` is the address of the starting spectre, and is the *shared* store
 * of every higher-level choice: any other address that needs extending copies
 * the higher-order levels from here, so once a choice is made it stays made and
 * the whole patch remains consistent.
 */
export class SpectreContext {
  /**
   * The randomness source, or `null` when replaying a stored desc.
   *
   * Not `readonly`: replay installs a fallback here on demand — see
   * {@link extendCoords}.
   */
  private rs: RandomState | null;

  readonly prototype: SpectreCoords;
  /** Vertices 0 and 1 of the starting spectre; everything else follows. */
  private startVertices: [Point, Point] = [
    [0, 0, 0, 0],
    [0, 0, 0, 0],
  ];
  /** The starting spectre's orientation, in twelfths of a turn. */
  orientation = 0;

  private constructor(rs: RandomState | null, prototype: SpectreCoords) {
    this.rs = rs;
    this.prototype = prototype;
  }

  /** Begin a fresh random patch. Draws from `rs`; see the draw order below. */
  static random(rs: RandomState): SpectreContext {
    const poss = choosePoss(rs, POSS_SPECTRE);
    const ctx = new SpectreContext(rs, {
      index: poss.lo,
      c: [{ index: UNDECIDED, type: poss.hi }],
    });

    /*
     * Choose the starting spectre's orientation.
     *
     * Not simply one of the 12 possibilities. Spectres fall into two classes
     * under "orientation differs by a multiple of 1/6 turn", and one class is
     * much rarer than the other (like the reflected hats in the hat tiling).
     * Picking an orientation of matching parity keeps the *common* class in the
     * canonical head-upwards attitude, so a patch has plenty of spectres the
     * expected way up. The odd class is exactly those with index 1 — the ones
     * expanded from a G hex at index 1, which are the only spectres with a
     * nonzero index at all.
     */
    ctx.setStartVertices(randomUpto(rs, 6) * 2 + ctx.prototype.index);
    return ctx;
  }

  /** Replay the patch a desc describes. Consumes no randomness up front. */
  static fromParams(params: SpectrePatchParams): SpectreContext {
    const n = params.coords.length;
    const c: HexCoord[] = [];
    for (let i = 0; i < n; i++) {
      // Note the off-by-one: coords[0] is the *spectre* index, so hexagon level
      // `i` takes its index from `coords[i + 1]`. The topmost level has no
      // stored index and stays undecided.
      c.push({ index: i + 1 < n ? params.coords[i + 1] : UNDECIDED, type: 0 });
    }
    c[n - 1].type = hexFromLetter(params.finalHex);
    // Types below the top are implied: each level's type is determined by which
    // child of the level above it is.
    for (let i = n - 2; i >= 0; i--) {
      c[i].type = HEX_DATA[c[i + 1].type].subhexes[c[i].index];
    }

    const ctx = new SpectreContext(null, { index: params.coords[0], c });
    ctx.setStartVertices(params.orientation);
    return ctx;
  }

  private setStartVertices(orientation: number): void {
    const minusSqrt3 = pointAdd(pointRot(5), pointRot(-5));
    const basicEdge = pointMul(
      pointAdd(pointRot(0), pointRot(-3)),
      pointRot(orientation),
    );
    const diagonal = pointAdd(basicEdge, pointMul(basicEdge, pointRot(-3)));
    const v0 = pointMul(diagonal, minusSqrt3);
    this.startVertices = [v0, pointAdd(v0, basicEdge)];
    this.orientation = orientation;
  }

  /** The starting spectre, placed, with a private copy of the address. */
  initialSpectre(): Spectre {
    return {
      vertices: spectrePlace(this.startVertices[0], this.startVertices[1], 0),
      sc: copyCoords(this.prototype),
    };
  }

  /**
   * Extend `sc` to at least `n` levels, growing `prototype` first if it does not
   * reach that far — inventing enclosing hexagons as needed.
   *
   * ## The replay fallback
   *
   * When there is no random state, we are replaying a stored desc and have run
   * off the end of it. The obvious response is to answer non-randomly, but
   * upstream found that risks *endless recursion within a single step*: the hex
   * edge being traversed can turn into another copy of itself one level up, for
   * ever. A pseudo-random choice breaks that symmetry.
   *
   * So a fixed-seed generator is conjured here instead, and three details of it
   * are load-bearing for reproducing the C bit-for-bit:
   *
   * - the seed is the five bytes `"dummy"` (upstream's `random_new("dummy", 5)`
   *   passes the string's *length*, not a second seed component);
   * - it is created **lazily, at this call site** — an eager one constructed at
   *   context creation would be at a different point in nobody's stream, but
   *   one that gets *used* earlier would draw differently;
   * - it is **stored on the context and shared** by every later extension, so
   *   the whole patch continues down one stream rather than restarting it.
   *
   * Divergence here is silent in the worst way: the patch stays valid and
   * self-consistent, so nothing throws — the same desc simply yields a
   * different grid, and a saved puzzle loads with its clues on the wrong faces.
   */
  private extendCoords(sc: SpectreCoords, n: number): void {
    while (this.prototype.c.length < n) {
      const top = this.prototype.c[this.prototype.c.length - 1];
      const h = HEX_DATA[top.type];

      if (this.rs === null) {
        this.rs = randomNew("dummy");
      }

      const poss = choosePoss(this.rs, h.poss);
      top.index = poss.lo;
      this.prototype.c.push({ index: UNDECIDED, type: poss.hi });
    }

    while (sc.c.length < n) {
      const i = sc.c.length - 1;
      // The levels being copied are shared with every other address in the
      // patch, so they must already be settled and must already agree.
      if (sc.c[i].index !== UNDECIDED || sc.c[i].type !== this.prototype.c[i].type) {
        throw new Error("spectre: coordinate extension diverged from the prototype");
      }
      sc.c[i].index = this.prototype.c[i].index;
      sc.c.push({ index: UNDECIDED, type: this.prototype.c[i + 1].type });
    }
  }

  /**
   * Cross out of the hexagon at `depth` by its `edge` (0–5), rewriting `sc` to
   * name the hexagon arrived at. Returns the edge arrived by.
   *
   * If the destination is a sibling within the same parent the table answers
   * directly. Otherwise the step escapes the parent, so we recurse one level up,
   * cross *there*, and read back in through the parent's arrival table — the
   * carry propagation that makes this and {@link step} mutually recursive.
   */
  stepHex(sc: SpectreCoords, depth: number, edge: number): number {
    this.extendCoords(sc, depth + 2);

    let h = HEX_DATA[sc.c[depth + 1].type];
    let m: MapEntry = h.hexmap[6 * sc.c[depth].index + edge];

    if (!m.internal) {
      const recEdge = this.stepHex(sc, depth + 1, m.hi);
      // Re-read: the recursive step just rewrote this level's parent.
      h = HEX_DATA[sc.c[depth + 1].type];
      const me = h.hexedges[recEdge];
      m = h.hexin[me.startIndex + me.len - 1 - m.lo];
      // A single `if` suffices here, unlike `step`'s `while`, because *every*
      // `hexin` entry is internal — checked by the table generator, so this can
      // only trip on a broken extraction.
      if (!m.internal) {
        throw new Error("spectre: hexin entry unexpectedly external");
      }
    }

    sc.c[depth].index = m.hi;
    sc.c[depth].type = h.subhexes[m.hi];
    return m.lo;
  }

  /**
   * Cross out of a spectre by its `edge` (0–13), rewriting `sc` to name the
   * spectre arrived at. Returns the edge arrived by.
   *
   * **This loop is a `while`, not an `if`, and the difference is invisible
   * almost everywhere.** Stepping up into the parent hexagon can land on an
   * arrival entry that is *itself* external, requiring another hop — and
   * `specin_S` is the only table in which that happens (4 of its 18 entries).
   * Collapse this to a single `if` and every tiling without an S hex on the
   * relevant path still comes out perfect; only the differential notices.
   */
  step(sc: SpectreCoords, edge: number): number {
    let h = HEX_DATA[sc.c[0].type];
    let m: MapEntry = h.specmap[14 * sc.index + edge];

    // Upstream leaves this unbounded. It terminates because each hop settles one
    // more level of the address, but a porting slip could spin it for ever, and
    // a synchronous infinite loop here owns the thread outright.
    const guard = retryLimit("spectre: spectre-edge resolution");
    while (!m.internal) {
      guard();
      const recEdge = this.stepHex(sc, 0, m.hi);
      h = HEX_DATA[sc.c[0].type];
      const me = h.specedges[recEdge];
      m = h.specin[me.startIndex + me.len - 1 - m.lo];
    }

    sc.index = m.hi;
    return m.lo;
  }
}

// ---------------------------------------------------------------------------
// Placing spectres in the plane.
// ---------------------------------------------------------------------------

/** A placed spectre: its fourteen vertices, and its combinatorial address. */
export interface Spectre {
  readonly vertices: Point[];
  readonly sc: SpectreCoords;
}

/**
 * Fill in all fourteen vertices from a single known edge: `u` is the vertex at
 * position `indexOfU`, and `v` the one after it.
 *
 * Every edge of a spectre is the same length, so walking the outline is just
 * "step, turn, step, turn" with the turn angles from {@link SPECTRE_ANGLES} —
 * including its 0° entry, the collinear vertex splitting the double edge.
 */
export function spectrePlace(u: Point, v: Point, indexOfU: number): Point[] {
  const vertices = new Array<Point>(SPECTRE_NVERTICES);
  let here = u;
  let disp = pointSub(v, u);

  for (let i = 0; i < SPECTRE_NVERTICES; i++) {
    vertices[(i + indexOfU) % SPECTRE_NVERTICES] = here;
    here = pointAdd(here, disp);
    disp = pointMul(
      disp,
      pointRot(SPECTRE_ANGLES[(i + 1 + indexOfU) % SPECTRE_NVERTICES]),
    );
  }

  return vertices;
}

/**
 * Identity key for the visited set: the first two vertices' eight coefficients.
 *
 * Two vertices are enough because a spectre's shape is rigid — one edge forces
 * the other twelve. Upstream keeps its placed tiles in a `tree234` ordered by
 * exactly this comparison, but never observes the ordering, only membership, so
 * a keyed `Map` is exact. (Emission order comes from the BFS queue, not from
 * here — never iterate the set to emit faces.)
 */
function spectreKey(spec: Spectre): string {
  const a = spec.vertices[0];
  const b = spec.vertices[1];
  return `${a[0]},${a[1]},${a[2]},${a[3]},${b[0]},${b[1]},${b[2]},${b[3]}`;
}

/**
 * Breadth-first search outwards from the starting spectre, calling `callback`
 * on each newly discovered tile. A `false` return means "outside the target
 * area": that tile is not emitted and is not explored through.
 *
 * Note that a rejected tile is deliberately **not** recorded as visited, so it
 * can be rediscovered and re-tested from another neighbour. Upstream does the
 * same, and the retest is cheap.
 */
export function spectreGenerate(
  ctx: SpectreContext,
  callback: (spec: Spectre) => boolean,
): void {
  const placed = new Set<string>();
  // Upstream's intrusive linked list, which is only ever appended to and walked
  // — so an array plus a cursor, growing as we go. Never `shift()`.
  const queue: Spectre[] = [];

  const initial = ctx.initialSpectre();
  placed.add(spectreKey(initial));
  if (callback(initial)) queue.push(initial);

  for (let cursor = 0; cursor < queue.length; cursor++) {
    const spec = queue[cursor];

    for (let edge = 0; edge < SPECTRE_NVERTICES; edge++) {
      const sc = copyCoords(spec.sc);
      const dstEdge = ctx.step(sc, edge);
      const next: Spectre = {
        vertices: spectrePlace(
          spec.vertices[(edge + 1) % SPECTRE_NVERTICES],
          spec.vertices[edge],
          dstEdge,
        ),
        sc,
      };

      const key = spectreKey(next);
      if (placed.has(key)) continue;
      if (!callback(next)) continue;

      placed.add(key);
      queue.push(next);
    }
  }
}

// ---------------------------------------------------------------------------
// Patch parameters: the desc, in structured form.
// ---------------------------------------------------------------------------

/**
 * Everything needed to reproduce a patch: where the central spectre sits in the
 * substitution hierarchy, and which way up it is.
 *
 * `coords[0]` is the spectre's index within its innermost hexagon; `coords[i]`
 * for `i ≥ 1` is that hexagon-level's index within the next one out. Every
 * value is a single decimal digit (the largest legal range is 0–7).
 */
export interface SpectrePatchParams {
  /** 0–11, in twelfths of a turn, 0 being head-upwards. */
  orientation: number;
  coords: number[];
  /** One of `GDJLXPSFY`: the type of the outermost recorded hexagon. */
  finalHex: string;
}

/**
 * Check a patch's coordinates are in range for their hexagon types. Returns an
 * error message, or `null` when acceptable.
 *
 * Walks from the outermost recorded level inwards, because each level's legal
 * range depends on the type of the level above it, which in turn depends on
 * that level's own index.
 */
export function spectreParamsInvalid(params: SpectrePatchParams): string | null {
  if (params.coords.length === 0) return "expected at least one numeric coordinate";
  if (!spectreValidHexLetter(params.finalHex)) return "invalid final hexagon type";

  let h = hexFromLetter(params.finalHex);
  for (let i = params.coords.length - 1; i >= 0; i--) {
    // Level 0 addresses a spectre inside a hexagon; every level above addresses
    // a hexagon inside a hexagon, and those have different counts.
    const limit = i === 0 ? numSpectres(h) : numSubhexes(h);
    if (params.coords[i] >= limit) return "coordinate out of range";
    if (i > 0) h = HEX_DATA[h].subhexes[params.coords[i]];
  }

  return null;
}

// ---------------------------------------------------------------------------
// The bounded patch: generation and replay.
// ---------------------------------------------------------------------------

/**
 * One tile handed to a caller: fourteen vertices, each as four integers
 * `[xRational, xRootThree, yRational, yRootThree]` denoting the exact
 * coordinate `a + b√3`.
 *
 * The unit of measurement is 1/(2√2) of a spectre edge, i.e. an edge at 45°
 * spans the vector (2, 2).
 */
export type SpectreTileCoords = number[];

/** The half-open box a tile must lie entirely within to be kept. */
interface Bounds {
  xoff: number;
  yoff: number;
  xmin: Coord;
  xmax: Coord;
  ymin: Coord;
  ymax: Coord;
}

function boundsFor(w: number, h: number): Bounds {
  // C integer division; w and h are positive here, but truncation is the rule
  // this port follows everywhere.
  const xoff = Math.trunc(w / 2);
  const yoff = Math.trunc(h / 2);
  return {
    xoff,
    yoff,
    xmin: { c1: -xoff, cr3: 0 },
    xmax: { c1: -xoff + w, cr3: 0 },
    ymin: { c1: yoff - h, cr3: 0 },
    ymax: { c1: yoff, cr3: 0 },
  };
}

/**
 * Convert a placed spectre to output coordinates, or return `null` if any
 * vertex falls outside `bounds`.
 *
 * This is the tiling→grid boundary: exact ℤ[d] arithmetic stops here and
 * integers headed for pixels begin. **It is therefore the one place negative
 * zero is normalised.** The y axis is flipped (screens count downwards), so
 * `-y.cr3` produces `-0` whenever `y.cr3` is `0` — a value that compares equal
 * to `0` under `===`, keys identically in a `Map`, and stringifies the same, so
 * it can travel all the way into a dot coordinate and produce a grid that is
 * structurally perfect and still not what the C built. Normalising once, here,
 * beats scattering `|| 0` through arithmetic where it is easy to under-apply
 * and impossible to review.
 */
function tileCoords(spec: Spectre, bounds: Bounds): SpectreTileCoords | null {
  const out: number[] = new Array(4 * SPECTRE_NVERTICES);

  for (let i = 0; i < SPECTRE_NVERTICES; i++) {
    const p = spec.vertices[i];
    const x = pointX(p);
    const y = pointY(p);
    if (
      coordCmp(x, bounds.xmin) < 0 ||
      coordCmp(x, bounds.xmax) > 0 ||
      coordCmp(y, bounds.ymin) < 0 ||
      coordCmp(y, bounds.ymax) > 0
    ) {
      return null;
    }

    // `+ 0` normalises -0 to +0 and is a no-op for every other value.
    out[4 * i + 0] = bounds.xoff + x.c1 + 0;
    out[4 * i + 1] = x.cr3 + 0;
    out[4 * i + 2] = bounds.yoff - y.c1 + 0;
    out[4 * i + 3] = -y.cr3 + 0;
  }

  return out;
}

/**
 * Invent a patch of spectre tiling covering a `w × h` area and return the
 * parameters that reproduce it.
 *
 * The tiles themselves are discarded — the search runs purely to discover how
 * deep the substitution hierarchy has to go, which is what the desc records.
 */
export function spectreTilingRandomise(
  w: number,
  h: number,
  rs: RandomState,
): SpectrePatchParams {
  const bounds = boundsFor(w, h);
  const ctx = SpectreContext.random(rs);
  spectreGenerate(ctx, (spec) => tileCoords(spec, bounds) !== null);

  const proto = ctx.prototype;
  const coords = [proto.index];
  // The topmost level's index is never recorded: it is undecided by
  // construction, and replay re-derives or re-invents it.
  for (let i = 1; i < proto.c.length; i++) coords.push(proto.c[i - 1].index);

  return {
    orientation: ctx.orientation,
    coords,
    finalHex: hexToLetter(proto.c[proto.c.length - 1].type),
  };
}

/**
 * Regenerate the patch `params` describes, calling `callback` with each tile
 * that lies entirely within the `w × h` area, in breadth-first order from the
 * centre outwards.
 *
 * Returns the number of hierarchy levels the replay actually needed. When that
 * exceeds `params.coords.length` the desc ran out and the `"dummy"` fallback in
 * {@link SpectreContext} supplied the rest — see its documentation for why that
 * matters. Callers building a grid ignore this; it exists so a test can *prove*
 * it is exercising that path rather than assuming so.
 */
export function spectreTilingGenerate(
  params: SpectrePatchParams,
  w: number,
  h: number,
  callback: (coords: SpectreTileCoords) => void,
): number {
  const bounds = boundsFor(w, h);
  const ctx = SpectreContext.fromParams(params);
  spectreGenerate(ctx, (spec) => {
    const coords = tileCoords(spec, bounds);
    if (coords === null) return false;
    callback(coords);
    return true;
  });
  return ctx.prototype.c.length;
}
