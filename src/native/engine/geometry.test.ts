import { describe, expect, it } from "vitest";
import { coord, fromCoord } from "./geometry.ts";

describe("geometry coord/fromCoord", () => {
  const ts = 48;
  const halfBorder = Math.floor(ts / 2); // most games
  const tileBorder = ts; // Sixteen

  it("coord returns the cell's top-left pixel", () => {
    expect(coord(0, ts, halfBorder)).toBe(halfBorder);
    expect(coord(3, ts, halfBorder)).toBe(3 * ts + halfBorder);
    expect(coord(3, ts, tileBorder)).toBe(3 * ts + tileBorder);
  });

  it("fromCoord maps a pixel inside a cell back to that cell", () => {
    for (const border of [halfBorder, tileBorder]) {
      for (let c = 0; c < 5; c++) {
        const left = coord(c, ts, border);
        expect(fromCoord(left, ts, border)).toBe(c); // top-left edge
        expect(fromCoord(left + ts - 1, ts, border)).toBe(c); // bottom-right edge
        expect(fromCoord(left + Math.floor(ts / 2), ts, border)).toBe(c); // centre
      }
    }
  });

  it("coord and fromCoord round-trip", () => {
    for (const border of [halfBorder, tileBorder]) {
      for (let c = 0; c < 6; c++) {
        expect(fromCoord(coord(c, ts, border), ts, border)).toBe(c);
      }
    }
  });

  it("returns a negative index for pixels in the border region", () => {
    for (const border of [halfBorder, tileBorder]) {
      expect(fromCoord(coord(0, ts, border) - 1, ts, border)).toBe(-1);
      expect(fromCoord(coord(0, ts, border) - ts - 1, ts, border)).toBe(-2);
      expect(fromCoord(0, ts, border)).toBeLessThan(0);
    }
  });

  it("agrees with the legacy half-tile-border C idiom for all pixels", () => {
    // Legacy copy (fifteen/pegs): floor((pixel - border + ts)/ts) - 1
    const legacy = (pixel: number) => Math.floor((pixel - halfBorder + ts) / ts) - 1;
    for (let pixel = -ts; pixel <= 6 * ts; pixel++) {
      expect(fromCoord(pixel, ts, halfBorder)).toBe(legacy(pixel));
    }
  });

  it("agrees with the legacy full-tile-border C idiom (Sixteen) for all pixels", () => {
    // Legacy copy (sixteen): floor((pixel - border + 2·ts)/ts) - 2
    const legacy = (pixel: number) =>
      Math.floor((pixel - tileBorder + 2 * ts) / ts) - 2;
    for (let pixel = -ts; pixel <= 6 * ts; pixel++) {
      expect(fromCoord(pixel, ts, tileBorder)).toBe(legacy(pixel));
    }
  });
});
