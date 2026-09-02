/**
 * Symmetric black-square placement — upstream `set_blacks`, which
 * `sticks.c` copied verbatim from `lightup.c` (its own comment says so).
 * Promoted to a shared engine helper when Sticks became the second
 * consumer (docs/games/engine-catalog.md § "Reach for these, don't re-roll"); Light Up and Sticks both call it from their
 * generators.
 *
 * Byte-match critical: the symmetry-reduced region sizing, the
 * rejection-sampling draw order (one `randomUpto` pair per placement
 * attempt, retried while the cell is already black), the x-outer/y-inner
 * symmetry copy order (which reads the *current* board, so overlapping
 * regions behave exactly as C's in-place assignment), and the
 * `SYMM_ROT4` odd-center fix-up draw (`randomUpto(rs, 100) <= blackpc`,
 * note the `<=`) are all observable in the RNG stream the callers' descs
 * depend on.
 *
 * The caller clears its board first (C's `set_blacks` memsets; the TS
 * callers own their board representation, so clearing stays with them).
 */
import { type RandomState, randomUpto } from "./random/index.ts";
import { retryLimit } from "./retry-limit.ts";

// The shared symmetry enum (identical values in lightup.c and sticks.c).
export const SYMM_NONE = 0;
export const SYMM_REF2 = 1;
export const SYMM_ROT2 = 2;
export const SYMM_REF4 = 3;
export const SYMM_ROT4 = 4;
export const SYMM_MAX = 5;

/** The Custom-dialog labels, in `SYMM_*` order (upstream `game_configure`'s
 * ":None:2-way mirror:2-way rotational:4-way mirror:4-way rotational"). */
export const SYMMETRY_CHOICES = [
  "None",
  "2-way mirror",
  "2-way rotational",
  "4-way mirror",
  "4-way rotational",
];

const MAX_BLACK_PICKS = 1_000_000;

export interface SymmetricBlacksOptions {
  w: number;
  h: number;
  /** Percentage of black squares (5..100). */
  blackpc: number;
  /** One of the `SYMM_*` constants. */
  symm: number;
  rs: RandomState;
  /** Whether the cell is currently black. */
  isBlack(x: number, y: number): boolean;
  /** Set or clear the cell's blackness (the symmetry copy *assigns*). */
  setBlack(x: number, y: number, black: boolean): void;
}

/**
 * Randomize black squares over the symmetry-reduced region, then
 * mirror/rotate the region over the whole board (upstream `set_blacks`).
 */
export function placeSymmetricBlacks(opts: SymmetricBlacksOptions): void {
  const { w, h, blackpc, symm, rs, isBlack, setBlack } = opts;
  const wodd = w % 2 ? 1 : 0;
  const hodd = h % 2 ? 1 : 0;
  let degree: number;
  let rotate: boolean;
  switch (symm) {
    case SYMM_NONE:
      degree = 1;
      rotate = false;
      break;
    case SYMM_ROT2:
      degree = 2;
      rotate = true;
      break;
    case SYMM_REF2:
      degree = 2;
      rotate = false;
      break;
    case SYMM_ROT4:
      degree = 4;
      rotate = true;
      break;
    case SYMM_REF4:
      degree = 4;
      rotate = false;
      break;
    default:
      throw new Error(`Unknown symmetry type ${symm}`);
  }
  if (symm === SYMM_ROT4 && h !== w)
    throw new Error("4-fold symmetry unavailable without square grid");

  let rw: number;
  let rh: number;
  if (degree === 4) {
    rw = Math.floor(w / 2);
    rh = Math.floor(h / 2);
    if (!rotate) rw += wodd; // ... but see below (upstream comment)
    rh += hodd;
  } else if (degree === 2) {
    rw = w;
    rh = Math.floor(h / 2) + hodd;
  } else {
    rw = w;
    rh = h;
  }

  // Randomize the required region by rejection sampling.
  const nblack = Math.floor((rw * rh * blackpc) / 100);
  const pick = retryLimit("placeSymmetricBlacks", MAX_BLACK_PICKS);
  for (let i = 0; i < nblack; i++) {
    let x: number;
    let y: number;
    do {
      pick();
      x = randomUpto(rs, rw);
      y = randomUpto(rs, rh);
    } while (isBlack(x, y));
    setBlack(x, y, true);
  }

  // Copy the required region per the symmetry. The copy reads the current
  // board cell-by-cell, exactly as C's in-place assignment, so overlapping
  // source/target regions (odd dimensions) behave identically.
  if (symm === SYMM_NONE) return;
  for (let x = 0; x < rw; x++) {
    for (let y = 0; y < rh; y++) {
      const xs: number[] = [x];
      const ys: number[] = [y];
      if (degree === 4) {
        xs.push(w - 1 - (rotate ? y : x));
        ys.push(rotate ? x : y);
        xs.push(rotate ? w - 1 - x : x);
        ys.push(h - 1 - y);
        xs.push(rotate ? y : w - 1 - x);
        ys.push(h - 1 - (rotate ? x : y));
      } else {
        xs.push(rotate ? w - 1 - x : x);
        ys.push(h - 1 - y);
      }
      for (let i = 1; i < degree; i++) {
        setBlack(xs[i], ys[i], isBlack(xs[0], ys[0]));
      }
    }
  }
  // SYMM_ROT4 misses the middle square above; fix that here.
  if (degree === 4 && rotate && wodd && randomUpto(rs, 100) <= blackpc) {
    setBlack(Math.floor(w / 2) + wodd - 1, Math.floor(h / 2) + hodd - 1, true);
  }
}
