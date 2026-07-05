/**
 * Types and pure state helpers for Signpost — the linked-chain model.
 *
 * Idiomatic port of the state core of `puzzles/signpost.c`: the
 * `next`/`prev` chain links, the `Dsf` binding linked cells into
 * regions, and the derived per-cell sequence-number + 16-way region
 * colouring (`update_numbers` / `head_number` / `connect_numbers`) that
 * renders each partial chain as a coloured gradient. The state is a
 * mutable record cloned per move (`cloneState`); the engine boundary
 * treats it immutably (executeMove clones, then mutates the copy).
 */

import { Dsf } from "../../engine/dsf.ts";

// --- directions ------------------------------------------------------

export const DIR_MAX = 8;
// N, NE, E, SE, S, SW, W, NW
export const DXS = [0, 1, 1, 1, 0, -1, -1, -1] as const;
export const DYS = [-1, -1, 0, 1, 1, 1, 0, -1] as const;
export const dirOpposite = (d: number): number => (d + 4) % 8;

// --- flags -----------------------------------------------------------

export const FLAG_IMMUTABLE = 1;
export const FLAG_ERROR = 2;

// --- types -----------------------------------------------------------

export interface SignpostParams {
  w: number;
  h: number;
  forceCornerStart: boolean;
}

export interface SignpostState {
  params: SignpostParams;
  w: number;
  h: number;
  n: number;
  completed: boolean;
  usedSolve: boolean;
  impossible: boolean;
  /** Arrow direction (0..7) per cell — set from the desc, never changed
   * by play (the generator mutates its own working boards). */
  dirs: Int8Array;
  /** Derived sequence number per cell: a real number 1..n, or a
   * colour-group-encoded placeholder `START(c) + offset` (0 = blank). */
  nums: Int32Array;
  /** FLAG_IMMUTABLE | FLAG_ERROR bits per cell. */
  flags: Uint8Array;
  /** Chain links (cell indices, -1 = absent). */
  next: Int32Array;
  prev: Int32Array;
  /** Inverse of `nums` for real numbers: numsi[k] = cell of number k
   * (-1 = absent). Length n+1. */
  numsi: Int32Array;
  /** Binds linked cells into regions. */
  dsf: Dsf;
}

/** findMistakes flags a wrongly-linked cell (its outgoing link is not
 * the one the unique solution makes). */
export type SignpostMistake = { kind: "link"; index: number };

/** Persisted UI: keyboard cursor + drag tracking + the flash preference. */
export interface SignpostUi {
  cx: number;
  cy: number;
  cshow: boolean;
  dragging: boolean;
  dragIsFrom: boolean;
  /** Grid coords of the drag start cell. */
  sx: number;
  sy: number;
  /** Pixel coords of the current drag position. */
  dx: number;
  dy: number;
  /** Preference: meshing-gears victory rotation (else unidirectional). */
  gearMode: boolean;
}

export type SignpostMove =
  | { type: "link"; fromX: number; fromY: number; toX: number; toY: number }
  | { type: "unlinkNext"; x: number; y: number }
  | { type: "unlinkPrev"; x: number; y: number }
  /** Apply a full solution: the `next` link of every cell (-1 = none). */
  | { type: "solve"; next: number[] };

export interface SignpostDrawState {
  started: boolean;
  tileSize: number;
  w: number;
  h: number;
  n: number;
  /** Per-cell packed cache of the last-drawn frame (flags/dir/cursor). */
  cache: Int32Array;
  /** Last-drawn derived number per cell (kept separate — up to n·(n+1)
   * exceeds the packed word). */
  nums: Int32Array;
  /** Last-drawn inbound-arrow direction per cell (-1 = none). */
  dirp: Int32Array;
  angleOffset: number;
  dragging: boolean;
  dragBackground: unknown;
  dragX: number;
  dragY: number;
}

// --- allocation ------------------------------------------------------

export function blankState(params: SignpostParams): SignpostState {
  const { w, h } = params;
  const n = w * h;
  return {
    params,
    w,
    h,
    n,
    completed: false,
    usedSolve: false,
    impossible: false,
    dirs: new Int8Array(n),
    nums: new Int32Array(n),
    flags: new Uint8Array(n),
    next: new Int32Array(n).fill(-1),
    prev: new Int32Array(n).fill(-1),
    numsi: new Int32Array(n + 1).fill(-1),
    dsf: new Dsf(n),
  };
}

export function cloneState(s: SignpostState): SignpostState {
  return {
    params: s.params,
    w: s.w,
    h: s.h,
    n: s.n,
    completed: s.completed,
    usedSolve: s.usedSolve,
    impossible: s.impossible,
    dirs: new Int8Array(s.dirs),
    nums: new Int32Array(s.nums),
    flags: new Uint8Array(s.flags),
    next: new Int32Array(s.next),
    prev: new Int32Array(s.prev),
    numsi: new Int32Array(s.numsi),
    dsf: s.dsf.clone(),
  };
}

/** Copy every mutable field of `src` into `dst` in place (upstream
 * `dup_game_to`), so the caller's live reference keeps its identity.
 * The `dsf` is not copied: it is rebuilt from `next`/`prev` by
 * `updateNumbers` before any read. */
export function assignStateInto(dst: SignpostState, src: SignpostState): void {
  dst.completed = src.completed;
  dst.usedSolve = src.usedSolve;
  dst.impossible = src.impossible;
  dst.dirs.set(src.dirs);
  dst.nums.set(src.nums);
  dst.flags.set(src.flags);
  dst.next.set(src.next);
  dst.prev.set(src.prev);
  dst.numsi.set(src.numsi);
}

/** Upstream `strip_nums`: zero every non-immutable number and clear all
 * links (the derived numbering is recomputed by `updateNumbers`). */
export function stripNums(s: SignpostState): void {
  for (let i = 0; i < s.n; i++) {
    if (!(s.flags[i] & FLAG_IMMUTABLE)) s.nums[i] = 0;
  }
  s.next.fill(-1);
  s.prev.fill(-1);
  s.numsi.fill(-1);
  s.dsf.reinit();
}

/** Reset a state to "blank" in place (upstream `blank_game_into`),
 * reusing its arrays. */
export function blankInto(s: SignpostState): void {
  s.dirs.fill(0);
  s.nums.fill(0);
  s.flags.fill(0);
  s.next.fill(-1);
  s.prev.fill(-1);
  s.numsi.fill(-1);
  s.completed = false;
  s.usedSolve = false;
  s.impossible = false;
  s.dsf.reinit();
}

// --- geometry / pointing --------------------------------------------

export const isReal = (s: SignpostState, num: number): boolean =>
  num > 0 && num <= s.n;

export const inGrid = (s: SignpostState, x: number, y: number): boolean =>
  x >= 0 && x < s.w && y >= 0 && y < s.h;

export function whichDir(fromx: number, fromy: number, tox: number, toy: number): number {
  let dx = tox - fromx;
  let dy = toy - fromy;
  if (dx && dy && Math.abs(dx) !== Math.abs(dy)) return -1;
  if (dx) dx = dx / Math.abs(dx);
  if (dy) dy = dy / Math.abs(dy);
  for (let i = 0; i < DIR_MAX; i++) {
    if (dx === DXS[i] && dy === DYS[i]) return i;
  }
  return -1;
}

export function whichDirI(s: SignpostState, fromi: number, toi: number): number {
  const w = s.w;
  return whichDir(fromi % w, Math.floor(fromi / w), toi % w, Math.floor(toi / w));
}

/** True iff the arrow at (fromx,fromy) sweeps over (tox,toy). */
export function isPointing(
  s: SignpostState,
  fromx: number,
  fromy: number,
  tox: number,
  toy: number,
): boolean {
  const w = s.w;
  const dir = s.dirs[fromy * w + fromx];
  if (fromx === tox && fromy === toy) return false;
  if (s.nums[fromy * w + fromx] === s.n) return false; // final number points nowhere
  let x = fromx;
  let y = fromy;
  for (;;) {
    if (!inGrid(s, x, y)) return false;
    if (x === tox && y === toy) return true;
    x += DXS[dir];
    y += DYS[dir];
  }
}

export function isPointingI(s: SignpostState, fromi: number, toi: number): boolean {
  const w = s.w;
  return isPointing(s, fromi % w, Math.floor(fromi / w), toi % w, Math.floor(toi / w));
}

/** Would the region at (x,y) fit in the numeric gap above/below `num`? */
function moveCouldFit(
  s: SignpostState,
  num: number,
  d: number,
  x: number,
  y: number,
): boolean {
  const i = y * s.w + x;
  let gap = 0;
  let nn = num + d;
  while (isReal(s, nn) && s.numsi[nn] === -1) {
    nn += d;
    gap++;
  }
  if (gap === 0) {
    // No gap: the only allowable move directly links the two numbers.
    return s.nums[i] !== num + d;
  }
  if (s.prev[i] === -1 && s.next[i] === -1) return true; // lone square
  return s.dsf.size(i) <= gap;
}

/** Upstream `isvalidmove`. */
export function isValidMove(
  s: SignpostState,
  clever: boolean,
  fromx: number,
  fromy: number,
  tox: number,
  toy: number,
): boolean {
  const w = s.w;
  const from = fromy * w + fromx;
  const to = toy * w + tox;
  if (!inGrid(s, fromx, fromy) || !inGrid(s, tox, toy)) return false;
  if (!isPointing(s, fromx, fromy, tox, toy)) return false;

  const nfrom = s.nums[from];
  const nto = s.nums[to];

  if (
    (nfrom === s.n && s.flags[from] & FLAG_IMMUTABLE) ||
    (nto === 1 && s.flags[to] & FLAG_IMMUTABLE)
  ) {
    return false;
  }
  if (s.dsf.equivalent(from, to)) return false; // would form a loop

  if (isReal(s, nfrom) && isReal(s, nto)) {
    if (nfrom !== nto - 1) return false;
  } else if (clever && isReal(s, nfrom)) {
    if (!moveCouldFit(s, nfrom, +1, tox, toy)) return false;
  } else if (clever && isReal(s, nto)) {
    if (!moveCouldFit(s, nto, -1, fromx, fromy)) return false;
  }
  return true;
}

// --- link editing ----------------------------------------------------

export function makeLink(s: SignpostState, from: number, to: number): void {
  if (s.next[from] !== -1) s.prev[s.next[from]] = -1;
  s.next[from] = to;
  if (s.prev[to] !== -1) s.next[s.prev[to]] = -1;
  s.prev[to] = from;
}

export function unlinkCell(s: SignpostState, si: number): void {
  if (s.prev[si] !== -1) {
    s.next[s.prev[si]] = -1;
    s.prev[si] = -1;
  }
  if (s.next[si] !== -1) {
    s.prev[s.next[si]] = -1;
    s.next[si] = -1;
  }
}

// --- region numbering + colouring -----------------------------------

export const colourOf = (s: SignpostState, a: number): number =>
  Math.floor(a / (s.n + 1));
export const startOf = (s: SignpostState, c: number): number => c * (s.n + 1);

interface HeadMeta {
  i: number;
  sz: number;
  start: number;
  preference: number; // 0 = none, 1 = has preference, -1 = was duplicate
}

function headNumber(s: SignpostState, i: number): HeadMeta {
  const head: HeadMeta = { i, sz: s.dsf.size(i), start: 0, preference: 0 };
  let off = 0;
  let j = i;

  // Search the chain for immutable numbers, checking consistency.
  while (j !== -1) {
    if (s.flags[j] & FLAG_IMMUTABLE) {
      const ss = s.nums[j] - off;
      if (!head.preference) {
        head.start = ss;
        head.preference = 1;
      } else if (head.start !== ss) {
        s.impossible = true;
      }
    }
    off++;
    j = s.next[j];
  }
  if (head.preference) return head;

  if (s.nums[i] === 0 && s.nums[s.next[i]] > s.n) {
    head.start = startOf(s, colourOf(s, s.nums[s.next[i]]));
    head.preference = 1;
  } else if (s.nums[i] <= s.n) {
    head.start = 0;
    head.preference = 0;
  } else {
    const c = colourOf(s, s.nums[i]);
    let nn = 1;
    const sz = s.dsf.size(i);
    j = i;
    while (s.next[j] !== -1) {
      j = s.next[j];
      if (s.nums[j] === 0 && s.next[j] === -1) {
        head.start = startOf(s, c);
        head.preference = 1;
        return head;
      }
      if (colourOf(s, s.nums[j]) === c) {
        nn++;
      } else {
        const startAlternate = startOf(s, colourOf(s, s.nums[j]));
        if (nn < sz - nn) {
          head.start = startAlternate;
          head.preference = 1;
        } else {
          head.start = startOf(s, c);
          head.preference = 1;
        }
        return head;
      }
    }
    // May have split a region; avoid re-using a colour.
    if (c === 0) {
      head.start = 0;
      head.preference = 0;
    } else {
      head.start = startOf(s, c);
      head.preference = 1;
    }
  }
  return head;
}

function connectNumbers(s: SignpostState): void {
  s.dsf.reinit();
  for (let i = 0; i < s.n; i++) {
    if (s.next[i] !== -1) {
      const di = s.dsf.canonify(i);
      const dni = s.dsf.canonify(s.next[i]);
      if (di === dni) s.impossible = true;
      s.dsf.merge(di, dni);
    }
  }
}

function compareHeads(a: HeadMeta, b: HeadMeta): number {
  // Heads with preferred colours first...
  if (a.preference && !b.preference) return -1;
  if (b.preference && !a.preference) return 1;
  // ...then low colours first...
  if (a.start < b.start) return -1;
  if (a.start > b.start) return 1;
  // ...then large regions first...
  if (a.sz > b.sz) return -1;
  if (a.sz < b.sz) return 1;
  // ...then position (higher index first, matching upstream).
  if (a.i > b.i) return -1;
  if (a.i < b.i) return 1;
  return 0;
}

function lowestStart(s: SignpostState, heads: HeadMeta[]): number {
  // NB start at 1: colour 0 is real numbers.
  for (let c = 1; c < s.n; c++) {
    let used = false;
    for (const head of heads) {
      if (colourOf(s, head.start) === c) {
        used = true;
        break;
      }
    }
    if (!used) return c;
  }
  return 0;
}

export function updateNumbers(s: SignpostState): void {
  for (let nn = 0; nn < s.n; nn++) s.numsi[nn] = -1;

  for (let i = 0; i < s.n; i++) {
    if (s.flags[i] & FLAG_IMMUTABLE) {
      s.numsi[s.nums[i]] = i;
    } else if (s.prev[i] === -1 && s.next[i] === -1) {
      s.nums[i] = 0;
    }
  }
  connectNumbers(s);

  // Heads of all current regions (has a next but no prev).
  const heads: HeadMeta[] = [];
  for (let i = 0; i < s.n; i++) {
    if (s.prev[i] !== -1 || s.next[i] === -1) continue;
    heads.push(headNumber(s, i));
  }

  heads.sort(compareHeads);

  // Remove duplicate-coloured regions (order matters: back to front).
  for (let m = heads.length - 1; m >= 0; m--) {
    if (m !== 0 && heads[m].start === heads[m - 1].start) {
      heads[m].start = startOf(s, lowestStart(s, heads));
      heads[m].preference = -1;
    } else if (!heads[m].preference) {
      heads[m].start = startOf(s, lowestStart(s, heads));
    }
  }

  for (const head of heads) {
    let nnum = head.start;
    let j = head.i;
    while (j !== -1) {
      if (!(s.flags[j] & FLAG_IMMUTABLE)) {
        if (nnum > 0 && nnum <= s.n) s.numsi[nnum] = j;
        s.nums[j] = nnum;
      }
      nnum++;
      j = s.next[j];
    }
  }
}

/** Upstream `check_completion`: recompute FLAG_ERROR (optionally) and
 * return whether the board is complete. When `markErrors`, also make the
 * implicit `n → n+1` links explicit (upstream convenience). */
export function checkCompletion(s: SignpostState, markErrors: boolean): boolean {
  let error = false;
  let complete = true;

  if (markErrors) {
    for (let j = 0; j < s.n; j++) s.flags[j] &= ~FLAG_ERROR;
  }

  // Repeated real numbers.
  for (let j = 0; j < s.n; j++) {
    if (s.nums[j] > 0 && s.nums[j] <= s.n) {
      for (let k = j + 1; k < s.n; k++) {
        if (s.nums[k] === s.nums[j]) {
          if (markErrors) {
            s.flags[j] |= FLAG_ERROR;
            s.flags[k] |= FLAG_ERROR;
          }
          error = true;
        }
      }
    }
  }

  // Numbers n not pointing to n+1; missing numbers ⇒ incomplete.
  for (let n = 1; n < s.n; n++) {
    if (s.numsi[n] === -1 || s.numsi[n + 1] === -1) {
      complete = false;
    } else if (!isPointingI(s, s.numsi[n], s.numsi[n + 1])) {
      if (markErrors) {
        s.flags[s.numsi[n]] |= FLAG_ERROR;
        s.flags[s.numsi[n + 1]] |= FLAG_ERROR;
      }
      error = true;
    } else if (markErrors) {
      makeLink(s, s.numsi[n], s.numsi[n + 1]);
    }
  }

  // Numbers < 0, or 0 with links.
  for (let n = 1; n < s.n; n++) {
    if (s.nums[n] < 0 || (s.nums[n] === 0 && (s.next[n] !== -1 || s.prev[n] !== -1))) {
      error = true;
      if (markErrors) s.flags[n] |= FLAG_ERROR;
    }
  }

  if (error) return false;
  return complete;
}

// --- desc codec ------------------------------------------------------

/** Encode a fully-numbered / clued state as an upstream desc. */
export function generateDesc(s: SignpostState, isSolve: boolean): string {
  let ret = isSolve ? "S" : "";
  for (let i = 0; i < s.n; i++) {
    const dirLetter = String.fromCharCode(s.dirs[i] + 97); // 'a' + dir
    if (s.nums[i]) ret += `${s.nums[i]}${dirLetter}`;
    else ret += dirLetter;
  }
  return ret;
}

/** Parse a desc into a fresh state (upstream `unpick_desc`). Returns an
 * error string on failure. */
export function unpickDesc(
  params: SignpostParams,
  desc: string,
): { state: SignpostState } | { error: string } {
  const s = blankState(params);
  let num = 0;
  let i = 0;
  for (const c of desc) {
    if (i >= s.n) return { error: "Game description longer than expected" };
    if (c >= "0" && c <= "9") {
      num = num * 10 + (c.charCodeAt(0) - 48);
      if (num > s.n) return { error: "Number too large" };
    } else {
      const d = c.charCodeAt(0) - 97; // 'a'
      if (d < 0 || d >= DIR_MAX) {
        return { error: "Game description contains unexpected characters" };
      }
      s.nums[i] = num;
      s.flags[i] = num ? FLAG_IMMUTABLE : 0;
      num = 0;
      s.dirs[i] = d;
      i++;
    }
  }
  if (i < s.n) return { error: "Game description shorter than expected" };
  return { state: s };
}
