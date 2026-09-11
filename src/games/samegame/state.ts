import { parseDimensions } from "../../engine/params.ts";
import type { GridCursor } from "../../engine/pointer.ts";
import { type RandomState, randomUpto } from "../../engine/random/index.ts";
import type { GameStatus } from "../../engine/types.ts";

// --- types ------------------------------------------------------------

export interface SamegameParams {
  w: number;
  h: number;
  ncols: number;
  /** 1 or 2: score a removal of `n` tiles as `(n-1)²` or `(n-2)²`. */
  scoresub: number;
  /** Choose the generation algorithm: guaranteed-soluble vs legacy random. */
  soluble: boolean;
}

export interface SamegameState {
  readonly w: number;
  readonly h: number;
  readonly ncols: number;
  readonly scoresub: number;
  /** Color per cell in row-major order; `0` is empty, `1..ncols` a color. */
  readonly tiles: readonly number[];
  readonly score: number;
  readonly completed: boolean;
  /** No two orthogonally-adjacent tiles share a color (no move remains).
   * NOT a loss: upstream leaves it rescuable by Undo. */
  readonly impossible: boolean;
}

/** Remove the listed grid indices (upstream's `M12,13,...` string). The
 * indices are a connected same-color region of size ≥ 2, enforced at
 * `interpretMove` time; `executeMove` only range-checks. Plain JSON data, so
 * the default move codec suffices. */
export type SamegameMove = { type: "remove"; tiles: number[] };

/** The picked-but-not-yet-removed selection lives here, not in the game
 * state (upstream `game_ui`): selecting a region then changing your mind
 * is not an undoable move, and the selection resets across every real
 * transition via `changedState`. */
export interface SamegameUi {
  /** Per-cell selected flag, length `w*h`. */
  selected: boolean[];
  nselected: number;
  cursor: GridCursor;
}

// --- scoring ----------------------------------------------------------

/** Upstream `npoints`: a removal of `nsel` tiles scores `(nsel-scoresub)²`,
 * clamped at 0. */
export function npoints(scoresub: number, nsel: number): number {
  const sdiff = nsel - scoresub;
  return sdiff > 0 ? sdiff * sdiff : 0;
}

// --- params -----------------------------------------------------------

export function defaultParams(): SamegameParams {
  return { w: 5, h: 5, ncols: 3, scoresub: 2, soluble: true };
}

function isDigit(ch: string | undefined): boolean {
  return ch !== undefined && ch >= "0" && ch <= "9";
}

export function encodeParams(p: SamegameParams, full: boolean): string {
  return `${p.w}x${p.h}c${p.ncols}s${p.scoresub}${full && !p.soluble ? "r" : ""}`;
}

export function decodeParams(s: string): SamegameParams {
  // Faithful to upstream `decode_params`: `W[xH][cN][sS][r]`, lenient.
  const { w, h, next } = parseDimensions(s);
  const ret = { ...defaultParams(), w, h };
  let i = next;
  if (s[i] === "c") {
    i++;
    ret.ncols = Number.parseInt(s.slice(i), 10) || 0;
    while (isDigit(s[i])) i++;
  }
  if (s[i] === "s") {
    i++;
    ret.scoresub = Number.parseInt(s.slice(i), 10) || 0;
    while (isDigit(s[i])) i++;
  }
  // `r` selects the not-guaranteed-soluble generator; absent ⇒ soluble.
  ret.soluble = s[i] !== "r";
  return ret;
}

export function validateParams(p: SamegameParams, _full: boolean): string | null {
  if (p.w < 1 || p.h < 1) return "Width and height must both be positive";
  if (p.w > Number.MAX_SAFE_INTEGER / p.h)
    return "Width times height must not be unreasonably large";
  if (p.ncols > 9) return "Maximum of 9 colors";
  if (p.soluble) {
    if (p.ncols < 3) return "Number of colors must be at least three";
    if (p.w * p.h <= 1) return "Grid area must be greater than 1";
  } else {
    if (p.ncols < 2) return "Number of colors must be at least three";
    // Need at least two of each color for theoretical solubility.
    if (p.w * p.h < p.ncols * 2)
      return "Too many colors makes given grid size impossible";
  }
  if (p.scoresub < 1 || p.scoresub > 2) return "Scoring system not recognized";
  return null;
}

// --- presets ----------------------------------------------------------

export function presets() {
  const p = (
    w: number,
    h: number,
    ncols: number,
  ): { title: string; params: SamegameParams } => ({
    title: `${w}x${h}, ${ncols} colors`,
    params: { w, h, ncols, scoresub: 2, soluble: true },
  });
  return {
    title: "Type",
    submenu: [p(5, 5, 3), p(10, 5, 3), p(15, 10, 3), p(15, 10, 4), p(20, 15, 4)],
  };
}

// --- guaranteed-soluble generator -------------------------------------

/**
 * Upstream `gen_grid`: build a soluble board by playing the game backwards,
 * repeatedly inserting a verified connected two-square blob whose removal
 * reproduces the previous grid, so the intended solution always receives the
 * minimum possible score.
 *
 * The `randomUpto` calls (the blob-color seed, the shuffle-and-consume of the
 * insertion list, the neighbor-excluding color pick, the extension direction)
 * happen in C's order, so the grid matches the frozen differential bit for
 * bit. Returns the grid as a flat color array.
 */
// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: grid generation with color-run constraints and solvability retry.
function genGrid(w: number, h: number, nc: number, rng: RandomState): number[] {
  const wh = w * h;
  const tc = nc + 1; // sentinel "provisional" color during verification
  const grid = new Array<number>(wh).fill(0);
  const grid2 = new Array<number>(wh).fill(0);
  const list = new Array<number>(wh + w).fill(0);

  for (;;) {
    // Start with two or three squares (parity of w*h) of a random color.
    grid.fill(0);
    const j = 2 + (wh % 2);
    let c = 1 + randomUpto(rng, nc);
    if (j <= w) {
      for (let i = 0; i < j; i++) grid[(h - 1) * w + i] = c;
    } else {
      // Only reachable for w === 1 (j up to 3); place vertically.
      for (let i = 0; i < j; i++) grid[(h - 1 - i) * w] = c;
    }

    for (;;) {
      let n = 0;

      // Build the list of insertion points (column-internal, encoded
      // `y*w+x`; new columns, encoded `h*w+x`).
      if (grid[wh - 1] === 0) {
        for (let i = 0; i < w; i++) {
          list[n++] = wh + i;
          if (grid[(h - 1) * w + i] === 0) break;
        }
      }
      for (let i = 0; i < w; i++) {
        if (grid[(h - 1) * w + i] === 0) break; // no more columns
        if (grid[i] !== 0) continue; // this column is full
        for (let jj = h - 1; jj >= 0; jj--) {
          list[n++] = jj * w + i;
          if (grid[jj * w + i] === 0) break; // this column is exhausted
        }
      }

      if (n === 0) break; // we're done

      // Try each list element in random order until one yields a verified
      // inverse move.
      while (n-- > 0) {
        const idx = randomUpto(rng, n + 1);
        const pos = list[idx];
        list[idx] = list[n];

        const x = pos % w;
        let y = Math.floor(pos / w);

        for (let i = 0; i < wh; i++) grid2[i] = grid[i];

        if (y === h) {
          // Insert a column at position x: shift columns >x rightward,
          // clear column x, then drop y into the grid proper.
          for (let i = w - 1; i > x; i--)
            for (let jj = 0; jj < h; jj++) grid2[jj * w + i] = grid2[jj * w + (i - 1)];
          for (let jj = 0; jj < h; jj++) grid2[jj * w + x] = 0;
          y--;
        }

        // Insert a square within column x at position y (shift the column
        // above y up by one).
        for (let i = 0; i + 1 <= y; i++) grid2[i * w + x] = grid2[(i + 1) * w + x];

        // Pick a color distinct from all neighbors of (x,y): skipping the
        // neighbors' colors needs them sorted and deduplicated.
        const neighbors: number[] = [];
        if (x > 0) neighbors.push(grid2[y * w + (x - 1)]);
        if (x + 1 < w) neighbors.push(grid2[y * w + (x + 1)]);
        if (y > 0) neighbors.push(grid2[(y - 1) * w + x]);
        if (y + 1 < h) neighbors.push(grid2[(y + 1) * w + x]);
        const wrongcol = [...new Set(neighbors)]
          .filter((col) => col > 0)
          .sort((a, b) => a - b);
        if (wrongcol.length === nc) continue; // no color will go here
        c = 1 + randomUpto(rng, nc - wrongcol.length);
        for (const col of wrongcol) {
          if (c >= col) c++;
          else break;
        }

        // Place the new square provisionally as the sentinel color `tc`.
        grid2[y * w + x] = tc;

        // Extend the blob left, right, or up.
        const dirs: number[] = [];
        if (
          x > 0 &&
          grid2[y * w + (x - 1)] !== c &&
          grid2[x - 1] === 0 &&
          (y + 1 >= h || grid2[(y + 1) * w + (x - 1)] !== c) &&
          (y + 1 >= h || grid2[(y + 1) * w + (x - 1)] !== 0) &&
          (x <= 1 || grid2[y * w + (x - 2)] !== c)
        )
          dirs.push(-1); // left
        if (
          x + 1 < w &&
          grid2[y * w + (x + 1)] !== c &&
          grid2[x + 1] === 0 &&
          (y + 1 >= h || grid2[(y + 1) * w + (x + 1)] !== c) &&
          (y + 1 >= h || grid2[(y + 1) * w + (x + 1)] !== 0) &&
          (x + 2 >= w || grid2[y * w + (x + 2)] !== c)
        )
          dirs.push(+1); // right
        if (
          y > 0 &&
          grid2[x] === 0 &&
          (x <= 0 || grid2[(y - 1) * w + (x - 1)] !== c) &&
          (x + 1 >= w || grid2[(y - 1) * w + (x + 1)] !== c)
        ) {
          // Added twice so a vertical domino is about as likely as a
          // horizontal one (debias).
          dirs.push(0, 0);
        }

        if (dirs.length === 0) continue;
        const dir = dirs[randomUpto(rng, dirs.length)];

        // Insert the blob's second square within column (x+dir).
        for (let i = 0; i + 1 <= y; i++)
          grid2[i * w + x + dir] = grid2[(i + 1) * w + x + dir];
        grid2[y * w + x + dir] = tc;

        // Reject placements that split the remaining squares into a
        // sub-area of odd size we can't complete (a spare column can fix
        // one odd subarea when h is odd).
        {
          let nerrs = 0;
          let nfix = 0;
          let k = 0; // current subarea size
          for (let i = 0; i < w; i++) {
            if (grid2[(h - 1) * w + i] === 0) {
              if (h % 2) nfix++;
              continue;
            }
            let jj = 0;
            for (; jj < h && grid2[jj * w + i] === 0; jj++);
            if (jj === 0) {
              if (k % 2) nerrs++;
              k = 0;
            } else {
              k += jj;
            }
          }
          if (k % 2) nerrs++;
          if (nerrs > nfix) continue; // try a different placement
        }

        // Verify the inverse move: removing every `tc` square (and
        // shuffling up) reproduces `grid`, no `tc` is adjacent to `c`, and
        // the `tc` squares form one connected component (checked by the
        // BFS fill below).
        let ok = true;
        let fillstart = -1;
        for (let x1 = 0, x2 = 0; x2 < w; x2++) {
          let usedcol = false;
          let y1 = h - 1;
          for (let y2 = h - 1; y2 >= 0; y2--) {
            if (grid2[y2 * w + x2] === tc) {
              if (fillstart === -1) fillstart = y2 * w + x2;
              if (
                (y2 + 1 < h && grid2[(y2 + 1) * w + x2] === c) ||
                (y2 - 1 >= 0 && grid2[(y2 - 1) * w + x2] === c) ||
                (x2 + 1 < w && grid2[y2 * w + x2 + 1] === c) ||
                (x2 - 1 >= 0 && grid2[y2 * w + x2 - 1] === c)
              )
                ok = false;
              continue;
            }
            if (grid2[y2 * w + x2] === 0) break;
            usedcol = true;
            if (grid2[y2 * w + x2] !== grid[y1 * w + x1]) ok = false;
            y1--;
          }
          if (usedcol) {
            while (y1 >= 0) {
              if (grid[y1 * w + x1] !== 0) ok = false;
              y1--;
            }
          }
          if (!ok) break;
          if (usedcol) x1++;
        }

        // Upstream asserts this never happens; its NDEBUG build skips the
        // placement and hopes the next one avoids the fault. So does this.
        if (!ok) continue;

        // BFS-fill the `tc` region as color `c` (also proves connectivity).
        {
          const queue: number[] = [fillstart];
          let qi = 0;
          while (qi < queue.length) {
            const k = queue[qi++];
            const qx = k % w;
            const qy = Math.floor(k / w);
            grid2[k] = c;
            if (qx > 0 && grid2[k - 1] === tc) queue.push(k - 1);
            if (qx + 1 < w && grid2[k + 1] === tc) queue.push(k + 1);
            if (qy > 0 && grid2[k - w] === tc) queue.push(k - w);
            if (qy + 1 < h && grid2[k + w] === tc) queue.push(k + w);
          }
        }

        for (let i = 0; i < wh; i++) grid[i] = grid2[i];
        break; // done it!
      }

      if (n < 0) break; // tried every insertion point, none worked
    }

    // Retry the whole board if any cell stayed empty.
    if (!grid.includes(0)) break;
  }

  return grid;
}

// --- legacy random generator ------------------------------------------

/** Faithful port of `gen_grid_random`: place two of each color at random
 * empty cells, then fill the rest at random. Not guaranteed soluble. */
function genGridRandom(w: number, h: number, nc: number, rng: RandomState): number[] {
  const n = w * h;
  const grid = new Array<number>(n).fill(0);
  for (let c = 1; c <= nc; c++) {
    for (let jj = 0; jj < 2; jj++) {
      let i: number;
      do {
        i = randomUpto(rng, n);
      } while (grid[i] !== 0);
      grid[i] = c;
    }
  }
  for (let i = 0; i < n; i++) {
    if (grid[i] === 0) grid[i] = randomUpto(rng, nc) + 1;
  }
  return grid;
}

// --- desc -------------------------------------------------------------

export function newDesc(p: SamegameParams, rng: RandomState): { desc: string } {
  const tiles = p.soluble
    ? genGrid(p.w, p.h, p.ncols, rng)
    : genGridRandom(p.w, p.h, p.ncols, rng);
  return { desc: tiles.join(",") };
}

export function validateDesc(p: SamegameParams, desc: string): string | null {
  const area = p.w * p.h;
  let i = 0;
  for (let cell = 0; cell < area; cell++) {
    if (!isDigit(desc[i])) return "Not enough numbers in string";
    const start = i;
    while (isDigit(desc[i])) i++;
    if (cell < area - 1 && desc[i] !== ",") return "Expected comma after number";
    if (cell === area - 1 && i < desc.length) return "Excess junk at end of string";
    const num = Number.parseInt(desc.slice(start, i), 10);
    if (num < 0 || num > p.ncols) return "Color out of range";
    if (desc[i] === ",") i++;
  }
  return null;
}

export function newState(p: SamegameParams, desc: string): SamegameState {
  const area = p.w * p.h;
  const tiles = new Array<number>(area).fill(0);
  let i = 0;
  for (let cell = 0; cell < area; cell++) {
    const start = i;
    while (isDigit(desc[i])) i++;
    tiles[cell] = Number.parseInt(desc.slice(start, i), 10) || 0;
    if (desc[i] === ",") i++;
  }
  return {
    w: p.w,
    h: p.h,
    ncols: p.ncols,
    scoresub: p.scoresub,
    tiles,
    score: 0,
    completed: false,
    impossible: false,
  };
}

// --- gravity + completion ---------------------------------------------

/** Upstream `sg_snuggle`: let unsupported tiles fall to the bottom of
 * their columns, then shuffle non-empty columns as far left as they go.
 * Mutates `tiles` in place (the caller owns the copy). */
export function snuggle(tiles: number[], w: number, h: number): void {
  // Make all unsupported tiles fall down.
  let moved: boolean;
  do {
    moved = false;
    for (let x = 0; x < w; x++) {
      for (let y = h - 1; y > 0; y--) {
        if (tiles[y * w + x] !== 0) continue;
        if (tiles[(y - 1) * w + x] !== 0) {
          tiles[y * w + x] = tiles[(y - 1) * w + x];
          tiles[(y - 1) * w + x] = 0;
          moved = true;
        }
      }
    }
  } while (moved);

  // Shuffle all columns as far left as they can go.
  const emptyCol = (x: number): boolean => {
    for (let y = 0; y < h; y++) if (tiles[y * w + x] !== 0) return false;
    return true;
  };
  do {
    moved = false;
    for (let x = 0; x < w - 1; x++) {
      if (emptyCol(x) && !emptyCol(x + 1)) {
        moved = true;
        for (let y = 0; y < h; y++) {
          tiles[y * w + x] = tiles[y * w + (x + 1)];
          tiles[y * w + (x + 1)] = 0;
        }
      }
    }
  } while (moved);
}

/** Upstream `sg_check`: `complete` iff the grid is empty; `impossible`
 * iff no two orthogonally-adjacent tiles share a color. */
export function check(
  tiles: readonly number[],
  w: number,
  h: number,
): { complete: boolean; impossible: boolean } {
  let complete = true;
  let impossible = true;
  for (let x = 0; x < w; x++) {
    for (let y = 0; y < h; y++) {
      const c = tiles[y * w + x];
      if (c === 0) continue;
      complete = false;
      if (x + 1 < w && tiles[y * w + (x + 1)] === c) impossible = false;
      if (y + 1 < h && tiles[(y + 1) * w + x] === c) impossible = false;
    }
  }
  return { complete, impossible };
}

// --- status / text ----------------------------------------------------

/** Upstream `game_status`: solved when complete; otherwise ongoing. A
 * no-moves-left (`impossible`) position is NOT a loss — it is rescuable by
 * Undo, so this never returns `"lost"`. */
export function status(state: SamegameState): GameStatus {
  return state.completed ? "solved" : "ongoing";
}

/** One digit per tile, a space for an empty cell. Upstream also spells
 * colors from 10 as letters, which `validateParams` puts out of reach. */
export function textFormat({ w, h, tiles }: SamegameState): string {
  let out = "";
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) out += tiles[y * w + x] || " ";
    out += "\n";
  }
  return out;
}
