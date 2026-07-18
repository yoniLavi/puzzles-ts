/**
 * Shared planar-grid geometry leaf — the idiomatic TS port of upstream
 * `grid.c` (Lambros Lambrou's general planar-graph grid code), landed
 * **lazily with its first consumer, Pearl**. Pearl calls only
 * `grid_new(GRID_SQUARE, …)` + struct-field reads, so this file ships the
 * four incidence structures, the deterministic square tiling
 * (`gridNewSquare`), and the shared `makeConsistent` incidence builder —
 * and nothing else. The other 17 tilings and the floating-point helpers
 * (`grid_nearest_edge`, `grid_find_incentre`, `grid_compute_size`) are out
 * of scope until a later consumer (the eventual Loopy port) needs them.
 *
 * Idiomatic divergences from the C, all faithful:
 * - **Reference incidence, not indices-into-arrays.** An edge holds its
 *   two `GridDot` and two `GridFace` references; a null face reference is
 *   the infinite exterior. GC replaces `grid_free`/`refcount` — a `Grid`
 *   is immutable after construction and shared by reference.
 * - **`Map`s replace upstream's `tree234` dedups.** Shared corner dots are
 *   deduplicated by pixel coordinate; edges are deduplicated by their
 *   sorted dot-index pair. Neither tree's *ordering* ever affected the
 *   result (both are pure lookups), so a `Map` is exact.
 * - **All ordering tie-breaks are by array index**, which reproduces C's
 *   sequential-allocation pointer order (faces/edges/dots are allocated in
 *   order with no frees during a build, so their pointers are monotone in
 *   index — pointer order *is* index order).
 */

/** A grid vertex. `faces` and `edges` are the clockwise rings around it;
 * a `null` entry in `faces` is the infinite exterior face. */
export class GridDot {
  order = 0;
  edges: GridEdge[] = [];
  faces: (GridFace | null)[] = [];
  constructor(
    public readonly index: number,
    public readonly x: number,
    public readonly y: number,
  ) {}
}

/** A grid edge: joins `dot1`↔`dot2`, borders `face1` and `face2` (a null
 * face is the infinite exterior). */
export class GridEdge {
  face2: GridFace | null = null;
  constructor(
    public readonly index: number,
    public readonly dot1: GridDot,
    public readonly dot2: GridDot,
    public face1: GridFace | null,
  ) {}
}

/** A grid face (cell): `dots` are its corners clockwise, `edges` its sides
 * clockwise, with edge `k` joining dots `k` and `k+1` (mod order). */
export class GridFace {
  edges: (GridEdge | null)[] = [];
  constructor(
    public readonly index: number,
    public readonly order: number,
    public readonly dots: (GridDot | null)[],
  ) {}
}

/** A complete planar grid: arrays of all faces, edges and dots, plus a
 * bounding box and a `tileSize` measure (in grid coordinates). Immutable
 * after construction. */
export class Grid {
  faces: GridFace[] = [];
  edges: GridEdge[] = [];
  dots: GridDot[] = [];
  tileSize = 0;
  lowestX = 0;
  lowestY = 0;
  highestX = 0;
  highestY = 0;

  get numFaces(): number {
    return this.faces.length;
  }
  get numEdges(): number {
    return this.edges.length;
  }
  get numDots(): number {
    return this.dots.length;
  }
}

const SQUARE_TILESIZE = 20;

/**
 * Build the square tiling deterministically from `(width, height)` alone
 * (no randomness, no floating point). Each cell is a four-dot clockwise
 * face at pixel origin `(SQUARE_TILESIZE·x, SQUARE_TILESIZE·y)`; shared
 * corner dots are deduplicated. Mirrors `grid_new_square`.
 */
export function gridNewSquare(width: number, height: number): Grid {
  const a = SQUARE_TILESIZE;
  const g = new Grid();
  g.tileSize = a;

  // Deduplicate dots by pixel coordinate (upstream's tree234 keyed by
  // (y desc, x desc), but the order is irrelevant — it is a pure lookup).
  const points = new Map<number, GridDot>();
  const getDot = (x: number, y: number): GridDot => {
    const key = y * (a * (width + 2)) + x; // any injective (x,y) key
    const existing = points.get(key);
    if (existing) return existing;
    const d = new GridDot(g.dots.length, x, y);
    g.dots.push(d);
    points.set(key, d);
    return d;
  };

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const px = a * x;
      const py = a * y;
      const face = new GridFace(g.faces.length, 4, [null, null, null, null]);
      g.faces.push(face);
      face.dots[0] = getDot(px, py);
      face.dots[1] = getDot(px + a, py);
      face.dots[2] = getDot(px + a, py + a);
      face.dots[3] = getDot(px, py + a);
    }
  }

  makeConsistent(g);
  return g;
}

/**
 * Derive edges, per-face edge lists, per-dot edge/face rings, and the
 * bounding box from a grid whose faces already know their clockwise dots.
 * Faithful port of `grid_make_consistent`.
 *
 * Input: `g.dots` populated (with coords), `g.faces` populated (each knows
 * its clockwise dots), `g.edges` empty.
 * Output: fully-linked, valid grid.
 */
export function makeConsistent(g: Grid): void {
  // ====== Stage 1: generate edges ======
  // Each face contributes its edges; the first face to see an edge sets
  // face1, the second (if any) sets face2. Dedup by the sorted dot-index
  // pair (upstream's tree234 keyed by grid_edge_bydots_cmpfn).
  const edgeByDots = new Map<number, GridEdge>();
  const numDots = g.dots.length;
  for (const f of g.faces) {
    for (let j = 0; j < f.order; j++) {
      const j2 = j + 1 === f.order ? 0 : j + 1;
      // biome-ignore lint/style/noNonNullAssertion: face dots are all set by now.
      const d1 = f.dots[j]!;
      // biome-ignore lint/style/noNonNullAssertion: face dots are all set by now.
      const d2 = f.dots[j2]!;
      const lo = Math.min(d1.index, d2.index);
      const hi = Math.max(d1.index, d2.index);
      const key = lo * numDots + hi;
      const found = edgeByDots.get(key);
      if (found) {
        found.face2 = f;
      } else {
        const e = new GridEdge(g.edges.length, d1, d2, f);
        g.edges.push(e);
        edgeByDots.set(key, e);
      }
    }
  }

  // ====== Stage 2: for each face, build its clockwise edge list ======
  for (const f of g.faces) {
    f.edges = new Array<GridEdge | null>(f.order).fill(null);
  }
  for (const e of g.edges) {
    for (let j = 0; j < 2; j++) {
      const f = j ? e.face2 : e.face1;
      if (f === null) continue;
      // Find one of the dots around the face equal to e.dot1.
      let k = 0;
      for (; k < f.order; k++) if (f.dots[k] === e.dot1) break;
      // edgeK joins dotK and dot{K+1}. Around this face either the next
      // or the previous dot must be e.dot2.
      let k2 = k + 1 === f.order ? 0 : k + 1;
      if (f.dots[k2] === e.dot2) {
        f.edges[k] = e;
        continue;
      }
      k2 = k === 0 ? f.order - 1 : k - 1;
      if (f.dots[k2] === e.dot2) {
        f.edges[k2] = e;
        continue;
      }
      throw new Error("Grid broken: bad edge-face relationship");
    }
  }

  // ====== Stage 3: for each dot, build its edge-list and face-list ======
  for (const d of g.dots) d.order = 0;
  for (const e of g.edges) {
    e.dot1.order++;
    e.dot2.order++;
  }
  for (const d of g.dots) {
    d.edges = new Array<GridEdge | null>(d.order).fill(null) as GridEdge[];
    d.faces = new Array<GridFace | null>(d.order).fill(null);
  }
  // Seed each dot with one touching face (last face in index order wins,
  // exactly as C's `for faces: for dots: d->faces[0] = f`).
  for (const f of g.faces) {
    for (let j = 0; j < f.order; j++) {
      // biome-ignore lint/style/noNonNullAssertion: face dots are all set by now.
      f.dots[j]!.faces[0] = f;
    }
  }
  // Fill the remaining faces/edges around each dot, walking clockwise then
  // (if the exterior blocked us) anticlockwise from the seed face.
  for (const d of g.dots) {
    let currentFace1 = 0; // ascends clockwise
    let currentFace2 = 0; // descends anticlockwise

    // clockwise search
    while (true) {
      const f = d.faces[currentFace1];
      if (f === null) throw new Error("Grid broken: null face in clockwise walk");
      let j = 0;
      for (; j < f.order; j++) if (f.dots[j] === d) break;
      // Required edge is anticlockwise from the dot (j-1).
      j = j === 0 ? f.order - 1 : j - 1;
      const e = f.edges[j];
      if (e === null) throw new Error("Grid broken: missing face edge");
      d.edges[currentFace1] = e;
      currentFace1++;
      if (currentFace1 === d.order) break;
      const next = e.face1 === f ? e.face2 : e.face1;
      d.faces[currentFace1] = next;
      if (next === null) break; // cannot progress beyond infinite face
    }
    if (currentFace1 === d.order) continue; // dot complete

    // anticlockwise search
    while (true) {
      const f = d.faces[currentFace2];
      if (f === null) throw new Error("Grid broken: null face in anticlockwise walk");
      let j = 0;
      for (; j < f.order; j++) if (f.dots[j] === d) break;
      // Required edge is clockwise from the dot (j).
      const e = f.edges[j];
      if (e === null) throw new Error("Grid broken: missing face edge");
      currentFace2 = currentFace2 === 0 ? d.order - 1 : currentFace2 - 1;
      d.edges[currentFace2] = e;
      if (currentFace2 === currentFace1) break;
      d.faces[currentFace2] = e.face1 === f ? e.face2 : e.face1;
    }
  }

  // ====== Stage 4: bounding box ======
  for (let i = 0; i < g.dots.length; i++) {
    const d = g.dots[i];
    if (i === 0) {
      g.lowestX = g.highestX = d.x;
      g.lowestY = g.highestY = d.y;
    } else {
      g.lowestX = Math.min(g.lowestX, d.x);
      g.highestX = Math.max(g.highestX, d.x);
      g.lowestY = Math.min(g.lowestY, d.y);
      g.highestY = Math.max(g.highestY, d.y);
    }
  }
}
