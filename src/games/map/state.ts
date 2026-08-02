/**
 * Types and pure state helpers for Map (`map.c`) — the four-colour puzzle.
 *
 * Colour every region of a map so no two adjacent regions share a colour,
 * given some regions pre-coloured as immutable clues.
 *
 * The immutable board geometry lives in a shared {@link MapData} (see
 * `map-data.ts`) — the region-per-quadrant grid, the adjacency graph, the clue
 * flags and the label points — shared by reference across every cloned
 * {@link MapState} (upstream's refcounted `struct map`, GC in place of the
 * refcount; design D1). A move copies only the mutable per-region `colouring`
 * and `pencil` arrays.
 */

import type { PresetMenu } from "../../engine/game.ts";
import { parseLeadingInt } from "../../engine/params.ts";
import type { MapData } from "./map-data.ts";

// --- difficulty ------------------------------------------------------

export const DIFF_EASY = 0;
export const DIFF_NORMAL = 1;
export const DIFF_HARD = 2;
export const DIFF_RECURSE = 3;
export const DIFFCOUNT = 4;

/** Upstream `map_diffnames`. */
export const DIFF_NAMES = ["Easy", "Normal", "Hard", "Unreasonable"] as const;
/** Upstream `map_diffchars`. */
export const DIFF_CHARS = "enhu";

// --- params ----------------------------------------------------------

export interface MapParams {
  w: number;
  h: number;
  /** Number of regions. */
  n: number;
  /** 0..3 = Easy/Normal/Hard/Unreasonable. */
  diff: number;
}

export function defaultParams(): MapParams {
  return { w: 20, h: 15, n: 30, diff: DIFF_NORMAL };
}

/** Upstream `map_presets` (non-portrait; the web build is landscape). */
const PRESETS: readonly MapParams[] = [
  { w: 20, h: 15, n: 30, diff: DIFF_EASY },
  { w: 20, h: 15, n: 30, diff: DIFF_NORMAL },
  { w: 20, h: 15, n: 30, diff: DIFF_HARD },
  { w: 20, h: 15, n: 30, diff: DIFF_RECURSE },
  { w: 30, h: 25, n: 75, diff: DIFF_NORMAL },
  { w: 30, h: 25, n: 75, diff: DIFF_HARD },
];

export function presets(): PresetMenu<MapParams> {
  return {
    title: "Map",
    submenu: PRESETS.map((p) => ({
      title: `${p.w}x${p.h}, ${p.n} regions, ${DIFF_NAMES[p.diff]}`,
      params: { ...p },
    })),
  };
}

export function encodeParams(p: MapParams, full: boolean): string {
  let s = `${p.w}x${p.h}n${p.n}`;
  if (full) s += `d${DIFF_CHARS[p.diff]}`;
  return s;
}

/**
 * Upstream `decode_params`, faithfully lenient: `w`, optional `xH` (else
 * `h = w`), optional `nN` (tolerating a `.` in the count for old float-`n`
 * IDs — `atoi`-truncated), optional `dX` difficulty char. An absent `n`
 * defaults to `w*h/8`.
 */
export function decodeParams(s: string): MapParams {
  const p = defaultParams();

  const wParse = parseLeadingInt(s, 0);
  p.w = wParse.value;
  let i = wParse.next;

  if (s[i] === "x") {
    const hParse = parseLeadingInt(s, i + 1);
    p.h = hParse.value;
    i = hParse.next;
  } else {
    p.h = p.w;
  }

  if (s[i] === "n") {
    i++;
    const nParse = parseLeadingInt(s, i);
    p.n = nParse.value;
    i = nParse.next;
    // Tolerate (and skip) a trailing `.<digits>` fraction, as upstream does.
    while (i < s.length && (s[i] === "." || (s[i] >= "0" && s[i] <= "9"))) i++;
  } else if (p.h > 0 && p.w > 0) {
    p.n = Math.floor((p.w * p.h) / 8);
  }

  if (s[i] === "d") {
    i++;
    const idx = DIFF_CHARS.indexOf(s[i] ?? "");
    if (idx >= 0) p.diff = idx;
    if (i < s.length) i++;
  }

  return p;
}

export function validateParams(p: MapParams, _full: boolean): string | null {
  if (p.w < 2 || p.h < 2) return "Width and height must be at least two";
  if (p.h > 0 && p.w > Math.floor(2147483647 / 2 / p.h))
    return "Width times height must not be unreasonably large";
  if (p.n < 5) return "Must have at least five regions";
  if (p.n > p.w * p.h) return "Too many regions to fit in grid";
  return null;
}

// --- moves -----------------------------------------------------------

/** One region edit within a move (design D3). */
export type MapOp =
  /** Set a region's colour (`colour` null = clear); clears its pencil. */
  | { op: "colour"; region: number; colour: number | null }
  /** Toggle one pencil bit (0..3). Only legal on an uncoloured region. */
  | { op: "pencil"; region: number; bit: number };

/**
 * A player move: a list of region ops (a single drag-drop can change both a
 * colour and pencil bits), optionally flagged as a solve.
 */
export interface MapMove {
  ops: MapOp[];
  solve?: boolean;
}

// --- ui --------------------------------------------------------------

export const FLASH_CYCLIC = 0;
export const FLASH_EACH_TO_WHITE = 1;
export const FLASH_ALL_TO_WHITE = 2;

/** Persisted drag/cursor UI + preferences (upstream `game_ui`). */
export interface MapUi {
  /** -2 = no drag; -1 = dragging a blank; >=0 = dragging that colour. */
  dragColour: number;
  /** Pencil bitmask carried by a blank drag. */
  dragPencil: number;
  /** Pixel coords of the current drag position. */
  dragx: number;
  dragy: number;

  curX: number;
  curY: number;
  curLastmove: number;
  curVisible: boolean;
  curMoved: boolean;

  // preferences (design D7)
  /** 0 = cyclic, 1 = each-to-white, 2 = all-to-white. */
  flashType: number;
  showNumbers: boolean;
  largeStipples: boolean;
}

export function newUi(_state: MapState): MapUi {
  return {
    dragColour: -2,
    dragPencil: 0,
    dragx: -1,
    dragy: -1,
    curX: 0,
    curY: 0,
    curLastmove: 0,
    curVisible: false,
    curMoved: false,
    flashType: FLASH_CYCLIC,
    showNumbers: false,
    largeStipples: false,
  };
}

// --- state -----------------------------------------------------------

export interface MapState {
  readonly params: MapParams;
  /** Shared immutable geometry (region grid, graph, clues, label points). */
  readonly map: MapData;
  /** Per-region colour: -1 (blank) or 0..3. Length `n`. */
  readonly colouring: Int32Array;
  /** Per-region pencil-mark bitmask (only meaningful when blank). Length `n`. */
  readonly pencil: Int32Array;
  readonly completed: boolean;
  readonly cheated: boolean;
}

export function cloneState(s: MapState): MapState {
  return {
    params: s.params,
    map: s.map,
    colouring: s.colouring.slice(),
    pencil: s.pencil.slice(),
    completed: s.completed,
    cheated: s.cheated,
  };
}

/** A flagged region whose colour contradicts the unique solution (design D6). */
export interface MapMistake {
  region: number;
}
