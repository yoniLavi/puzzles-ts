/**
 * Immutable board geometry for Map (upstream `struct map`, `parse_edge_list`,
 * the geometry half of `new_game`, and the desc encoder half of
 * `new_game_desc`).
 *
 * A cell is stored as four triangular **quadrants** (top/bottom/left/right),
 * each holding a region index, so a cell can be diagonally split between two
 * regions. `map[edge*wh + y*w+x]` with `edge ∈ {TE,BE,LE,RE}`.
 */

import { Dsf } from "../../engine/dsf.ts";
import { shuffle } from "../../engine/shuffle.ts";
import { randomNew } from "../../random/index.ts";
import { gengraph, graphEdgeIndex } from "./graph.ts";
import type { MapParams } from "./state.ts";

/** Quadrant plane indices — upstream `enum { TE, BE, LE, RE }`. */
export const TE = 0;
export const BE = 1;
export const LE = 2;
export const RE = 3;

export interface MapData {
  readonly w: number;
  readonly h: number;
  readonly n: number;
  /** `4*wh` region indices, one plane per quadrant (TE/BE/LE/RE). */
  readonly map: Int32Array;
  /** Sorted adjacency edge list (entry `i*n+j`, both directions). */
  readonly graph: Int32Array;
  readonly ngraph: number;
  /** Per-region: is this a fixed clue. */
  readonly immutable: Uint8Array;
  /** Canonical point per graph edge (×2 coords) — error-marker positions. */
  readonly edgex: Int32Array;
  readonly edgey: Int32Array;
  /** Canonical point per region (×2 coords) — region-number label positions. */
  readonly regionx: Int32Array;
  readonly regiony: Int32Array;
}

interface ParsedEdges {
  map: Int32Array;
  next: number;
  error: string | null;
}

/**
 * Decode the edge-list part of a desc (upstream `parse_edge_list`): walk the
 * run-length runs of edge/non-edge, building a union-find over the non-edges,
 * then number the regions in scan order. Returns the region-per-cell grid
 * (`wh` entries), the index just past the edge list, and an error (or null).
 *
 * The region numbering is independent of which element the union-find picks as
 * a class root — a region's number is fixed at its minimum-index cell in scan
 * order — so the shared `Dsf` is byte-match safe here (playbook §4.4).
 */
export function parseEdgeList(
  w: number,
  h: number,
  n: number,
  desc: string,
  start: number,
): ParsedEdges {
  const wh = w * h;
  const map = new Int32Array(wh);
  const dsf = new Dsf(wh);

  let pos = -1;
  let state = false;
  let p = start;

  while (p < desc.length && desc[p] !== ",") {
    const ch = desc[p];
    if (ch < "a" || ch > "z") {
      return { map, next: p, error: "Unexpected character in edge list" };
    }
    let k = ch === "z" ? 25 : ch.charCodeAt(0) - 97 + 1;
    while (k-- > 0) {
      if (pos < 0) {
        pos++;
        continue;
      }
      let x: number;
      let y: number;
      let dx: number;
      let dy: number;
      if (pos < w * (h - 1)) {
        y = Math.floor(pos / w);
        x = pos % w;
        dx = 0;
        dy = 1;
      } else if (pos < 2 * wh - w - h) {
        x = Math.floor((pos - w * (h - 1)) / h);
        y = (pos - w * (h - 1)) % h;
        dx = 1;
        dy = 0;
      } else {
        return { map, next: p, error: "Too much data in edge list" };
      }
      if (!state) dsf.merge(y * w + x, (y + dy) * w + (x + dx));
      pos++;
    }
    if (ch !== "z") state = !state;
    p++;
  }

  if (pos < 2 * wh - w - h) {
    return { map, next: p, error: "Too little data in edge list" };
  }

  // Number the regions.
  let np = 0;
  for (let i = 0; i < wh; i++) map[i] = -1;
  for (let i = 0; i < wh; i++) {
    const canon = dsf.canonify(i);
    if (map[canon] < 0) map[canon] = np++;
    map[i] = map[canon];
  }
  if (np !== n) {
    return { map, next: p, error: "Edge list defines the wrong number of regions" };
  }

  return { map, next: p, error: null };
}

/** Upstream `validate_desc`. */
export function validateDesc(params: MapParams, desc: string): string | null {
  const { w, h, n } = params;
  const parsed = parseEdgeList(w, h, n, desc, 0);
  if (parsed.error) return parsed.error;

  let p = parsed.next;
  if (desc[p] !== ",") return "Expected comma before clue list";
  p++;

  let area = 0;
  while (p < desc.length) {
    const ch = desc[p];
    if (ch >= "0" && ch < String.fromCharCode(48 + 4)) area++;
    else if (ch >= "a" && ch <= "z") area += ch.charCodeAt(0) - 97 + 1;
    else return "Unexpected character in clue list";
    p++;
  }
  if (area < n) return "Too little data in clue list";
  if (area > n) return "Too much data in clue list";
  return null;
}

/**
 * Build the full immutable {@link MapData} plus the initial clue colouring from
 * a desc (upstream `new_game`, geometry half). Assumes the desc has already
 * validated.
 */
export function newMapData(
  params: MapParams,
  desc: string,
): { map: MapData; colouring: Int32Array } {
  const { w, h, n } = params;
  const wh = w * h;

  const parsed = parseEdgeList(w, h, n, desc, 0);
  // The map array holds all four quadrants; quadrant 0 is the parsed grid.
  const map = new Int32Array(4 * wh);
  map.set(parsed.map, 0);
  for (let i = wh; i < 4 * wh; i++) map[i] = map[i % wh];

  // Parse the clue list.
  const colouring = new Int32Array(n).fill(-1);
  const immutable = new Uint8Array(n);
  let p = parsed.next + 1; // skip the comma
  let pos = 0;
  while (p < desc.length) {
    const ch = desc[p];
    if (ch >= "0" && ch < String.fromCharCode(48 + 4)) {
      colouring[pos] = ch.charCodeAt(0) - 48;
      immutable[pos] = 1;
      pos++;
    } else {
      pos += ch.charCodeAt(0) - 97 + 1;
    }
    p++;
  }

  const { graph, ngraph } = gengraph(w, h, n, parsed.map);

  // Smooth jagged outlines via diagonally-divided squares, using an RNG seeded
  // from the desc itself (so the geometry is deterministic per game ID).
  smoothDiagonals(w, h, wh, map, desc);

  // Canonical label points per edge / region (float averaging pass).
  const { edgex, edgey, regionx, regiony } = computeLabelPoints(
    w,
    h,
    wh,
    n,
    map,
    graph,
    ngraph,
  );

  return {
    map: {
      w,
      h,
      n,
      map,
      graph,
      ngraph,
      immutable,
      edgex,
      edgey,
      regionx,
      regiony,
    },
    colouring,
  };
}

/** Upstream diagonal-smoothing pass in `new_game` (1913-1961). */
function smoothDiagonals(
  w: number,
  h: number,
  wh: number,
  map: Int32Array,
  desc: string,
): void {
  const rs = randomNew(desc);
  const squares: number[] = [];
  for (let i = 0; i < wh; i++) squares.push(i);
  shuffle(squares, rs);

  let doneSomething: boolean;
  do {
    doneSomething = false;
    for (let i = 0; i < wh; i++) {
      const y = Math.floor(squares[i] / w);
      const x = squares[i] % w;
      const c = map[y * w + x];

      if (x === 0 || x === w - 1 || y === 0 || y === h - 1) continue;
      if (map[TE * wh + y * w + x] !== map[BE * wh + y * w + x]) continue;

      const tc = map[BE * wh + (y - 1) * w + x];
      const bc = map[TE * wh + (y + 1) * w + x];
      const lc = map[RE * wh + y * w + (x - 1)];
      const rc = map[LE * wh + y * w + (x + 1)];

      if (tc !== bc && (tc === c || bc === c)) {
        if ((lc === tc && rc === bc) || (lc === bc && rc === tc)) {
          map[TE * wh + y * w + x] = tc;
          map[BE * wh + y * w + x] = bc;
          map[LE * wh + y * w + x] = lc;
          map[RE * wh + y * w + x] = rc;
          doneSomething = true;
        }
      }
    }
  } while (doneSomething);
}

/**
 * Upstream `new_game`'s two-pass float averaging (1963-2181): find a canonical
 * point for each graph edge (error-marker positions) and region (label
 * positions). Coordinates are stored as ×2 so half-integers are representable.
 * Display-only (byte-parity scope doctrine, design D2).
 */
function computeLabelPoints(
  w: number,
  h: number,
  wh: number,
  n: number,
  map: Int32Array,
  graph: Int32Array,
  ngraph: number,
): { edgex: Int32Array; edgey: Int32Array; regionx: Int32Array; regiony: Int32Array } {
  const total = ngraph + n;
  const ax = new Float64Array(total);
  const ay = new Float64Array(total);
  const an = new Int32Array(total);
  const bestx = new Int32Array(total).fill(-1);
  const besty = new Int32Array(total).fill(-1);
  const best = new Float64Array(total).fill(2 * (w + h) + 1);

  for (let pass = 0; pass < 2; pass++) {
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        const ex: number[] = [];
        const ey: number[] = [];
        const ea: number[] = [];
        const eb: number[] = [];

        if (x + 1 < w) {
          ea.push(map[RE * wh + y * w + x]);
          eb.push(map[LE * wh + y * w + (x + 1)]);
          ex.push((x + 1) * 2);
          ey.push(y * 2 + 1);
        }
        if (y + 1 < h) {
          ea.push(map[BE * wh + y * w + x]);
          eb.push(map[TE * wh + (y + 1) * w + x]);
          ex.push(x * 2 + 1);
          ey.push((y + 1) * 2);
        }
        // diagonal edge
        ea.push(map[TE * wh + y * w + x]);
        eb.push(map[BE * wh + y * w + x]);
        ex.push(x * 2 + 1);
        ey.push(y * 2 + 1);

        if (x + 1 < w && y + 1 < h) {
          const oct = [
            map[RE * wh + y * w + x],
            map[LE * wh + y * w + (x + 1)],
            map[BE * wh + y * w + (x + 1)],
            map[TE * wh + (y + 1) * w + (x + 1)],
            map[LE * wh + (y + 1) * w + (x + 1)],
            map[RE * wh + (y + 1) * w + x],
            map[TE * wh + (y + 1) * w + x],
            map[BE * wh + y * w + x],
          ];
          let othercol = -1;
          let nchanges = 0;
          let i = 0;
          for (; i < 8; i++) {
            if (oct[i] !== oct[0]) {
              if (othercol < 0) othercol = oct[i];
              else if (othercol !== oct[i]) break; // three colours here
            }
            if (oct[i] !== oct[(i + 1) & 7]) nchanges++;
          }
          if (i === 8 && othercol >= 0 && nchanges === 2) {
            ea.push(oct[0]);
            eb.push(othercol);
            ex.push((x + 1) * 2);
            ey.push((y + 1) * 2);
          }
          if (othercol < 0) {
            ea.push(oct[0]);
            eb.push(oct[0]);
            ex.push((x + 1) * 2);
            ey.push((y + 1) * 2);
          }
        }

        for (let i = 0; i < ea.length; i++) {
          const emin = Math.min(ea[i], eb[i]);
          const emax = Math.max(ea[i], eb[i]);
          const gindex =
            emin !== emax
              ? graphEdgeIndex(graph, n, ngraph, emin, emax)
              : ngraph + emin;
          if (gindex < 0) continue;

          if (pass === 0) {
            ax[gindex] += ex[i];
            ay[gindex] += ey[i];
            an[gindex] += 1;
          } else {
            const dx = ex[i] - ax[gindex];
            const dy = ey[i] - ay[gindex];
            const d = Math.sqrt(dx * dx + dy * dy);
            if (d < best[gindex]) {
              best[gindex] = d;
              bestx[gindex] = ex[i];
              besty[gindex] = ey[i];
            }
          }
        }
      }

    if (pass === 0) {
      for (let i = 0; i < total; i++)
        if (an[i] > 0) {
          ax[i] /= an[i];
          ay[i] /= an[i];
        }
    }
  }

  const edgex = bestx.slice(0, ngraph);
  const edgey = besty.slice(0, ngraph);
  const regionx = bestx.slice(ngraph, ngraph + n);
  const regiony = besty.slice(ngraph, ngraph + n);

  // An edge that never got a canonical point borrows its other direction's.
  for (let i = 0; i < ngraph; i++) {
    if (edgex[i] < 0) {
      const e = graph[i];
      const iprime = graphEdgeIndex(graph, n, ngraph, e % n, Math.floor(e / n));
      edgex[i] = edgex[iprime];
      edgey[i] = edgey[iprime];
    }
  }

  return { edgex, edgey, regionx, regiony };
}

/**
 * Encode a board (region-per-cell grid + clue colouring) into a desc, upstream
 * `new_game_desc`'s encoding half. `map` is the `wh` region grid (quadrant 0),
 * `colouring` the per-region clue colour (-1 = unclued).
 */
export function encodeMapDesc(
  w: number,
  h: number,
  n: number,
  map: Int32Array,
  colouring: Int32Array,
): string {
  let ret = "";

  // Edge list: runs of edge/non-edge, horizontal edges row by row then
  // vertical edges column by column. A notional leading non-edge, and `z` =
  // run of 25 with NO state switch.
  {
    let run = 1;
    let pv = false;
    const nedges = w * (h - 1) + (w - 1) * h;
    for (let i = 0; i < nedges; i++) {
      let x: number;
      let y: number;
      let dx: number;
      let dy: number;
      if (i < w * (h - 1)) {
        y = Math.floor(i / w);
        x = i % w;
        dx = 0;
        dy = 1;
      } else {
        x = Math.floor((i - w * (h - 1)) / h);
        y = (i - w * (h - 1)) % h;
        dx = 1;
        dy = 0;
      }
      const v = map[y * w + x] !== map[(y + dy) * w + (x + dx)];
      if (pv !== v) {
        ret += String.fromCharCode(96 + run);
        run = 1;
        pv = v;
      } else {
        if (run === 25) {
          ret += "z";
          run = 0;
        }
        run++;
      }
    }
    ret += String.fromCharCode(96 + run);
    ret += ",";
  }

  // Clue list: digits 0-3 interspersed with blank-run letters. Here `z` = a
  // run of 26 (no implicit state switch).
  {
    let run = 0;
    for (let i = 0; i < n; i++) {
      if (colouring[i] < 0) {
        if (run === 26) {
          ret += "z";
          run = 0;
        }
        run++;
      } else {
        if (run > 0) ret += String.fromCharCode(96 + run);
        ret += String.fromCharCode(48 + colouring[i]);
        run = 0;
      }
    }
    if (run > 0) ret += String.fromCharCode(96 + run);
  }

  return ret;
}
