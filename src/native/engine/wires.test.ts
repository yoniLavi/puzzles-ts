/**
 * Tier-1 tests for the shared Net/Netslide wire model.
 *
 * Written by `audit-test-suite-strength`. `wires.ts` is 413 lines shared by nine
 * files and had **no test file of its own** — its every guarantee lived in two
 * games' frozen differentials, which do catch its defects (the audit confirmed
 * that by mutation) but only after a full generate-and-compare run, and only
 * with a diff that names a description string rather than the rule that broke.
 * Coverage several layers away is adequate protection and poor feedback; these
 * assertions are the feedback.
 *
 * They deliberately state the *rules* the module's doc comments claim — the
 * direction algebra's group structure, the torus wrap, the desc codec's
 * round trip, the border fence, and what "powered" means — rather than pinning
 * particular values a refactor would have to chase.
 */
import { describe, expect, it } from "vitest";
import {
  addBorderBarriers,
  anticlockwise,
  clockwise,
  computeActive,
  D,
  DIRECTIONS,
  dirX,
  dirY,
  encodeWireDesc,
  L,
  offset,
  opposite,
  parseWireDesc,
  R,
  rot,
  U,
  validateWireDesc,
  wireCount,
  type Xyd,
  xydCmp,
} from "./wires.ts";

const ALL = R | U | L | D;

describe("direction algebra", () => {
  it("lists the four directions in upstream's iteration order", () => {
    // Ports of upstream loops (`d = 1; d < 0x10; d <<= 1`) depend on this
    // order, and `growSpanningTree` indexes the RNG through it.
    expect(DIRECTIONS).toEqual([R, U, L, D]);
    expect([R, U, L, D]).toEqual([0x01, 0x02, 0x04, 0x08]);
  });

  it("rotates every mask as a group: four turns is the identity", () => {
    for (let m = 0; m <= ALL; m++) {
      expect(anticlockwise(anticlockwise(anticlockwise(anticlockwise(m))))).toBe(m);
      expect(clockwise(clockwise(clockwise(clockwise(m))))).toBe(m);
      // The two rotations are inverses, and two of either is a reversal.
      expect(clockwise(anticlockwise(m))).toBe(m);
      expect(anticlockwise(anticlockwise(m))).toBe(opposite(m));
      expect(opposite(opposite(m))).toBe(m);
    }
  });

  it("turns each single direction into its neighbour, anticlockwise on screen", () => {
    // y grows downward, so "anticlockwise" is R -> U -> L -> D -> R.
    expect([R, U, L, D].map(anticlockwise)).toEqual([U, L, D, R]);
    expect([R, U, L, D].map(clockwise)).toEqual([D, R, U, L]);
    expect([R, U, L, D].map(opposite)).toEqual([L, D, R, U]);
  });

  it("rot(x, n) is n quarter-turns, and only the low two bits of n matter", () => {
    for (let m = 0; m <= ALL; m++) {
      expect(rot(m, 0)).toBe(m);
      expect(rot(m, 1)).toBe(anticlockwise(m));
      expect(rot(m, 2)).toBe(opposite(m));
      expect(rot(m, 3)).toBe(clockwise(m));
      expect(rot(m, 5)).toBe(rot(m, 1));
      expect(rot(m, -3)).toBe(rot(m, 1)); // `n & 3` on a negative turn
    }
  });

  it("rotation preserves the wire count — it turns a tile, it does not change it", () => {
    for (let m = 0; m <= ALL; m++) {
      for (let n = 0; n < 4; n++) expect(wireCount(rot(m, n))).toBe(wireCount(m));
    }
  });

  it("counts wires as set bits of the low nibble", () => {
    expect(wireCount(0)).toBe(0);
    expect(wireCount(R)).toBe(1);
    expect(wireCount(R | L)).toBe(2);
    expect(wireCount(R | U | L)).toBe(3);
    expect(wireCount(ALL)).toBe(4);
    // High bits are each game's own (FLASHING / LOCKED) and are not wires.
    expect(wireCount(0x10 | R)).toBe(1);
  });

  it("maps a direction to its displacement", () => {
    expect([R, U, L, D].map(dirX)).toEqual([1, 0, -1, 0]);
    expect([R, U, L, D].map(dirY)).toEqual([0, -1, 0, 1]);
  });
});

describe("offset", () => {
  it("steps one tile in the given direction", () => {
    expect(offset(1, 1, R, 4, 3)).toEqual({ x: 2, y: 1 });
    expect(offset(1, 1, L, 4, 3)).toEqual({ x: 0, y: 1 });
    expect(offset(1, 1, U, 4, 3)).toEqual({ x: 1, y: 0 });
    expect(offset(1, 1, D, 4, 3)).toEqual({ x: 1, y: 2 });
  });

  it("wraps unconditionally — a non-wrapping game is fenced by barriers, not here", () => {
    expect(offset(3, 0, R, 4, 3)).toEqual({ x: 0, y: 0 });
    expect(offset(0, 0, L, 4, 3)).toEqual({ x: 3, y: 0 });
    expect(offset(0, 0, U, 4, 3)).toEqual({ x: 0, y: 2 });
    expect(offset(0, 2, D, 4, 3)).toEqual({ x: 0, y: 0 });
  });

  it("is inverted by stepping back the opposite way, from every cell", () => {
    const w = 5;
    const h = 4;
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++)
        for (const d of DIRECTIONS) {
          const n = offset(x, y, d, w, h);
          expect(offset(n.x, n.y, opposite(d), w, h)).toEqual({ x, y });
        }
  });
});

describe("xydCmp", () => {
  it("orders lexicographically on x, then y, then direction", () => {
    // This is the order the RNG indexes into, so it is part of what decides
    // which boards exist — not merely a tidy convention.
    const xyd = (x: number, y: number, direction: number): Xyd => ({ x, y, direction });
    const shuffled = [xyd(1, 0, U), xyd(0, 2, R), xyd(1, 0, R), xyd(0, 1, D)];
    expect([...shuffled].sort(xydCmp)).toEqual([
      xyd(0, 1, D),
      xyd(0, 2, R),
      xyd(1, 0, R),
      xyd(1, 0, U),
    ]);
  });

  it("is antisymmetric and zero only on equal triples", () => {
    const a = { x: 2, y: 1, direction: D };
    const b = { x: 2, y: 1, direction: R };
    expect(Math.sign(xydCmp(a, b))).toBe(-Math.sign(xydCmp(b, a)));
    expect(xydCmp(a, { ...a })).toBe(0);
  });
});

describe("the description codec", () => {
  it("accepts a well-formed desc and names each way it can be malformed", () => {
    expect(validateWireDesc(2, 2, "1234")).toBeNull();
    expect(validateWireDesc(2, 2, "12h34")).toBeNull(); // barriers are optional suffixes
    expect(validateWireDesc(2, 2, "1v2h3v4h")).toBeNull();
    expect(validateWireDesc(2, 2, "123")).toMatch(/shorter/);
    expect(validateWireDesc(2, 2, "12345")).toMatch(/longer/);
    expect(validateWireDesc(2, 2, "12z4")).toMatch(/unexpected character/);
    // A barrier letter where a tile is expected is a character, not a suffix.
    expect(validateWireDesc(2, 2, "12h3")).toMatch(/shorter/);
  });

  it("reads tiles row-major as hex", () => {
    const { tiles } = parseWireDesc(3, 2, "12345a");
    expect([...tiles]).toEqual([1, 2, 3, 4, 5, 10]);
  });

  it("records a barrier on both sides of the wall it names", () => {
    // `v` is a wall to the right of its tile, `h` a wall below it.
    const { barriers } = parseWireDesc(2, 2, "1v234");
    expect(barriers[0] & R).toBeTruthy();
    expect(barriers[1] & L).toBeTruthy(); // its neighbour sees the same wall
    expect(barriers[0] & D).toBeFalsy();
  });

  it("round-trips a grid with barriers through encode/parse", () => {
    const w = 3;
    const h = 2;
    const tiles = Uint8Array.from([R, R | L, L | D, R, U | L, L]);
    const barriers = new Uint8Array(w * h);
    // A wall right of (0,0) and below (1,0), recorded on both sides.
    barriers[0] |= R;
    barriers[1] |= L;
    barriers[1] |= D;
    barriers[1 * w + 1] |= U;

    const desc = encodeWireDesc(tiles, barriers, w, h, false);
    expect(validateWireDesc(w, h, desc)).toBeNull();
    const back = parseWireDesc(w, h, desc);
    expect([...back.tiles]).toEqual([...tiles]);
    expect([...back.barriers]).toEqual([...barriers]);
  });

  it("omits the outer edges of a non-wrapping grid, and keeps them when wrapping", () => {
    // The fence round a non-wrapping grid is implied, so encoding it would be
    // redundant; on a torus the same edges are real interior walls.
    const w = 2;
    const h = 2;
    const tiles = new Uint8Array(w * h);
    const barriers = new Uint8Array(w * h);
    addBorderBarriers(barriers, w, h);
    expect(encodeWireDesc(tiles, barriers, w, h, false)).toBe("0000");
    // A wall is written by the tile on its *left* (`v`) or *above* it (`h`), so
    // on the torus the four fence edges are emitted by the tiles on the far
    // side of each seam: (1,0) owns the right seam, (0,1) the bottom one, and
    // (1,1) owns both.
    expect(encodeWireDesc(tiles, barriers, w, h, true)).toBe("0" + "0v" + "0h" + "0vh");
  });

  it("fences a non-wrapping grid on all four sides", () => {
    const w = 3;
    const h = 3;
    const barriers = new Uint8Array(w * h);
    addBorderBarriers(barriers, w, h);
    for (let x = 0; x < w; x++) {
      expect(barriers[x] & U).toBeTruthy();
      expect(barriers[(h - 1) * w + x] & D).toBeTruthy();
    }
    for (let y = 0; y < h; y++) {
      expect(barriers[y * w] & L).toBeTruthy();
      expect(barriers[y * w + (w - 1)] & R).toBeTruthy();
    }
    expect(barriers[1 * w + 1]).toBe(0); // the interior is untouched
  });
});

describe("computeActive", () => {
  const ACTIVE = 0x10; // each game owns its own high bit; this is the parameter

  /** A 3x1 row: source at (0,0) wired right, middle wired both ways, end left. */
  const row = (): { tiles: Uint8Array; barriers: Uint8Array } => ({
    tiles: Uint8Array.from([R, R | L, L]),
    barriers: new Uint8Array(3),
  });

  it("powers every tile reachable from the source", () => {
    const { tiles, barriers } = row();
    const active = computeActive(3, 1, tiles, barriers, 0, 0, ACTIVE);
    expect([...active]).toEqual([ACTIVE, ACTIVE, ACTIVE]);
  });

  it("needs the connection to exist from BOTH sides", () => {
    // The neighbour must point back. Note the discriminating case is a
    // neighbour wired to *nothing*: if the middle tile were merely wired the
    // wrong way (`L` only), the outward check on the far side would stop the
    // flood anyway and the test would pass with the both-sides check deleted.
    const { barriers } = row();
    const active = computeActive(
      3,
      1,
      Uint8Array.from([R, 0, L]),
      barriers,
      0,
      0,
      ACTIVE,
    );
    expect([...active]).toEqual([ACTIVE, 0, 0]);
  });

  it("needs the source side to be wired too", () => {
    const { barriers } = row();
    const active = computeActive(
      3,
      1,
      Uint8Array.from([0, R | L, L]),
      barriers,
      0,
      0,
      ACTIVE,
    );
    expect([...active]).toEqual([ACTIVE, 0, 0]);
  });

  it("does not flow through a barrier", () => {
    const { tiles, barriers } = row();
    barriers[0] |= R;
    const active = computeActive(3, 1, tiles, barriers, 0, 0, ACTIVE);
    expect([...active]).toEqual([ACTIVE, 0, 0]);
  });

  it("blanks a line that is mid-slide, so power does not leap across it", () => {
    const { tiles, barriers } = row();
    // Netslide passes the column currently in motion; Net passes -1.
    const active = computeActive(3, 1, tiles, barriers, 0, 0, ACTIVE, -1, 1);
    expect([...active]).toEqual([ACTIVE, 0, 0]);
  });

  it("powers the source itself even when it is wired to nothing", () => {
    const active = computeActive(
      2,
      1,
      new Uint8Array(2),
      new Uint8Array(2),
      1,
      0,
      ACTIVE,
    );
    expect([...active]).toEqual([0, ACTIVE]);
  });

  it("flows round a wrapping edge", () => {
    // (0,0) wired left and (2,0) wired right meet across the seam.
    const tiles = Uint8Array.from([L, 0, R]);
    const active = computeActive(3, 1, tiles, new Uint8Array(3), 0, 0, ACTIVE);
    expect([...active]).toEqual([ACTIVE, 0, ACTIVE]);
  });
});
