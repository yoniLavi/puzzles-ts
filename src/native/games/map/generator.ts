/**
 * Map's board generator (upstream `new_game_desc` and its helpers). Byte-faithful
 * to the C RNG draw order so a seed reproduces the exact desc + aux:
 *   1. `genmap` — voronoi-style region growth over a cumulative-frequency table;
 *   2. `gengraph` — the adjacency graph (see graph.ts);
 *   3. `fourcolour` — a recursive four-colouring;
 *   4. solver-gated clue reduction (never removing the last region of a colour);
 *   5. the difficulty-floor retry loop.
 */

import { retryLimit } from "../../engine/retry-limit.ts";
import { shuffle } from "../../engine/shuffle.ts";
import { type RandomState, randomUpto } from "../../random/index.ts";
import { gengraph, graphVertexStart } from "./graph.ts";
import { encodeMapDesc } from "./map-data.ts";
import { mapSolver, SOLVER_UNIQUE } from "./solver.ts";
import type { MapParams } from "./state.ts";

const FOUR = 4;
const FIVE = 5;

const WEIGHT_INCREASED = 2;
const WEIGHT_DECREASED = 4;
const WEIGHT_UNCHANGED = 3;

// --- cumulative-frequency (Fenwick-like) table -----------------------

function cfInit(table: Int32Array, n: number): void {
  for (let i = 0; i < n; i++) table[i] = 0;
}

function cfAdd(table: Int32Array, _n: number, sym: number, count: number): void {
  let bit = 1;
  while (sym !== 0) {
    if (sym & bit) {
      table[sym] += count;
      sym &= ~bit;
    }
    bit <<= 1;
  }
  table[0] += count;
}

/** Total count of symbols with value less than `sym`. */
function cfClookup(table: Int32Array, n: number, sym: number): number {
  if (sym === 0) return 0;
  let count = table[0];
  let bit = 1;
  while (bit < n) bit <<= 1;
  let limit = n;
  while (bit > 0) {
    const index = ((sym + bit - 1) & ~(bit * 2 - 1)) + bit;
    if (index < limit) {
      count -= table[index];
      limit = index;
    }
    bit >>= 1;
  }
  return count;
}

/** Count of symbol `sym`. */
function cfSlookup(table: Int32Array, n: number, sym: number): number {
  let count = table[sym];
  for (let bit = 1; sym + bit < n && !(sym & bit); bit <<= 1) count -= table[sym + bit];
  return count;
}

/** Largest symbol whose cumulative frequency is <= `count`. */
function cfWhichsym(table: Int32Array, n: number, count: number): number {
  let bit = 1;
  while (bit < n) bit <<= 1;
  let sym = 0;
  let top = table[0];
  while (bit > 0) {
    if (sym + bit < n) {
      if (count >= top - table[sym + bit]) sym += bit;
      else top -= table[sym + bit];
    }
    bit >>= 1;
  }
  return sym;
}

// --- map generation --------------------------------------------------

/** Reused neighbour buffer for {@link extendOptions} (hot path). */
const col = new Int32Array(8);

/**
 * Which region colours can extend into square `(x, y)`, and by what weight.
 * With `index < 0` returns the total weight; with `index >= 0` returns the
 * `index`-th selectable colour (weighted). Upstream `extend_options`.
 */
function extendOptions(
  w: number,
  h: number,
  n: number,
  map: Int32Array,
  x: number,
  y: number,
  index: number,
): number {
  if (map[y * w + x] >= 0) return 0; // already a region

  // The eight neighbours in order around the square.
  for (let dy = -1; dy <= 1; dy++)
    for (let dx = -1; dx <= 1; dx++) {
      const idx = dy < 0 ? 6 - dx : dy > 0 ? 2 + dx : 2 * (1 + dx);
      if (x + dx >= 0 && x + dx < w && y + dy >= 0 && y + dy < h)
        col[idx] = map[(y + dy) * w + (x + dx)];
      else col[idx] = -1;
    }

  let total = 0;
  for (let c = 0; c < n; c++) {
    // Must be orthogonally adjacent to region c.
    let neighbours = 0;
    for (let i = 0; i < 8; i += 2) if (col[i] === c) neighbours++;
    if (!neighbours) continue;

    // Extending must not make the region non-simply-connected: only one run.
    let runs = 0;
    for (let i = 0; i < 8; i++) if (col[i] === c && col[(i + 1) & 7] !== c) runs++;
    if (runs > 1) continue;

    const count =
      neighbours === 1
        ? WEIGHT_INCREASED
        : neighbours === 2
          ? WEIGHT_UNCHANGED
          : WEIGHT_DECREASED;

    total += count;
    if (index >= 0 && index < count) return c;
    index -= count;
  }

  return total;
}

/** Upstream `genmap`: fill `map` (`wh` region indices) with `n` regions. */
function genmap(
  w: number,
  h: number,
  n: number,
  map: Int32Array,
  rs: RandomState,
): void {
  const wh = w * h;
  const tmp = new Int32Array(wh);

  for (let i = 0; i < wh; i++) {
    map[i] = -1;
    tmp[i] = i;
  }

  // Place the region seeds.
  let k = wh;
  for (let i = 0; i < n; i++) {
    const j = randomUpto(rs, k);
    map[tmp[j]] = i;
    tmp[j] = tmp[--k];
  }

  // Reuse tmp as the cumulative-frequency table of extend options per square.
  cfInit(tmp, wh);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++)
      cfAdd(tmp, wh, y * w + x, extendOptions(w, h, n, map, x, y, -1));

  // Grow the regions.
  while (tmp[0] > 0) {
    const kk = randomUpto(rs, tmp[0]);
    const sq = cfWhichsym(tmp, wh, kk);
    const rem = kk - cfClookup(tmp, wh, sq);
    const x = sq % w;
    const y = Math.floor(sq / w);
    const colour = extendOptions(w, h, n, map, x, y, rem);

    map[sq] = colour;

    for (let yy = Math.max(y - 1, 0); yy < Math.min(y + 2, h); yy++)
      for (let xx = Math.max(x - 1, 0); xx < Math.min(x + 2, w); xx++)
        cfAdd(
          tmp,
          wh,
          yy * w + xx,
          -cfSlookup(tmp, wh, yy * w + xx) + extendOptions(w, h, n, map, xx, yy, -1),
        );
  }

  // Renumber regions into scan order so indistinguishable maps are identical.
  for (let i = 0; i < n; i++) tmp[i] = -1;
  let np = 0;
  for (let i = 0; i < wh; i++) {
    if (tmp[map[i]] < 0) tmp[map[i]] = np++;
    map[i] = tmp[map[i]];
  }
}

// --- four-colouring --------------------------------------------------

function fourcolourRecurse(
  graph: Int32Array,
  n: number,
  ngraph: number,
  colouring: Int32Array,
  scratch: Int32Array,
  rs: RandomState,
): boolean {
  // Fewest free colours in any uncoloured vertex, and how many such vertices.
  let nfree = FIVE;
  let nvert = 0;
  for (let i = 0; i < n; i++)
    if (colouring[i] < 0 && scratch[i * FIVE + FOUR] <= nfree) {
      if (nfree > scratch[i * FIVE + FOUR]) {
        nfree = scratch[i * FIVE + FOUR];
        nvert = 0;
      }
      nvert++;
    }

  if (nvert === 0) return true; // done

  // Pick a random vertex in that set.
  let j = randomUpto(rs, nvert);
  let i = 0;
  for (; i < n; i++)
    if (colouring[i] < 0 && scratch[i * FIVE + FOUR] === nfree) {
      if (j-- === 0) break;
    }
  const start = graphVertexStart(graph, n, ngraph, i);

  // Candidate colours for i, shuffled.
  const cs: number[] = [];
  for (let c = 0; c < FOUR; c++) if (scratch[i * FIVE + c] === 0) cs.push(c);
  shuffle(cs, rs);

  let ci = cs.length;
  while (ci-- > 0) {
    const c = cs[ci];
    colouring[i] = c;

    for (let gj = start; gj < ngraph && graph[gj] < n * (i + 1); gj++) {
      const kk = graph[gj] - i * n;
      if (scratch[kk * FIVE + c] === 0) scratch[kk * FIVE + FOUR]--;
      scratch[kk * FIVE + c]++;
    }

    if (fourcolourRecurse(graph, n, ngraph, colouring, scratch, rs)) return true;

    for (let gj = start; gj < ngraph && graph[gj] < n * (i + 1); gj++) {
      const kk = graph[gj] - i * n;
      scratch[kk * FIVE + c]--;
      if (scratch[kk * FIVE + c] === 0) scratch[kk * FIVE + FOUR]++;
    }
    colouring[i] = -1;
  }

  return false;
}

function fourcolour(
  graph: Int32Array,
  n: number,
  ngraph: number,
  colouring: Int32Array,
  rs: RandomState,
): void {
  const scratch = new Int32Array(n * FIVE);
  for (let i = 0; i < n * FIVE; i++) scratch[i] = i % FIVE === FOUR ? FOUR : 0;
  for (let i = 0; i < n; i++) colouring[i] = -1;
  fourcolourRecurse(graph, n, ngraph, colouring, scratch, rs);
}

// --- main ------------------------------------------------------------

export function newMapDesc(
  p: MapParams,
  rs: RandomState,
): { desc: string; aux: string } {
  const { w, h, n } = p;
  const wh = w * h;

  const map = new Int32Array(wh);
  const colouring = new Int32Array(n);
  const colouring2 = new Int32Array(n);
  const cfreq = new Int32Array(FOUR);

  let mindiff = p.diff;
  let tries = 50;
  let aux = "";

  const attempt = retryLimit("map: generation");
  for (;;) {
    attempt();

    genmap(w, h, n, map, rs);
    const { graph, ngraph } = gengraph(w, h, n, map);
    fourcolour(graph, n, ngraph, colouring, rs);

    // Encode the full solution as the aux string.
    aux = "";
    for (let i = 0; i < n; i++) {
      if (colouring[i] < 0) continue;
      aux += `${i ? ";" : "S;"}${colouring[i]}:${i}`;
    }

    // Clue reduction: remove region colours one by one, keeping solubility,
    // but never removing the last region of any colour.
    cfreq.fill(0);
    const regions: number[] = [];
    for (let i = 0; i < n; i++) {
      regions.push(i);
      cfreq[colouring[i]]++;
    }
    shuffle(regions, rs);

    for (let i = 0; i < n; i++) {
      const j = regions[i];
      if (cfreq[colouring[j]] === 1) continue; // keep last of its colour
      colouring2.set(colouring);
      colouring2[j] = -1;
      const solveret = mapSolver(graph, n, ngraph, colouring2, p.diff);
      if (solveret === SOLVER_UNIQUE) {
        cfreq[colouring[j]]--;
        colouring[j] = -1;
      }
    }

    // Must be at least as hard as required (and not already solved by a solver
    // that does nothing).
    colouring2.set(colouring);
    if (mapSolver(graph, n, ngraph, colouring2, mindiff - 1) === SOLVER_UNIQUE) {
      if (mindiff > 0 && (n < 9 || n > (2 * wh) / 3)) {
        if (tries-- <= 0) mindiff = 0; // give up and accept Easy
      }
      continue;
    }

    return { desc: encodeMapDesc(w, h, n, map, colouring), aux };
  }
}
