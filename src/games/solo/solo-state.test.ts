/**
 * Tier-1 tests for solo's state/codec layer (state.ts): param round-trips
 * across all four variants, the grid + block-structure codecs as mutual
 * inverses, and full desc assembly through validateDesc/newState. The solver,
 * generator, render, and move handling are tested separately as they land.
 */
import { describe, expect, it } from "vitest";
import type { Dsf } from "../../engine/dsf.ts";
import {
  blocksFromDsf,
  checkValid,
  DIFF_BLOCK,
  DIFF_KINTERSECT,
  DIFF_KMINMAX,
  DIFF_RECURSIVE,
  DIFF_SET,
  DIFF_SIMPLE,
  decodeParams,
  defaultParams,
  encodeBlockStructureDesc,
  encodeGrid,
  encodeParams,
  newState,
  rectangularBlocks,
  type SoloParams,
  SYMM_NONE,
  SYMM_REF4D,
  SYMM_ROT2,
  specToDsf,
  specToGrid,
  validateDesc,
  validateParams,
} from "./state.ts";

function paramsEqual(a: SoloParams, b: SoloParams): boolean {
  return (
    a.c === b.c &&
    a.r === b.r &&
    a.symm === b.symm &&
    a.diff === b.diff &&
    a.xtype === b.xtype &&
    a.killer === b.killer
  );
}

describe("solo params codec", () => {
  it("round-trips every variant through full encode/decode", () => {
    const cases: SoloParams[] = [
      {
        c: 3,
        r: 3,
        symm: SYMM_ROT2,
        diff: DIFF_BLOCK,
        kdiff: DIFF_KMINMAX,
        xtype: false,
        killer: false,
      },
      {
        c: 2,
        r: 3,
        symm: SYMM_ROT2,
        diff: DIFF_SIMPLE,
        kdiff: DIFF_KMINMAX,
        xtype: false,
        killer: false,
      },
      {
        c: 3,
        r: 3,
        symm: SYMM_ROT2,
        diff: DIFF_SIMPLE,
        kdiff: DIFF_KMINMAX,
        xtype: true,
        killer: false,
      },
      {
        c: 9,
        r: 1,
        symm: SYMM_ROT2,
        diff: DIFF_SET,
        kdiff: DIFF_KMINMAX,
        xtype: false,
        killer: false,
      },
      {
        c: 3,
        r: 3,
        symm: SYMM_NONE,
        diff: DIFF_BLOCK,
        kdiff: DIFF_KINTERSECT,
        xtype: false,
        killer: true,
      },
      {
        c: 3,
        r: 3,
        symm: SYMM_REF4D,
        diff: DIFF_RECURSIVE,
        kdiff: DIFF_KMINMAX,
        xtype: false,
        killer: false,
      },
    ];
    for (const p of cases) {
      const decoded = decodeParams(encodeParams(p, true));
      expect(paramsEqual(decoded, p), `round-trip ${encodeParams(p, true)}`).toBe(true);
    }
  });

  it("encodes the documented variant strings", () => {
    const base = defaultParams();
    expect(encodeParams({ ...base, c: 3, r: 3 }, false)).toBe("3x3");
    expect(encodeParams({ ...base, c: 9, r: 1 }, false)).toBe("9j");
    expect(encodeParams({ ...base, c: 3, r: 3, xtype: true }, false)).toBe("3x3x");
    expect(encodeParams({ ...base, c: 3, r: 3, killer: true }, false)).toBe("3x3k");
    // full mode adds symmetry + difficulty (ROT2 / BLOCK are the omitted defaults)
    expect(
      encodeParams({ ...base, c: 3, r: 3, symm: SYMM_NONE, diff: DIFF_SET }, true),
    ).toBe("3x3ada");
  });

  it("decodes the legacy jigsaw-of-a-rectangle form", () => {
    // "3x3j" collapses a former 3x3 rectangle into a jigsaw of edge 9.
    const p = decodeParams("3x3j");
    expect(p.c).toBe(9);
    expect(p.r).toBe(1);
  });

  it("rejects out-of-range params", () => {
    expect(validateParams({ ...defaultParams(), c: 1 }, true)).not.toBeNull();
    expect(validateParams({ ...defaultParams(), c: 6, r: 6 }, true)).not.toBeNull(); // 36 > 31
    expect(
      validateParams({ ...defaultParams(), c: 4, r: 3, killer: true }, true),
    ).not.toBeNull(); // killer 12 > 9
    expect(validateParams(defaultParams(), true)).toBeNull();
  });
});

describe("solo grid codec", () => {
  it("round-trips a grid through encode/specToGrid", () => {
    const area = 81;
    const grid = new Int8Array(area);
    // a scattering of givens, incl. the top-left and bottom-right corners
    grid[0] = 5;
    grid[1] = 9;
    grid[40] = 1;
    grid[80] = 7;
    grid[79] = 3;
    const enc = encodeGrid(grid, area);
    const out = new Int8Array(area);
    const next = specToGrid(enc, 0, out, area);
    expect(next).toBe(enc.length);
    expect(Array.from(out)).toEqual(Array.from(grid));
  });
});

describe("solo block-structure codec", () => {
  it("encode and specToDsf are mutual inverses (partition preserved)", () => {
    const cr = 9;
    const orig = rectangularBlocks(3, 3); // any cr-region partition
    const enc = encodeBlockStructureDesc(cr, orig);
    const { dsf, error, next } = specToDsf(enc, 0, cr);
    expect(error).toBeNull();
    expect(next).toBe(enc.length);
    const round = blocksFromDsf(dsf as Dsf, cr);
    // The block *numbering* may differ; the *partition* must be identical.
    const area = cr * cr;
    for (let i = 0; i < area; i++)
      for (let j = i + 1; j < area; j++)
        expect(orig.whichblock[i] === orig.whichblock[j]).toBe(
          round.whichblock[i] === round.whichblock[j],
        );
  });
});

describe("solo desc assembly (validateDesc + newState)", () => {
  it("validates and rebuilds a standard board (givens only)", () => {
    const p: SoloParams = {
      c: 3,
      r: 3,
      symm: SYMM_ROT2,
      diff: DIFF_SIMPLE,
      kdiff: DIFF_KMINMAX,
      xtype: false,
      killer: false,
    };
    const area = 81;
    const grid = new Int8Array(area);
    grid[0] = 5;
    grid[10] = 8;
    grid[80] = 2;
    const desc = encodeGrid(grid, area);
    expect(validateDesc(p, desc)).toBeNull();
    const st = newState(p, desc);
    expect(Array.from(st.grid)).toEqual(Array.from(grid));
    expect(st.immutable[0]).toBe(1);
    expect(st.immutable[1]).toBe(0);
    expect(st.blocks.nrBlocks).toBe(9);
  });

  it("validates and rebuilds a jigsaw board (grid + block structure)", () => {
    const p: SoloParams = {
      c: 9,
      r: 1,
      symm: SYMM_ROT2,
      diff: DIFF_SET,
      kdiff: DIFF_KMINMAX,
      xtype: false,
      killer: false,
    };
    const cr = 9;
    const area = cr * cr;
    const grid = new Int8Array(area);
    grid[0] = 4;
    const blocks = rectangularBlocks(3, 3); // a valid 9×9-of-9 partition
    const desc = `${encodeGrid(grid, area)},${encodeBlockStructureDesc(cr, blocks)}`;
    expect(validateDesc(p, desc)).toBeNull();
    const st = newState(p, desc);
    expect(st.blocks.nrBlocks).toBe(9);
    // partition preserved
    for (let i = 0; i < area; i++)
      for (let j = i + 1; j < area; j++)
        expect(blocks.whichblock[i] === blocks.whichblock[j]).toBe(
          st.blocks.whichblock[i] === st.blocks.whichblock[j],
        );
  });

  it("validates and rebuilds a killer board (grid + cages + sums)", () => {
    const p: SoloParams = {
      c: 3,
      r: 3,
      symm: SYMM_NONE,
      diff: DIFF_BLOCK,
      kdiff: DIFF_KINTERSECT,
      xtype: false,
      killer: true,
    };
    const cr = 9;
    const area = cr * cr;
    const grid = new Int8Array(area); // killer puzzles ship no givens
    // Cages: compact 3×3 blocks (size 9 = cr, the max). A realistic cage
    // partition keeps non-edge runs short; full-row cages would exercise the
    // `'z'` run-overflow path the real generator never produces (see state.ts).
    const kblocks = rectangularBlocks(3, 3);
    const kgrid = new Int32Array(area);
    for (let b = 0; b < kblocks.nrBlocks; b++) kgrid[kblocks.blocks[b][0]] = 45; // sum 1..9
    const desc = `${encodeGrid(grid, area)},${encodeBlockStructureDesc(cr, kblocks)},${encodeGrid(kgrid, area)}`;
    expect(validateDesc(p, desc)).toBeNull();
    const st = newState(p, desc);
    expect(st.killerData).not.toBeNull();
    expect(st.killerData?.kblocks.nrBlocks).toBe(9);
    // every cage carries its recorded sum at exactly one cell
    let clued = 0;
    for (let i = 0; i < area; i++) if (st.killerData?.kgrid[i] === 45) clued++;
    expect(clued).toBe(9);
  });
});

describe("solo completion check", () => {
  it("accepts a full valid standard grid and rejects a broken one", () => {
    const cr = 9;
    const area = cr * cr;
    const blocks = rectangularBlocks(3, 3);
    // a known-valid 9×9 sudoku solution (base pattern)
    const grid = new Int8Array(area);
    for (let y = 0; y < cr; y++)
      for (let x = 0; x < cr; x++)
        grid[y * cr + x] = (((y % 3) * 3 + ((y / 3) | 0) + x) % 9) + 1;
    expect(checkValid(cr, blocks, null, false, grid)).toBe(true);
    // swap two cells in a row to break it
    const broken = grid.slice();
    broken[0] = broken[1];
    expect(checkValid(cr, blocks, null, false, broken)).toBe(false);
  });
});
