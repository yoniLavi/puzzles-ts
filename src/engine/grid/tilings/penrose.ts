/**
 * Penrose P2 (kite/dart) and P3 (thick/thin rhomb) tilings, generated via
 * **combinatorial coordinates** — the idiomatic TS port of upstream
 * `penrose.c` + `penrose-internal.h`.
 *
 * Simon Tatham's write-up of the algorithm is the reference:
 * https://www.chiark.greenend.org.uk/~sgtatham/quasiblog/aperiodic-tilings/
 *
 * ## The idea in one paragraph
 *
 * Every Penrose tile is two mirror-image triangles glued along a shared edge.
 * A triangle is located not by coordinates but by a *string of letters*: the
 * first says which half-tile it is, the second which half-tile of the larger
 * "parent" tile it sits inside, and so on outwards for ever. Stepping across
 * an edge to the neighbouring triangle is then a lookup in {@link TRANSITIONS}
 * — and when the step leaves the parent entirely, a recursion one level up
 * followed by {@link TRANSITIONS_IN} to come back down. The string is grown
 * lazily and *randomly*: the tiling has no origin, so what lies above the
 * current top level is genuinely a free choice, made once and then recorded in
 * the grid description so it can be replayed.
 *
 * The letter alphabet, from upstream's comment: for P2, acute isosceles
 * triangles (half-kites) are `A`,`B` and obtuse ones (half-darts) `U`,`V`; for
 * P3, acute (half a thin rhomb) are `C`,`D` and obtuse (half a thick rhomb)
 * `X`,`Y`. Edges are numbered anticlockwise around a triangle, 0 being the
 * base and 1,2 the two equal legs.
 *
 * ## What the grid glue owns
 *
 * This module is `penrose.c` only: it knows nothing of pixels, units or
 * `Grid`. It emits tile corners as exact `Coord` values (`a + b√5`), and
 * `penrose-grid.ts` — the `grid.c` side — scales them into grid coordinates.
 *
 * ## Rules that must not be "tidied"
 *
 * 1. **{@link chooseRandom} always draws**, even from a one-entry list. A
 *    random draw is an observable side effect: skipping it desynchronises the
 *    stream and yields a different — entirely valid, entirely plausible —
 *    tiling, with nothing asserting.
 * 2. **The weights are verbatim Fibonacci integers**, not recomputed from √5.
 * 3. **{@link PenroseContext.extendCoords}'s `"dummy"` fallback** is a
 *    bit-exact replay target; see its doc comment.
 * 4. **The two transition tables are hand-transcribed control flow**, keyed on
 *    a string-literal `Letter` union so TypeScript checks the transcription
 *    exhaustively. That exhaustiveness is the main defence against a typo.
 */

import { type RandomState, randomNew, randomUpto } from "../../random/index.ts";

// ---------------------------------------------------------------------------
// Letters and the shape of the metatile hierarchy.
// ---------------------------------------------------------------------------

/**
 * Which half-tile types may appear as a child of each half-tile type — i.e.
 * the subdivision rule, as a type.
 *
 * This exists to make {@link TRANSITIONS} *exhaustively* type-checked in both
 * dimensions: a missing parent, a missing child, or a child that does not
 * belong to that parent is a compile error rather than a runtime `FAIL` found
 * by a differential three days later.
 */
interface Children {
  A: "A" | "B" | "U";
  B: "A" | "B" | "V";
  U: "B" | "U";
  V: "A" | "V";
  C: "C" | "Y";
  D: "D" | "X";
  X: "C" | "X" | "Y";
  Y: "D" | "X" | "Y";
}

/** A half-tile type. `A`,`B`,`U`,`V` are P2; `C`,`D`,`X`,`Y` are P3. */
export type Letter = keyof Children;

/** Every half-tile type, both tilings. Exported so a test can enumerate the
 * transition tables and check the transcription is complete. */
export const PENROSE_LETTERS: readonly Letter[] = [
  "A",
  "B",
  "U",
  "V",
  "C",
  "D",
  "X",
  "Y",
];

/** Which Penrose tiling: P2 is kites and darts, P3 thick and thin rhombs. */
export type PenroseWhich = "p2" | "p3";

/** The half-tile types legal in each tiling (upstream `penrose_valid_letter`). */
const LETTERS_FOR: Record<PenroseWhich, readonly Letter[]> = {
  p2: ["A", "B", "U", "V"],
  p3: ["C", "D", "X", "Y"],
};

/** Is `c` a half-tile letter of this tiling? Narrows for desc parsing. */
export function penroseValidLetter(c: string, which: PenroseWhich): c is Letter {
  return (LETTERS_FOR[which] as readonly string[]).includes(c);
}

/**
 * Which half-tile types a given type may sit inside. Upstream's
 * `penrose_valid_parents` returns `NULL` for an unrecognised letter and the
 * caller feeds that straight to `strchr` — safe there only because
 * `penrose_valid_letter` happens to run first in the same loop iteration. A
 * `Record<Letter, …>` is **total** by construction, so the ordering of those
 * two checks stops being load-bearing.
 */
const VALID_PARENTS: Record<Letter, readonly Letter[]> = {
  A: ["A", "B", "V"],
  B: ["A", "B", "U"],
  U: ["A", "U"],
  V: ["B", "V"],
  C: ["C", "X"],
  D: ["D", "Y"],
  X: ["D", "X", "Y"],
  Y: ["C", "X", "Y"],
};

/** May `child` sit directly inside `parent`? (Upstream's `strchr` test.) */
function penroseValidParent(parent: Letter, child: Letter): boolean {
  return VALID_PARENTS[child].includes(parent);
}

/**
 * The edge along which a half-tile is glued to its mirror image to form a
 * whole tile. Upstream `penrose_sibling_edge_index`.
 */
function siblingEdgeIndex(c: Letter): number {
  switch (c) {
    case "A":
    case "U":
      return 2;
    case "B":
    case "V":
      return 1;
    default:
      return 0;
  }
}

// ---------------------------------------------------------------------------
// Exact arithmetic in ℤ[t], where t = exp(iπ/5).
// ---------------------------------------------------------------------------

/**
 * A point in the plane, as an integer linear combination of `{1, t, t², t³}`
 * where `t = exp(iπ/5)` is a tenth of a turn about the origin. A `Point` is
 * really a complex number, so points add, subtract and multiply.
 *
 * Coefficients may carry **negative zero** — `pointMulByT` negates, and
 * multiplication by a zero coefficient produces `-0`. That is harmless
 * *inside* this module (`-0 === 0`, and `` `${-0}` === "0" `` so it cannot
 * split a visited-set key), and it is deliberately normalised at one reviewable
 * choke point instead: the tiling→grid callback in `penrose-grid.ts`, per the
 * change's D8. Do not sprinkle `|| 0` through the arithmetic here.
 */
type Point = readonly [number, number, number, number];

const ORIGIN: Point = [0, 0, 0, 0];

function pointAdd(a: Point, b: Point): Point {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2], a[3] + b[3]];
}

function pointSub(a: Point, b: Point): Point {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2], a[3] - b[3]];
}

/**
 * Multiply by `t`, reducing with the identity `t⁴ - t³ + t² - t + 1 = 0`
 * (the tenth cyclotomic polynomial), i.e. `t⁴ = t³ - t² + t - 1`.
 */
function pointMulByT(x: Point): Point {
  return [-x[3], x[0] + x[3], x[1] - x[3], x[2] + x[3]];
}

/** Complex multiplication, by Horner's rule in powers of `t`. */
function pointMul(a: Point, b: Point): Point {
  // Start with `a` scaled by b's t³ term, then iterate r = t·r + (next
  // coefficient down).
  let r: Point = [a[0] * b[3], a[1] * b[3], a[2] * b[3], a[3] * b[3]];
  for (let i = 2; i >= 0; i--) {
    const t = pointMulByT(r);
    r = [
      a[0] * b[i] + t[0],
      a[1] * b[i] + t[1],
      a[2] * b[i] + t[2],
      a[3] * b[i] + t[3],
    ];
  }
  return r;
}

/**
 * The rotation by `s` tenths of a turn about the origin, by binary
 * exponentiation of `t`.
 */
function pointRot(sIn: number): Point {
  let r: Point = [1, 0, 0, 0];
  let tpower: Point = [0, 1, 0, 0];

  // Reduce to a sensible range. C's `%` truncates toward zero and so does
  // JS's, so this pair of lines is *already* a floor-mod for the negative
  // case — do not "fix" it into `((s % 10) + 10) % 10`, which is the same
  // thing spelled longer, nor into `Math.floor`-based arithmetic.
  let s = sIn % 10;
  if (s < 0) s += 10;

  while (true) {
    if (s & 1) r = pointMul(r, tpower);
    s >>= 1;
    if (!s) break;
    tpower = pointMul(tpower, tpower);
  }
  return r;
}

/**
 * One Cartesian component of a point, as the exact value `c1 + cr5·√5`.
 *
 * The two components use different scale units (x is in units of 1/4, y in
 * units of sin(π/5)/2) — see `penrose.h`. Reconciling those is the grid glue's
 * job, not this module's.
 */
export interface Coord {
  readonly c1: number;
  readonly cr5: number;
}

/** The x component of a point, in units of 1/4. */
function pointX(p: Point): Coord {
  return { c1: 4 * p[0] + p[1] - p[2] + p[3], cr5: p[1] + p[2] - p[3] };
}

/** The y component of a point, in units of sin(π/5)/2. */
function pointY(p: Point): Coord {
  return { c1: 2 * p[1] + p[2] + p[3], cr5: p[2] + p[3] };
}

/**
 * The sign of `c1 + cr5·√5`, computed exactly.
 *
 * When the two terms disagree in sign the comparison `c1² > 5·cr5²` decides
 * it. **These squares deliberately stay JS doubles — no `| 0`, no
 * `Math.imul`.** In C they are `int` multiplications that can overflow for a
 * large enough patch (a real, if remote, upstream fragility); JS numbers are
 * exact to 2⁵³, far beyond anything a grid produces, so masking them to 32
 * bits would *introduce* the overflow this port naturally avoids.
 *
 * This inverts the usual rule for this port, which is to match C's integer
 * semantics. The difference is that this is a *predicate on exact values*,
 * never a value that reaches a description or an RNG draw: nothing downstream
 * can observe the wider intermediate except by being right more often.
 */
function coordSign(x: Coord): number {
  if (x.c1 === 0 && x.cr5 === 0) return 0;
  if (x.c1 >= 0 && x.cr5 >= 0) return +1;
  if (x.c1 <= 0 && x.cr5 <= 0) return -1;

  if (x.c1 * x.c1 > 5 * x.cr5 * x.cr5) return x.c1 < 0 ? -1 : +1;
  return x.cr5 < 0 ? -1 : +1;
}

/** Compare two exact coordinates: negative, zero or positive as `a` ⋛ `b`. */
function coordCmp(a: Coord, b: Coord): number {
  return coordSign({ c1: a.c1 - b.c1, cr5: a.cr5 - b.cr5 });
}

// ---------------------------------------------------------------------------
// The transition tables: hand-transcribed from penrose.c's two nested
// switches. This is the one place in the change a human types the data.
// ---------------------------------------------------------------------------

/**
 * The result of attempting to step out of a triangle across one of its edges.
 *
 * `internal` means we moved to a different child of the same parent, and gives
 * the new triangle's type plus which of *its* edges we came in through.
 * `external` means we left the parent entirely, and gives which edge of the
 * parent we left by — plus, if that edge is divided in two, which end of it
 * (`-1` left, `+1` right; `0` when the edge is undivided).
 *
 * Upstream has a third variant, `FAIL`, for a child type that does not exist
 * in that parent or an `end` inconsistent with whether the edge is divided.
 * It "shouldn't ever come up" and upstream asserts on it in production, so
 * here it is a thrown {@link PenroseTransitionError} rather than a value —
 * which also keeps every call site free of a case it can do nothing with.
 */
export type TransitionResult =
  | { readonly kind: "internal"; readonly newChild: Letter; readonly newEdge: number }
  | {
      readonly kind: "external";
      readonly parentEdge: number;
      readonly end: -1 | 0 | 1;
    };

/** Raised where upstream's `assert(tr.type == INTERNAL)` would fire. */
export class PenroseTransitionError extends Error {
  constructor(message: string) {
    super(`penrose: ${message}`);
    this.name = "PenroseTransitionError";
  }
}

type Internal = Extract<TransitionResult, { kind: "internal" }>;

function internal(newChild: Letter, newEdge: number): Internal {
  return { kind: "internal", newChild, newEdge };
}

function external(parentEdge: number, end: -1 | 0 | 1): TransitionResult {
  return { kind: "external", parentEdge, end };
}

/**
 * Stepping **out** of a triangle: `TRANSITIONS[parent][child][edge]`, where
 * `child` is the current triangle's type, `parent` the type it sits inside,
 * and `edge` (0, 1 or 2) the edge we are crossing.
 *
 * Transcribed from `penrose.c:100-266` (60 leaves). The mapped type below
 * makes the transcription exhaustive: every parent must appear, every parent
 * must list exactly the children {@link Children} allows it, and every child
 * must give all three edges.
 *
 * Upstream's inner `switch (edge)` blocks have **no `default`**, so an
 * out-of-range edge silently falls through into the *next child's* dispatch.
 * That is unreachable in practice (edges are always 0-2); the lookup below
 * throws instead of reproducing the fallthrough.
 */
const TRANSITIONS: {
  [P in Letter]: {
    [C in Children[P]]: readonly [TransitionResult, TransitionResult, TransitionResult];
  };
} = {
  A: {
    A: [external(2, -1), external(0, 0), internal("B", 1)],
    B: [internal("U", 1), internal("A", 2), external(1, +1)],
    U: [external(2, +1), internal("B", 0), external(1, -1)],
  },
  B: {
    A: [internal("V", 2), external(2, -1), internal("B", 1)],
    B: [external(1, +1), internal("A", 2), external(0, 0)],
    V: [external(1, -1), external(2, +1), internal("A", 0)],
  },
  U: {
    B: [internal("U", 1), external(2, 0), external(0, +1)],
    U: [external(1, 0), internal("B", 0), external(0, -1)],
  },
  V: {
    A: [internal("V", 2), external(0, -1), external(1, 0)],
    V: [external(2, 0), external(0, +1), internal("A", 0)],
  },
  C: {
    C: [external(1, +1), internal("Y", 1), external(0, 0)],
    Y: [external(2, 0), internal("C", 1), external(1, -1)],
  },
  D: {
    D: [external(2, -1), external(0, 0), internal("X", 2)],
    X: [external(1, 0), external(2, +1), internal("D", 2)],
  },
  X: {
    C: [external(2, +1), internal("Y", 1), internal("X", 1)],
    X: [external(1, 0), internal("C", 2), external(0, -1)],
    Y: [external(0, +1), internal("C", 1), external(2, -1)],
  },
  Y: {
    D: [external(1, -1), internal("Y", 2), internal("X", 2)],
    X: [external(0, -1), external(1, +1), internal("D", 2)],
    Y: [external(2, 0), external(0, +1), internal("D", 1)],
  },
};

/**
 * Stepping **into** a parent triangle, after a step out reported `external`
 * and the recursion found which parent we landed in.
 * `TRANSITIONS_IN[parent][edge][end]`. Coming inwards, the answer is always an
 * `internal` result.
 *
 * Transcribed from `penrose.c:275-361` (36 leaves). Upstream flattens
 * `(edge, end)` into a single `EDGEEND = 3·edge + 1 + end` switch; keeping the
 * two levels apart here reads back against the C directly and lets the
 * per-edge shape (divided into two ends, or a single undivided `0`) show
 * itself. An absent combination is upstream's `FAIL`, and throws.
 */
const TRANSITIONS_IN: {
  [P in Letter]: {
    readonly [E in 0 | 1 | 2]?: {
      readonly "-1"?: Internal;
      readonly "0"?: Internal;
      readonly "+1"?: Internal;
    };
  };
} = {
  A: {
    0: { "0": internal("A", 1) },
    1: { "-1": internal("B", 2), "+1": internal("U", 2) },
    2: { "-1": internal("U", 0), "+1": internal("A", 0) },
  },
  B: {
    0: { "0": internal("B", 2) },
    1: { "-1": internal("B", 0), "+1": internal("V", 0) },
    2: { "-1": internal("V", 1), "+1": internal("A", 1) },
  },
  U: {
    0: { "-1": internal("B", 2), "+1": internal("U", 2) },
    1: { "0": internal("U", 0) },
    2: { "0": internal("B", 1) },
  },
  V: {
    0: { "-1": internal("V", 1), "+1": internal("A", 1) },
    1: { "0": internal("A", 2) },
    2: { "0": internal("V", 0) },
  },
  C: {
    0: { "0": internal("C", 2) },
    1: { "-1": internal("C", 0), "+1": internal("Y", 2) },
    2: { "0": internal("Y", 0) },
  },
  D: {
    0: { "0": internal("D", 1) },
    1: { "0": internal("X", 0) },
    2: { "-1": internal("X", 1), "+1": internal("D", 0) },
  },
  X: {
    0: { "-1": internal("Y", 0), "+1": internal("X", 2) },
    1: { "0": internal("X", 0) },
    2: { "-1": internal("C", 0), "+1": internal("Y", 2) },
  },
  Y: {
    0: { "-1": internal("Y", 1), "+1": internal("X", 0) },
    1: { "-1": internal("X", 1), "+1": internal("D", 0) },
    2: { "0": internal("Y", 0) },
  },
};

/** Look up a step out of `child` (inside `parent`) across `edge`. */
export function transition(
  parent: Letter,
  child: Letter,
  edge: number,
): TransitionResult {
  if (edge !== 0 && edge !== 1 && edge !== 2) {
    throw new PenroseTransitionError(`edge ${edge} out of range`);
  }
  const row: Partial<Record<Letter, readonly TransitionResult[]>> = TRANSITIONS[parent];
  const entry = row[child];
  if (entry === undefined) {
    throw new PenroseTransitionError(`${child} is not a child of ${parent}`);
  }
  return entry[edge] as TransitionResult;
}

/** Look up a step into `parent` through `edge` at `end`. */
export function transitionIn(parent: Letter, edge: number, end: -1 | 0 | 1): Internal {
  const byEdge: { readonly [E in 0 | 1 | 2]?: Partial<Record<string, Internal>> } =
    TRANSITIONS_IN[parent];
  const ends = edge === 0 || edge === 1 || edge === 2 ? byEdge[edge] : undefined;
  const result = ends?.[end === 0 ? "0" : end < 0 ? "-1" : "+1"];
  if (result === undefined) {
    throw new PenroseTransitionError(
      `no way into ${parent} through edge ${edge} at end ${end}`,
    );
  }
  return result;
}

// ---------------------------------------------------------------------------
// Triangle geometry.
// ---------------------------------------------------------------------------

/**
 * How the direction of travel turns after traversing each edge, walking a
 * triangle's boundary. Multiplying the current edge vector by this gives the
 * next one, which is what makes {@link place} a three-line loop.
 */
const ACUTE_POST_EDGE: readonly Point[] = [
  [-1, 1, 0, 1], // phi * t^3
  [-1, 1, -1, 1], // t^4
  [-1, 1, 0, 0], // 1/phi * t^3
];
const OBTUSE_POST_EDGE: readonly Point[] = [
  [0, -1, 1, 0], // 1/phi * t^4
  [0, 0, 1, 0], // t^2
  [-1, 0, 0, 1], // phi * t^4
];

function postEdge(c: Letter, edge: number): Point {
  switch (c) {
    case "A":
    case "B":
    case "C":
    case "D":
      return ACUTE_POST_EDGE[edge];
    default:
      return OBTUSE_POST_EDGE[edge];
  }
}

const ONE: Point = [1, 0, 0, 0];
const PHI: Point = [1, 0, 1, -1];
const INV_PHI: Point = [0, 0, 1, -1];

/**
 * The length of edge 0 (the base) of each triangle type, as a vector along the
 * positive real axis.
 *
 * P2: unit-length edges are the long ones — edges 1,2 of A,B and edge 0 of
 * U,V — so A,B have a short base. P3: unit-length edges are edges 1,2 of
 * everything, so C,D have a short base and X,Y a long one.
 */
function edge0Length(c: Letter): Point {
  switch (c) {
    case "A":
    case "B":
    case "C":
    case "D":
      return INV_PHI;
    case "U":
    case "V":
      return ONE;
    default:
      return PHI;
  }
}

/** A located half-tile: its three vertices, plus its combinatorial address. */
interface PenroseTriangle {
  /** Vertex `i` is the start of edge `i`, edges running anticlockwise. */
  vertices: [Point, Point, Point];
  /** Combinatorial coordinates, innermost first. Mutated by `step`. */
  readonly pc: Letter[];
  /** Set once this triangle has been emitted as half of a completed tile. */
  reported: boolean;
}

/**
 * Fill in all three vertices of a triangle from a single known edge: `u` is
 * the vertex at index `indexOfU` and `v` the next one round. Requires
 * `tri.pc[0]`, since the shape depends on the triangle's type.
 */
function place(tri: PenroseTriangle, u: Point, v: Point, indexOfU: number): void {
  let here = u;
  let delta = pointSub(v, u);
  for (let i = 0; i < 3; i++) {
    const edge = (indexOfU + i) % 3;
    tri.vertices[edge] = here;
    here = pointAdd(here, delta);
    delta = pointMul(delta, postEdge(tri.pc[0], edge));
  }
}

/**
 * The key under which a triangle is held in the visited set.
 *
 * Upstream's `penrose_cmp` compares only the first two vertices, "because
 * those force the rest" — so this key must too, or two descriptions of the
 * same triangle could fail to match. The tree's *ordering* is never observed
 * (membership is the only query), which is what lets a `Map` replace it
 * exactly.
 *
 * Negative-zero coefficients stringify as `"0"`, so they cannot split a key.
 */
function triangleKey(tri: PenroseTriangle): string {
  const [a, b] = tri.vertices;
  return `${a[0]},${a[1]},${a[2]},${a[3]}|${b[0]},${b[1]},${b[2]},${b[3]}`;
}

// ---------------------------------------------------------------------------
// The random choice of what lies above the current top-level metatile.
// ---------------------------------------------------------------------------

/**
 * Relative probability of each half-tile type appearing as a parent.
 *
 * Penrose tile probability ratios are always φ, approximated here by two
 * consecutive Fibonacci numbers. **Transcribe these integers verbatim**: they
 * are what the C build draws against, so recomputing them from √5 — however
 * "cleaner" — changes the RNG stream and therefore every generated tiling.
 */
const RELATIVE_PROBABILITY: Record<Letter, number> = {
  A: 63245986,
  B: 63245986,
  X: 63245986,
  Y: 63245986,
  C: 39088169,
  D: 39088169,
  U: 39088169,
  V: 39088169,
};

/**
 * Pick one of `possibilities` with probability proportional to its weight.
 *
 * **Never short-circuit the single-candidate case.** `randomUpto` advances the
 * random stream whether or not the answer was in doubt, so an `if (n === 1)
 * return possibilities[0]` fast path desynchronises everything drawn
 * afterwards. The failure is silent: the tiling that comes out is still a
 * perfectly valid Penrose tiling, just not the one the description names.
 */
function chooseRandom(possibilities: readonly Letter[], rng: RandomState): Letter {
  let limit = 0;
  for (const c of possibilities) limit += RELATIVE_PROBABILITY[c];

  let value = randomUpto(rng, limit);
  for (const c of possibilities) {
    const curr = RELATIVE_PROBABILITY[c];
    if (value < curr) return c;
    value -= curr;
  }
  throw new Error("penrose: probability overflow");
}

// ---------------------------------------------------------------------------
// The generation context.
// ---------------------------------------------------------------------------

/**
 * A patch of Penrose tiling, in the form recorded in a grid description: the
 * combinatorial coordinates of the starting triangle, which of its vertices
 * sits at the centre of the patch, and the orientation of its base edge in
 * tenths of a turn.
 */
export interface PenrosePatchParams {
  readonly startVertex: number;
  readonly orientation: number;
  readonly coords: readonly Letter[];
}

/**
 * A step out of a triangle may recurse one level up the metatile hierarchy,
 * and the hierarchy is grown lazily, so there is no structural bound. It is
 * nonetheless O(log area) in practice — a handful of levels for any grid we
 * generate. This cap only exists so a divergence that broke the recursion
 * fails loudly instead of exhausting the JS stack (or, worse, spinning
 * synchronously in a browser worker).
 */
const MAX_RECURSION_DEPTH = 100;

/**
 * The shared context of one run: the coordinates of the starting triangle,
 * extended outwards as the search needs more levels.
 *
 * Every other triangle's coordinates copy their higher-order letters *from
 * here*, so that once a choice about the enclosing metatile has been made it
 * stays consistent across the whole patch. That sharing is why the fallback
 * RNG below must extend `prototype` and not some per-triangle copy: a
 * per-triangle choice would produce a torn tiling.
 */
class PenroseContext {
  /** `null` only transiently: replaced by the `"dummy"` RNG on first need. */
  private rs: RandomState | null;
  readonly prototype: Letter[];
  readonly startVertex: number;
  readonly orientation: number;

  private constructor(
    rs: RandomState | null,
    prototype: Letter[],
    startVertex: number,
    orientation: number,
  ) {
    this.rs = rs;
    this.prototype = prototype;
    this.startVertex = startVertex;
    this.orientation = orientation;
  }

  /**
   * Invent a fresh patch. **The three draws happen in this order** — starting
   * tile, then start vertex, then orientation — and the order is part of the
   * description format's contract with the C.
   */
  static initRandom(rng: RandomState, which: PenroseWhich): PenroseContext {
    const first = chooseRandom(LETTERS_FOR[which], rng);
    const startVertex = randomUpto(rng, 3);
    const orientation = randomUpto(rng, 10);
    return new PenroseContext(rng, [first], startVertex, orientation);
  }

  /** Replay a patch recorded in a description. No RNG — see `extendCoords`. */
  static initFromParams(params: PenrosePatchParams): PenroseContext {
    return new PenroseContext(
      null,
      [...params.coords],
      params.startVertex,
      params.orientation,
    );
  }

  /** A copy of the starting triangle's coordinates. */
  initialCoords(): Letter[] {
    return [...this.prototype];
  }

  /**
   * Ensure `pc` has at least `n` levels of coordinates, growing the shared
   * prototype first if it is itself too short.
   *
   * ## The `"dummy"` fallback
   *
   * When replaying a stored description there is no random state, yet the
   * search can still ask for a level the description never recorded — most
   * plainly when a desc generated for one `w`/`h` is replayed at a larger one.
   * Upstream's answer (and spectre.c's) is to conjure a *deterministic* RNG at
   * that moment: the obvious fixed choice risks unbounded recursion in the
   * step function, and a fixed-seed PRNG breaks the symmetry without that
   * risk.
   *
   * All three details here are load-bearing, and getting any of them wrong is
   * **silent** — the result is a valid, self-consistent patch that simply is
   * not the one the description names, so a saved Loopy game reloads with its
   * clues on the wrong faces:
   *
   * - the seed is the four-character string `"dummy"` (C's `random_new("dummy",
   *   5)` passes the *byte length*, not a second seed component);
   * - it is created **lazily, here**, not eagerly at context construction — an
   *   RNG created earlier and used later has drawn different bytes;
   * - it is **shared** by every later extension, not recreated per call.
   */
  extendCoords(pc: Letter[], n: number): void {
    while (this.prototype.length < n) {
      if (this.rs === null) this.rs = randomNew("dummy");
      const innermost = this.prototype[this.prototype.length - 1];
      this.prototype.push(chooseRandom(VALID_PARENTS[innermost], this.rs));
    }
    while (pc.length < n) pc.push(this.prototype[pc.length]);
  }

  /**
   * Step across `edge` of the triangle at `pc`, rewriting `pc` in place to the
   * neighbour's coordinates and returning which of *its* edges we entered by.
   */
  step(pc: Letter[], edge: number): number {
    return this.stepRecurse(pc, 0, edge);
  }

  private stepRecurse(pc: Letter[], depth: number, edge: number): number {
    if (depth > MAX_RECURSION_DEPTH) {
      throw new PenroseTransitionError(
        `step recursed past depth ${MAX_RECURSION_DEPTH}`,
      );
    }
    this.extendCoords(pc, depth + 2);

    let tr = transition(pc[depth + 1], pc[depth], edge);

    if (tr.kind === "external") {
      // We left the parent. Recurse to find which triangle we landed in one
      // size up, then come back down into the right child of it.
      const parentOutEdge = this.stepRecurse(pc, depth + 1, tr.parentEdge);
      // NOTE: `pc[depth + 1]` is re-read *after* the recursion, which has just
      // rewritten it — the parent we are entering is generally not the parent
      // we left. Hoisting this read above the recursive call is a subtle and
      // entirely silent bug.
      tr = transitionIn(pc[depth + 1], parentOutEdge, tr.end);
    }

    if (tr.kind !== "internal") {
      throw new PenroseTransitionError("step ended outside any parent");
    }
    pc[depth] = tr.newChild;
    return tr.newEdge;
  }

  /** The starting triangle, oriented and translated as the context says. */
  initialTriangle(): PenroseTriangle {
    const type = this.prototype[0];
    const tri: PenroseTriangle = {
      vertices: [ORIGIN, ORIGIN, ORIGIN],
      pc: this.initialCoords(),
      reported: false,
    };

    // Orient the triangle by deciding what vector edge 0 traverses, place it
    // anywhere in that orientation, then translate the chosen vertex to the
    // origin.
    const edge0 = pointMul(edge0Length(type), pointRot(this.orientation));
    place(tri, ORIGIN, edge0, 0);

    const negOffset = tri.vertices[this.startVertex];
    tri.vertices = [
      pointSub(tri.vertices[0], negOffset),
      pointSub(tri.vertices[1], negOffset),
      pointSub(tri.vertices[2], negOffset),
    ];
    return tri;
  }

  /** The triangle across `srcEdge` from `srcTri`. */
  adjacentTriangle(srcTri: PenroseTriangle, srcEdge: number): PenroseTriangle {
    const dst: PenroseTriangle = {
      vertices: [ORIGIN, ORIGIN, ORIGIN],
      pc: [...srcTri.pc],
      reported: false,
    };
    const dstEdge = this.step(dst.pc, srcEdge);
    // The shared edge runs the opposite way round the neighbour, so its ends
    // swap: our edge's far vertex is the neighbour's near one.
    place(dst, srcTri.vertices[(srcEdge + 1) % 3], srcTri.vertices[srcEdge], dstEdge);
    return dst;
  }
}

// ---------------------------------------------------------------------------
// Breadth-first generation of a patch.
// ---------------------------------------------------------------------------

/** One corner of an emitted tile, in exact (but differently-scaled) units. */
export interface PenroseTileVertex {
  readonly x: Coord;
  readonly y: Coord;
}

/** The bounding box a patch is generated into, in the same exact units. */
interface Bounds {
  readonly xOff: number;
  readonly yOff: number;
  readonly xMin: Coord;
  readonly xMax: Coord;
  readonly yMin: Coord;
  readonly yMax: Coord;
}

/** Upstream `penrose_set_bounds`: a `w × h` box centred on the origin. */
function setBounds(w: number, h: number): Bounds {
  const xOff = Math.trunc(w / 2);
  const yOff = Math.trunc(h / 2);
  return {
    xOff,
    yOff,
    xMin: { c1: -xOff, cr5: 0 },
    xMax: { c1: -xOff + w, cr5: 0 },
    yMin: { c1: yOff - h, cr5: 0 },
    yMax: { c1: yOff, cr5: 0 },
  };
}

/**
 * Is the whole triangle inside the box?
 *
 * Fully conjunctive over all three vertices, so a triangle straddling the
 * boundary is rejected *whole* and never explored through. That is what leaves
 * the patch with a ragged fringe, and why `gridTrimVigorously` has to run
 * afterwards.
 */
function inBounds(b: Bounds, tri: PenroseTriangle): boolean {
  for (const v of tri.vertices) {
    const x = pointX(v);
    const y = pointY(v);
    if (
      coordCmp(x, b.xMin) < 0 ||
      coordCmp(x, b.xMax) > 0 ||
      coordCmp(y, b.yMin) < 0 ||
      coordCmp(y, b.yMax) > 0
    ) {
      return false;
    }
  }
  return true;
}

/**
 * Breadth-first search the whole box, reporting each complete tile once.
 *
 * The queue is an **array with an advancing cursor**, never `shift()`:
 * upstream's is an intrusive linked list that is only ever appended to and
 * walked, so nothing is dequeued and the array grows during its own iteration.
 *
 * The visited set holds the triangle **objects**, not copies — the pairing
 * rule below mutates `reported` on a triangle found in the set.
 */
function generate(
  ctx: PenroseContext,
  bounds: Bounds,
  tile: (vertices: readonly PenroseTileVertex[]) => void,
): void {
  const placed = new Map<string, PenroseTriangle>();
  const queue: PenroseTriangle[] = [];

  const first = ctx.initialTriangle();
  placed.set(triangleKey(first), first);
  // If the seed triangle is already out of bounds the queue stays empty and no
  // tile is ever emitted. That happens for small patches, and it is upstream's
  // behaviour too (it then aborts in `dsf_new(0)`); here the empty grid is
  // caught by `gridTrimVigorously`, which is the better failure.
  if (inBounds(bounds, first)) queue.push(first);

  for (let i = 0; i < queue.length; i++) {
    const tri = queue[i];
    const siblingEdge = siblingEdgeIndex(tri.pc[0]);

    for (let edge = 0; edge < 3; edge++) {
      const neighbour = ctx.adjacentTriangle(tri, edge);
      if (!inBounds(bounds, neighbour)) continue;

      const found = placed.get(triangleKey(neighbour));
      if (found !== undefined) {
        /*
         * We have met a triangle we already know. If we reached it across our
         * *sibling* edge then it is the other half of our own tile, and — this
         * being the branch where both halves are known to be in bounds and in
         * the set — the tile is complete and can be emitted.
         *
         * Both `reported` flags are tested, and that symmetry is the point: it
         * makes the emission independent of which half the search reached
         * first, so the tile comes out the same regardless of BFS order.
         */
        if (edge === siblingEdge && !tri.reported && !found.reported) {
          // Recompute the sibling edge for the *other* half. The two halves of
          // a tile are frequently different letters (an A pairs with a B), so
          // reusing `siblingEdge` here would take the wrong two corners.
          const foundSiblingEdge = siblingEdgeIndex(found.pc[0]);
          // The four corners in this order are the tile's boundary, walked
          // from our half round to the other's. The winding is observable
          // through dot indices downstream — do not sort or normalise it.
          tile([
            vertexOf(tri.vertices[(siblingEdge + 1) % 3], bounds),
            vertexOf(tri.vertices[(siblingEdge + 2) % 3], bounds),
            vertexOf(found.vertices[(foundSiblingEdge + 1) % 3], bounds),
            vertexOf(found.vertices[(foundSiblingEdge + 2) % 3], bounds),
          ]);
          tri.reported = true;
          found.reported = true;
        }
        continue;
      }

      placed.set(triangleKey(neighbour), neighbour);
      queue.push(neighbour);
    }
  }
}

/** Upstream `really_output_tile`: shift the patch's centre back to the box. */
function vertexOf(p: Point, bounds: Bounds): PenroseTileVertex {
  const x = pointX(p);
  const y = pointY(p);
  return {
    x: { c1: x.c1 + bounds.xOff, cr5: x.cr5 },
    y: { c1: y.c1 + bounds.yOff, cr5: y.cr5 },
  };
}

// ---------------------------------------------------------------------------
// Public entry points (upstream penrose.h).
// ---------------------------------------------------------------------------

/**
 * Invent a patch of tiling big enough to fill a `w × h` area, and return the
 * parameters that reproduce it.
 *
 * The entire search runs here with **no output callback at all**. That is not
 * a wasted pass: the search is what forces the metatile hierarchy to grow, and
 * `ctx.prototype`'s final depth is precisely what the description has to
 * record. Skipping it (or short-circuiting it once some tile count is reached)
 * would record too few coordinates, and replay would then invent the missing
 * ones from the `"dummy"` RNG instead.
 */
export function penroseTilingRandomise(
  which: PenroseWhich,
  w: number,
  h: number,
  rng: RandomState,
): PenrosePatchParams {
  const bounds = setBounds(w, h);
  const ctx = PenroseContext.initRandom(rng, which);
  generate(ctx, bounds, () => {});

  return {
    orientation: ctx.orientation,
    startVertex: ctx.startVertex,
    coords: [...ctx.prototype],
  };
}

/** Replay a recorded patch, passing each tile's four corners to `cb`. */
export function penroseTilingGenerate(
  params: PenrosePatchParams,
  w: number,
  h: number,
  cb: (vertices: readonly PenroseTileVertex[]) => void,
): void {
  generate(PenroseContext.initFromParams(params), setBounds(w, h), cb);
}

/**
 * Check that a patch's coordinates are legal: at least one letter, every
 * letter belonging to this tiling, and every consecutive pair a legal
 * child→parent step. Returns an error message, or `null` if acceptable.
 */
export function penroseTilingParamsInvalid(
  params: PenrosePatchParams,
  which: PenroseWhich,
): string | null {
  if (params.coords.length === 0) return "expected at least one coordinate";

  for (let i = 0; i < params.coords.length; i++) {
    const c = params.coords[i];
    if (!penroseValidLetter(c, which)) return "invalid coordinate letter";
    if (i > 0 && !penroseValidParent(c, params.coords[i - 1])) {
      return "invalid pair of consecutive coordinates";
    }
  }
  return null;
}
