/**
 * The **hat** aperiodic monotile (discovered 2023), ported from `puzzles/hat.c`.
 *
 * Read Simon Tatham's write-up before this file — the algorithm is genuinely
 * unobvious and the diagrams do not fit in a comment:
 * https://www.chiark.greenend.org.uk/~sgtatham/quasiblog/aperiodic-tilings/
 *
 * The one-paragraph version. Hats live on a *kite* tiling: hexagons cut into
 * six kites, equivalently triangles cut into three. Each hat is exactly 8 kites.
 * A kite is addressed by **combinatorial coordinates** — a little-endian list
 * saying "kite #k of hat #h of metatile #m of metatile #m2 of …" — and the
 * generator walks every kite in a `w × h` rectangle in a serpentine order
 * ({@link KiteEnum}) so that each new kite is one step from a recent one, then
 * converts *that step* into a coordinate rewrite via two lookup tables:
 *
 * - the **kitemap**, which answers a step directly when both kites lie inside
 *   the same second-order metatile, and
 * - the **metamap**, which rewrites the coordinates at some level into an
 *   equivalent form (the same kite named differently) when they do not, then
 *   recurses back down to retry the kitemap.
 *
 * Random generation and replay are the same walk. Generating *invents* the
 * higher-order coordinates as the walk demands them (drawing from
 * {@link POSSIBLE_PARENTS}) and then records how far it got; replaying reads
 * them back from the desc and makes fixed choices if the desc runs short.
 *
 * Both tables are generated data — see `hat-tables.ts`.
 */

import { type RandomState, randomUpto } from "../../random/index.ts";
import { MAX_REGENERATE, retryLimit } from "../retry-limit.ts";
import {
  children,
  hatsInMetatile,
  kitemap,
  metamap,
  nchildren,
  TILE_CHARS,
  TT_F,
  TT_H,
  TT_P,
  TT_T,
} from "./hat-tables.ts";

// ---------------------------------------------------------------------------
// Geometry: points, kites, and the four kite steps.
// ---------------------------------------------------------------------------

/**
 * A point `x + y·r`, where `r = (1 + √3i)/2` is a primitive 6th root of unity.
 * Two integers address any grid point, once the tiling is scaled so that the
 * equilateral triangles have side length 6 — so this whole module is exact
 * integer arithmetic, with no `nTimesRootK` bridge of the kind penrose and
 * spectres need.
 */
interface Point {
  readonly x: number;
  readonly y: number;
}

/**
 * A kite, given by its four vertices.
 *
 * Naming the vertices (rather than, say, a position and an orientation) is what
 * makes reflection free: swap `left` and `right` and every step below runs
 * mirrored, which is exactly how {@link maybeReportHat} traces the boundary of a
 * reflected hat with the same fixed sequence of steps.
 */
interface Kite {
  readonly centre: Point;
  readonly left: Point;
  readonly right: Point;
  readonly outer: Point;
}

const scale = (s: number, a: Point): Point => ({ x: s * a.x, y: s * a.y });
const add = (a: Point, b: Point): Point => ({ x: a.x + b.x, y: a.y + b.y });

const kiteLeft = (k: Kite): Kite => ({
  centre: k.centre,
  right: k.left,
  outer: add(scale(2, k.left), scale(-1, k.outer)),
  left: add(add(k.centre, k.left), scale(-1, k.right)),
});

const kiteRight = (k: Kite): Kite => ({
  centre: k.centre,
  left: k.right,
  outer: add(scale(2, k.right), scale(-1, k.outer)),
  right: add(add(k.centre, k.right), scale(-1, k.left)),
});

const kiteForwardLeft = (k: Kite): Kite => ({
  outer: k.outer,
  right: k.left,
  centre: add(scale(2, k.left), scale(-1, k.centre)),
  left: add(add(k.right, k.left), scale(-1, k.centre)),
});

const kiteForwardRight = (k: Kite): Kite => ({
  outer: k.outer,
  left: k.right,
  centre: add(scale(2, k.right), scale(-1, k.centre)),
  right: add(add(k.left, k.right), scale(-1, k.centre)),
});

/** The four moves between adjacent kites. Ordinals index the kitemap. */
export enum KiteStep {
  Left = 0,
  Right = 1,
  ForwardLeft = 2,
  ForwardRight = 3,
}

function kiteStep(k: Kite, step: KiteStep): Kite {
  switch (step) {
    case KiteStep.Left:
      return kiteLeft(k);
    case KiteStep.Right:
      return kiteRight(k);
    case KiteStep.ForwardLeft:
      return kiteForwardLeft(k);
    case KiteStep.ForwardRight:
      return kiteForwardRight(k);
  }
}

// ---------------------------------------------------------------------------
// The serpentine kite enumerator.
// ---------------------------------------------------------------------------

/** How many recent kites the enumerator keeps. Every step refers back within
 * this window, which is what lets the caller keep only 3 coordinate lists. */
const KE_NKEEP = 3;

const START_KITE: Kite = {
  centre: { x: 0, y: 0 },
  left: { x: 0, y: 3 },
  right: { x: 3, y: 0 },
  outer: { x: 2, y: 2 },
};

/**
 * Enumerates every kite of a `w × h` region in a boustrophedon order chosen so
 * that **each kite delivered shares an edge with one of the last few emitted**
 * — the invariant the coordinate stepping depends on.
 *
 * The 14-state machine is upstream's verbatim (`hat.c:52`). States 1–3 and 9–11
 * walk rightwards along a grid line and 6–8, 12–14 leftwards; the odd ones out
 * are 4/5 and 12, the row transitions, where the natural next tile is not
 * adjacent to anything emitted yet, so the machine emits an interior tile first
 * and reaches back **two** tiles (`lastbut1`) for the one after.
 */
class KiteEnum {
  private state = 1;
  private x = 0;
  private y = 0;
  private readonly recent: Kite[] = [START_KITE, START_KITE, START_KITE];

  currIndex = 0;
  /** C reads `last_index`/`last_step` before ever writing them (`hat.c:54`).
   * That is benign — only states 5 and 11 consume the stale value and neither
   * can run first — but it is undefined behaviour on paper, so initialise. */
  lastIndex = 0;
  lastStep: KiteStep = KiteStep.Left;

  constructor(
    private readonly w: number,
    private readonly h: number,
  ) {}

  get curr(): Kite {
    return this.recent[this.currIndex];
  }

  next(): boolean {
    const lastbut1 = this.lastIndex;
    this.lastIndex = this.currIndex;
    this.currIndex = (this.currIndex + 1) % KE_NKEEP;

    switch (this.state) {
      case 1:
        this.lastStep = KiteStep.ForwardRight;
        this.state = 2;
        break;

      case 2:
        if (this.x + 1 >= this.w) {
          this.lastStep = KiteStep.ForwardRight;
          this.state = 4;
          break;
        }
        this.lastStep = KiteStep.Right;
        this.state = 3;
        this.x++;
        break;

      case 3:
        this.lastStep = KiteStep.Right;
        this.state = 1;
        break;

      // We have just moved up into a row below a grid line, but cannot produce
      // that row's rightmost tile — it is adjacent to nothing emitted so far.
      // Emit the second-rightmost now and the rightmost next time.
      case 4:
        this.lastStep = KiteStep.Left;
        this.state = 5;
        break;

      // ...and now the third-rightmost, relative to the last *but one* tile
      // (state 2's, not state 4's).
      case 5:
        this.lastStep = KiteStep.Right;
        this.lastIndex = lastbut1;
        this.state = 6;
        break;

      case 6:
        if (this.x <= 0) {
          if (this.y + 1 >= this.h) {
            this.state = 0;
            return false;
          }
          this.lastStep = KiteStep.Right;
          this.state = 9;
          this.y++;
          break;
        }
        this.lastStep = KiteStep.ForwardRight;
        this.state = 7;
        this.x--;
        break;

      case 7:
        this.lastStep = KiteStep.Right;
        this.state = 8;
        break;

      case 8:
        this.lastStep = KiteStep.Right;
        this.state = 6;
        break;

      case 9:
        this.lastStep = KiteStep.Right;
        this.state = 10;
        break;

      case 10:
        this.lastStep = KiteStep.Right;
        this.state = 11;
        break;

      case 11:
        if (this.x + 1 >= this.w) {
          // The other awkward row transition — but this one does generate the
          // new row's rightmost tile, so the following states stay simple.
          this.lastStep = KiteStep.ForwardRight;
          this.lastIndex = lastbut1;
          this.state = 12;
          break;
        }
        this.lastStep = KiteStep.ForwardRight;
        this.state = 9;
        this.x++;
        break;

      case 12:
        this.lastStep = KiteStep.ForwardRight;
        this.state = 13;
        break;

      case 13:
        if (this.x <= 0) {
          if (this.y + 1 >= this.h) {
            this.state = 0;
            return false;
          }
          this.lastStep = KiteStep.Left;
          this.state = 1;
          this.y++;
          break;
        }
        this.lastStep = KiteStep.Right;
        this.state = 14;
        this.x--;
        break;

      case 14:
        this.lastStep = KiteStep.Right;
        this.state = 12;
        break;

      default:
        return false;
    }

    this.recent[this.currIndex] = kiteStep(this.recent[this.lastIndex], this.lastStep);
    return true;
  }
}

// ---------------------------------------------------------------------------
// Combinatorial coordinates.
// ---------------------------------------------------------------------------

/** Tile types beyond the four metatiles. Ordinals continue `TT_H…TT_F`. */
const TT_KITE = 4;
const TT_HAT = 5;

/** Number of kites in a hat. */
const HAT_KITES = 8;

/** Largest number of metatiles in any expansion; the metamap's row stride. */
const MT_MAXEXPAND = 13;

/**
 * One level of a coordinate: "index `index` within a tile of type `type`".
 * `index === -1` means "we have not decided yet what this level is" — it is
 * always, and only, the last entry of a {@link HatCoords}.
 */
interface HatCoord {
  index: number;
  type: number;
}

/** Coordinates, little-endian: `[0]` is a kite within a hat, `[1]` a hat within
 * a first-order metatile, `[2…]` successively larger metatiles. */
type HatCoords = HatCoord[];

const copyCoords = (hc: HatCoords): HatCoords =>
  hc.map((c) => ({ index: c.index, type: c.type }));

/** Where a metatile of a given type may sit inside its parent, with a weight. */
interface PossibleParent {
  readonly type: number;
  readonly index: number;
  readonly probability: number;
}

/*
 * The probabilities below are **not** uniform over the legal parents, and that
 * is deliberate: we want a patch distributed as if cut from a uniformly random
 * point of the infinite tiling. Upstream derives the weights from the leading
 * eigenvector of the metatile substitution matrix — see the long comment at
 * `hat.c:204`, which is worth reading and is not reproduced here.
 *
 * These integers are exact transcriptions of upstream's approximations, scaled
 * by 10^7. Do not recompute them from √5: they define the RNG draw, so any
 * rounding difference silently produces a different (still valid-looking)
 * tiling and breaks byte-match with the C.
 */
const PROB_H = 10000000;
const PROB_T = 1458980;
const PROB_P = 7082039;
const PROB_F = 11458980;

const PARENTS_H: readonly PossibleParent[] = [
  { type: TT_H, index: 0, probability: PROB_H },
  { type: TT_H, index: 1, probability: PROB_H },
  { type: TT_H, index: 2, probability: PROB_H },
  { type: TT_T, index: 0, probability: PROB_T },
  { type: TT_P, index: 0, probability: PROB_P },
  { type: TT_P, index: 1, probability: PROB_P },
  { type: TT_F, index: 0, probability: PROB_F },
  { type: TT_F, index: 1, probability: PROB_F },
];
const PARENTS_T: readonly PossibleParent[] = [
  { type: TT_H, index: 3, probability: PROB_H },
];
const PARENTS_P: readonly PossibleParent[] = [
  { type: TT_H, index: 4, probability: PROB_H },
  { type: TT_H, index: 5, probability: PROB_H },
  { type: TT_H, index: 6, probability: PROB_H },
  { type: TT_P, index: 4, probability: PROB_P },
  { type: TT_F, index: 3, probability: PROB_F },
];
const PARENTS_F: readonly PossibleParent[] = [
  { type: TT_H, index: 8, probability: PROB_H },
  { type: TT_H, index: 9, probability: PROB_H },
  { type: TT_H, index: 12, probability: PROB_H },
  { type: TT_P, index: 5, probability: PROB_P },
  { type: TT_P, index: 10, probability: PROB_P },
  { type: TT_F, index: 6, probability: PROB_F },
  { type: TT_F, index: 8, probability: PROB_F },
  { type: TT_F, index: 10, probability: PROB_F },
];

const POSSIBLE_PARENTS: readonly (readonly PossibleParent[])[] = [
  PARENTS_H,
  PARENTS_T,
  PARENTS_P,
  PARENTS_F,
];

/**
 * The absolute starting hat, weighted the same way but scaled by the number of
 * hats in each metatile.
 *
 * NOTE the `TT_T` row uses **`PROB_P`**, not `PROB_T`. That is verbatim from
 * `hat.c:374`. Whether it is an upstream typo is irrelevant here: it is what
 * the C draws against, so "correcting" it changes every hat desc we generate.
 */
const STARTING_HATS: readonly PossibleParent[] = [
  { type: TT_H, index: 0, probability: PROB_H },
  { type: TT_H, index: 1, probability: PROB_H },
  { type: TT_H, index: 2, probability: PROB_H },
  { type: TT_H, index: 3, probability: PROB_H },
  { type: TT_T, index: 0, probability: PROB_P },
  { type: TT_P, index: 0, probability: PROB_P },
  { type: TT_P, index: 1, probability: PROB_P },
  { type: TT_F, index: 0, probability: PROB_F },
  { type: TT_F, index: 1, probability: PROB_F },
];

/**
 * Pick one weighted candidate.
 *
 * **The `randomUpto` call is unconditional, and must stay that way.** Guarding
 * it with `if (parents.length > 1)` looks like a free optimisation and is a
 * silent bug: `PARENTS_T` has exactly one entry, so skipping its draw would
 * desynchronise the RNG stream from the C's and yield a different — entirely
 * valid, entirely plausible — tiling that nothing would flag
 * (`add-aperiodic-tilings` design D2).
 */
function chooseMpp(
  rs: RandomState,
  parents: readonly PossibleParent[],
): PossibleParent {
  let limit = 0;
  for (const p of parents) limit += p.probability;

  let value = randomUpto(rs, limit);

  for (let i = 0; i + 1 < parents.length; i++) {
    if (value < parents[i].probability) return parents[i];
    value -= parents[i].probability;
  }
  return parents[parents.length - 1];
}

/** `kitemap` entry index for a step out of (kite, hat, meta). Stride 3. */
export const kitemapIndex = (
  step: KiteStep,
  kite: number,
  hat: number,
  meta: number,
): number => step + 4 * (kite + 8 * (hat + 4 * meta));

/** `metamap` entry index for the pair (meta, meta2). Stride 2. */
export const metamapIndex = (meta: number, meta2: number): number =>
  meta2 * MT_MAXEXPAND + meta;

/**
 * The shared state of one run: a `prototype` coordinate list for the starting
 * kite, extended outwards as the walk demands.
 *
 * Every other coordinate list copies its higher-order levels from the prototype,
 * so a choice made once stays consistent across the whole patch. With a
 * `RandomState` we invent those levels at random (generation); without one we
 * take each type's first legal parent (replay of a desc that ran short — see
 * {@link extendCoords}).
 */
class HatContext {
  prototype: HatCoords;

  private constructor(
    readonly rs: RandomState | null,
    prototype: HatCoords,
  ) {
    this.prototype = prototype;
  }

  /** Generation: choose a random starting hat and kite. Two draws, in this
   * order — `chooseMpp` then the kite index — and the order is observable. */
  static random(rs: RandomState): HatContext {
    const startingHat = chooseMpp(rs, STARTING_HATS);
    const prototype: HatCoords = [
      { type: TT_KITE, index: randomUpto(rs, HAT_KITES) },
      { type: TT_HAT, index: startingHat.index },
      { type: startingHat.type, index: -1 },
    ];
    return new HatContext(rs, prototype);
  }

  /** Replay: rebuild the prototype from a validated desc. */
  static fromParams(hp: HatPatchParams): HatContext {
    const { coords, ncoords } = hp;
    if (ncoords < 3) throw new Error("hat: fewer than three coordinates");

    const prototype: HatCoords = [];
    for (let i = 0; i < ncoords; i++) prototype.push({ index: coords[i], type: -1 });
    prototype.push({ type: metatileCharToType(hp.finalMetatile), index: -1 });

    prototype[0].type = TT_KITE;
    prototype[1].type = TT_HAT;

    // Walk down from the outermost metatile: each level's type is determined by
    // its parent's type and its own index. Descending, `i > 1`, because levels
    // 0 and 1 are the kite and hat set above.
    for (let i = ncoords - 1; i > 1; i--) {
      const metatile = prototype[i + 1].type;
      if (coords[i] >= nchildren[metatile]) {
        throw new Error("hat: metatile index out of range");
      }
      prototype[i].type = children[metatile][coords[i]];
    }
    return new HatContext(null, prototype);
  }

  initialCoords(): HatCoords {
    return copyCoords(this.prototype);
  }

  /**
   * Extend `hc` to at least `n` levels, growing the prototype first if it is
   * not yet that deep. Mutates `hc` in place, as the C does.
   */
  extendCoords(hc: HatCoords, n: number): void {
    const proto = this.prototype;
    while (proto.length < n) {
      const last = proto[proto.length - 1];
      const parent = this.rs
        ? chooseMpp(this.rs, POSSIBLE_PARENTS[last.type])
        : // No RNG: this is a desc replayed past the depth it recorded. Take
          // the first legal parent, deterministically, so the same desc always
          // rebuilds the same grid (`hat-internal.h` calls this "tolerating
          // short descriptions").
          POSSIBLE_PARENTS[last.type][0];

      last.index = parent.index;
      proto.push({ index: -1, type: parent.type });
    }

    while (hc.length < n) {
      // `top` is read before the push, matching the C's `hc->nc` before `nc++`:
      // the level that was "undecided" adopts the prototype's choice, and a new
      // undecided level is appended above it.
      const top = hc.length;
      hc[top - 1].index = proto[top - 1].index;
      hc.push({ index: -1, type: proto[top].type });
    }
  }
}

// ---------------------------------------------------------------------------
// Stepping between kites.
// ---------------------------------------------------------------------------

/**
 * Try to answer a step straight out of the kitemap: the fast path, taken when
 * both kites lie within the same second-order metatile. Returns null if the
 * step leaves it, in which case the caller must rewrite coordinates first.
 */
function tryStepKitemap(
  ctx: HatContext,
  hcIn: HatCoords,
  step: KiteStep,
): HatCoords | null {
  ctx.extendCoords(hcIn, 4);

  const kite = hcIn[0].index;
  const hat = hcIn[1].index;
  const meta = hcIn[2].index;
  if (kite < 0 || hat < 0 || meta < 0) {
    // The C reads these into `unsigned` from fields that legitimately hold -1
    // elsewhere, relying on `extend_coords(…, 4)` above having filled them in.
    // Check it rather than inherit the latent UB.
    throw new Error("hat: kitemap step on undecided coordinates");
  }
  const meta2type = hcIn[3].type;

  const table = kitemap[meta2type];
  const at = 3 * kitemapIndex(step, kite, hat, meta);
  // The "impossible" sentinel is tested on `.kite` only, matching the C —
  // though hat and meta are -1 in the same entries.
  if (table[at] < 0) return null;

  const hcOut = copyCoords(hcIn);
  hcOut[2].index = table[at + 2];
  hcOut[2].type = children[meta2type][table[at + 2]];
  hcOut[1].index = table[at + 1];
  hcOut[1].type = TT_HAT;
  hcOut[0].index = table[at];
  hcOut[0].type = TT_KITE;
  return hcOut;
}

/**
 * Rewrite the coordinates at levels `depth` and `depth+1` into an equivalent
 * naming of the same kite (using the metamap for the type at `depth+2`), and
 * after each rewrite recurse back down to retry the kitemap. Returns null once
 * the rewrites cycle back to where they started, meaning this level cannot help
 * and the caller must try a higher one.
 */
function tryStepMetamap(
  ctx: HatContext,
  hcIn: HatCoords,
  step: KiteStep,
  depth: number,
): HatCoords | null {
  ctx.extendCoords(hcIn, depth + 3);

  const metaOrig = hcIn[depth].index;
  const meta2Orig = hcIn[depth + 1].index;
  const meta3type = hcIn[depth + 2].type;
  const table = metamap[meta3type];

  let meta = metaOrig;
  let meta2 = meta2Orig;
  let hcTmp: HatCoords | null = null;

  for (;;) {
    const hcCurr = hcTmp ?? hcIn;
    const hcOut =
      depth > 2
        ? tryStepMetamap(ctx, hcCurr, step, depth - 1)
        : tryStepKitemap(ctx, hcCurr, step);
    if (hcOut) return hcOut;

    const at = 2 * metamapIndex(meta, meta2);
    if (table[at] === -1) throw new Error("hat: metamap entry is impossible");
    if (table[at] === metaOrig && table[at + 1] === meta2Orig) return null;

    meta = table[at];
    meta2 = table[at + 1];

    // The rewrite must land in a *copy*. It is not obvious that it must — any
    // successful rewrite still names the same kite — but we may rewrite at this
    // level more than once, and in between, a rewrite one level down may have
    // modified one of the two coordinates we are juggling. A separate copy per
    // level sidesteps the aliasing entirely.
    hcTmp ??= copyCoords(hcIn);

    hcTmp[depth + 1].index = meta2;
    hcTmp[depth + 1].type = children[meta3type][meta2];
    hcTmp[depth].index = meta;
    hcTmp[depth].type = children[hcTmp[depth + 1].type][meta];
  }
}

/**
 * Find the coordinates of the kite one `step` away from `hcIn`.
 *
 * Try the kitemap; failing that, try metamap rewrites at successively higher
 * levels, each of which recurses back down to the kitemap.
 */
function hatctxStep(ctx: HatContext, hcIn: HatCoords, step: KiteStep): HatCoords {
  const direct = tryStepKitemap(ctx, hcIn, step);
  if (direct) return direct;

  // Upstream's loop is `for (depth = 2;; depth++)` with no exit condition. It
  // terminates because each iteration invents a new enclosing metatile and at
  // sufficient depth a rewrite always exists — real depth is O(log area), tens
  // at most. We still bound it: this code is synchronous, so a divergence that
  // stopped it converging would hang a browser tab outright rather than fail
  // (`add-aperiodic-tilings` design D5). Exhaustion throws, so the cap can
  // never quietly move a generated grid.
  const attempt = retryLimit("hat: coordinate step", MAX_REGENERATE);
  for (let depth = 2; ; depth++) {
    attempt();
    const hcOut = tryStepMetamap(ctx, hcIn, step, depth);
    if (hcOut) return hcOut;
  }
}

// ---------------------------------------------------------------------------
// Emitting hats.
// ---------------------------------------------------------------------------

/** A hat's outline, as `2 * nvertices` interleaved x,y integers. */
export type HatTileCallback = (nvertices: number, coords: readonly number[]) => void;

/**
 * `-0` normalisation, applied **once**, here, where exact interior coordinates
 * become the integers the grid is built from.
 *
 * `scale(-1, {x: 0, y: 0})` yields `-0` in JS where C yields `0`, and `-0`
 * survives everything that would normally catch it: `===`, the dot-dedup key
 * (`` `${-0}` === "0" ``), and `Map` lookup. The grid comes out structurally
 * perfect and only a structural comparison such as the differential's `toEqual`
 * disagrees — which is precisely how floret's version of this bug was found in
 * `extend-grid-tilings`. One choke point beats scattered `|| 0`
 * (`add-aperiodic-tilings` design D8).
 */
const normaliseZero = (n: number): number => (n === 0 ? 0 : n);

/**
 * Emit one hat if `kite` is its kite #0 and its whole outline is in bounds.
 *
 * Every hat we want has all 8 kites inside the rectangle, so its kite #0 is
 * certainly reached by the enumeration; tracing the boundary from there and
 * rejecting on the first out-of-bounds vertex gives a ragged edge, which is
 * what `gridTrimVigorously` is for downstream.
 */
function maybeReportHat(
  w: number,
  h: number,
  kite: Kite,
  hc: HatCoords,
  cb: HatTileCallback,
): void {
  if (hc[0].index !== 0) return;

  // Reflected hats are exactly "hat #3 of an H metatile". Reflecting the
  // starting kite (swap left/right) makes the fixed sequence of steps below run
  // mirrored, so one boundary walk serves both chiralities.
  let reversed = false;
  let k = kite;
  if (hc[2].type === TT_H && hc[1].index === 3) {
    reversed = true;
    k = { centre: k.centre, left: k.right, right: k.left, outer: k.outer };
  }

  const vertices: Point[] = new Array<Point>(14);
  vertices[0] = k.centre;
  vertices[1] = k.right;
  vertices[2] = k.outer;
  vertices[3] = k.left;
  k = kiteLeft(k); /* kite #1 */
  k = kiteForwardRight(k); /* kite #2 */
  vertices[4] = k.centre;
  k = kiteRight(k); /* kite #3 */
  vertices[5] = k.right;
  vertices[6] = k.outer;
  k = kiteForwardLeft(k); /* kite #4 */
  vertices[7] = k.left;
  vertices[8] = k.centre;
  k = kiteRight(k); /* kite #5 */
  k = kiteRight(k); /* kite #6 */
  k = kiteRight(k); /* kite #7 */
  vertices[9] = k.right;
  vertices[10] = k.outer;
  vertices[11] = k.left;
  k = kiteLeft(k); /* kite #6 again */
  vertices[12] = k.outer;
  vertices[13] = k.left;

  // Mirroring the walk reversed the winding too, so put it back: every hat must
  // reach the grid builder in one consistent (clockwise) orientation.
  if (reversed) vertices.reverse();

  const coords: number[] = new Array<number>(28);
  for (let i = 0; i < 14; i++) {
    const v = vertices[i];
    // C truncating division on freely-negative inputs, so `Math.trunc`, not
    // `Math.floor`. The quotient is always exact — `2x + y ≡ 0 (mod 3)` is
    // preserved by every kite step — but assert that rather than assume it,
    // since a violation would round silently into a wrong-but-plausible dot.
    const num = v.x * 2 + v.y;
    if (num % 3 !== 0) {
      throw new Error(`hat: broken lattice invariant 2x+y = ${num} (mod 3 != 0)`);
    }
    const x = Math.trunc(num / 3);
    const y = v.y;

    if (x < 0 || x > 4 * w || y < 0 || y > 6 * h) return; /* out of bounds */

    coords[2 * i] = normaliseZero(x);
    coords[2 * i + 1] = normaliseZero(y);
  }

  cb(14, coords);
}

// ---------------------------------------------------------------------------
// Patch parameters (the desc payload).
// ---------------------------------------------------------------------------

/**
 * A patch of hat tiling, identified by the combinatorial coordinates of one
 * corner kite plus the type of the outermost metatile reached.
 */
export interface HatPatchParams {
  readonly ncoords: number;
  readonly coords: readonly number[];
  /** One of `H`, `T`, `P`, `F`. */
  readonly finalMetatile: string;
}

/** Metatile letter → type ordinal, or -1 if it is not a metatile letter. */
export function metatileCharToType(c: string): number {
  // Guarded on length because `"HTPF".indexOf("")` is 0, which would silently
  // read an empty final metatile as H.
  return c.length === 1 ? TILE_CHARS.indexOf(c) : -1;
}

/**
 * Choose a random patch big enough to cover `w × h` squares of kite tiling.
 *
 * This walks the *entire* region computing coordinates and then throws them all
 * away — the walk is run purely for its side effect on `ctx.prototype`, which
 * ends up extended exactly as far as the region demanded, having consumed
 * exactly the random draws needed to decide those levels. Recording the
 * prototype is therefore enough to replay the identical patch later.
 */
export function hatTilingRandomise(
  w: number,
  h: number,
  rs: RandomState,
): HatPatchParams {
  const ctx = HatContext.random(rs);
  const coords: (HatCoords | null)[] = [null, null, null];

  const s = new KiteEnum(w, h);
  coords[s.currIndex] = ctx.initialCoords();

  while (s.next()) {
    const from = coords[s.lastIndex];
    if (!from) throw new Error("hat: enumerator stepped from an unvisited kite");
    coords[s.currIndex] = hatctxStep(ctx, from, s.lastStep);
  }

  const ncoords = ctx.prototype.length - 1;
  return {
    ncoords,
    coords: ctx.prototype.slice(0, ncoords).map((c) => c.index),
    finalMetatile: TILE_CHARS[ctx.prototype[ncoords].type],
  };
}

/** Validate patch params. Returns an error message, or null if acceptable. */
export function hatTilingParamsInvalid(hp: HatPatchParams): string | null {
  if (hp.ncoords < 3) return "Grid parameters require at least three coordinates";
  if (metatileCharToType(hp.finalMetatile) < 0) {
    return "Grid parameters contain an invalid final metatile";
  }
  if (hp.coords[0] >= 8) return "Grid parameters contain an invalid kite index";

  // The descending walk must stay *after* the `ncoords < 3` check above: with
  // fewer than three coordinates it would index below the start of the array.
  let metatile = metatileCharToType(hp.finalMetatile);
  for (let i = hp.ncoords - 1; i > 1; i--) {
    if (hp.coords[i] >= nchildren[metatile]) {
      return "Grid parameters contain an invalid metatile index";
    }
    metatile = children[metatile][hp.coords[i]];
  }

  if (hp.coords[1] >= hatsInMetatile[metatile]) {
    return "Grid parameters contain an invalid hat index";
  }
  return null;
}

/**
 * Replay a patch: walk the region again, this time reporting each complete hat.
 *
 * `w` and `h` are the raw grid dimensions in kite-tiling squares — unlike
 * spectres, hats does no `SQUARELEN` multiplication on the way in.
 */
export function hatTilingGenerate(
  hp: HatPatchParams,
  w: number,
  h: number,
  cb: HatTileCallback,
): void {
  const ctx = HatContext.fromParams(hp);
  const coords: (HatCoords | null)[] = [null, null, null];

  const s = new KiteEnum(w, h);
  coords[s.currIndex] = ctx.initialCoords();
  maybeReportHat(w, h, s.curr, coords[s.currIndex] as HatCoords, cb);

  while (s.next()) {
    const from = coords[s.lastIndex];
    if (!from) throw new Error("hat: enumerator stepped from an unvisited kite");
    const to = hatctxStep(ctx, from, s.lastStep);
    coords[s.currIndex] = to;
    maybeReportHat(w, h, s.curr, to, cb);
  }
}
