import { describe, expect, it } from "vitest";
import { randomNew } from "../../random/index.ts";
import { newDesc } from "./generator.ts";
import { Direction, enumGridSquares, gridArea } from "./grid.ts";
import { cubeGame, executeMove } from "./index.ts";
import { SOLIDS, SolidType } from "./solids.ts";
import {
  type CubeParams,
  type CubeState,
  decodeParams,
  defaultParams,
  encodeParams,
  newState,
  validateDesc,
  validateParams,
} from "./state.ts";

const PRESETS: CubeParams[] = [
  { solid: SolidType.Cube, d1: 4, d2: 4 },
  { solid: SolidType.Tetrahedron, d1: 1, d2: 2 },
  { solid: SolidType.Octahedron, d1: 2, d2: 2 },
  { solid: SolidType.Icosahedron, d1: 3, d2: 3 },
];

function totalBlue(state: CubeState): number {
  let n = 0;
  for (const b of state.blue) n += b;
  for (const f of state.faceColours) n += f;
  return n;
}

// Try each of the four orthogonal rolls and return the first that is
// legal from `state`, or null if the solid is somehow boxed in (never
// happens on a real grid).
function anyLegalRoll(state: CubeState): CubeState | null {
  for (const dir of ["L", "R", "U", "D"] as const) {
    try {
      return executeMove(state, { dir });
    } catch {
      // illegal from this square; try the next direction
    }
  }
  return null;
}

describe("cube params", () => {
  it("round-trips encode/decode for every preset", () => {
    for (const p of PRESETS) {
      expect(decodeParams(encodeParams(p, true))).toEqual(p);
    }
  });

  it("encodes with the solid letter and dimensions", () => {
    expect(encodeParams({ solid: SolidType.Cube, d1: 4, d2: 4 }, true)).toBe("c4x4");
    expect(encodeParams({ solid: SolidType.Tetrahedron, d1: 1, d2: 2 }, true)).toBe(
      "t1x2",
    );
  });

  it("decodes leniently: missing letter and missing xN", () => {
    // No leading solid letter ⇒ keep the default solid (cube).
    expect(decodeParams("4x4")).toEqual({ solid: SolidType.Cube, d1: 4, d2: 4 });
    // No `xN` ⇒ d2 defaults to d1.
    expect(decodeParams("o3")).toEqual({ solid: SolidType.Octahedron, d1: 3, d2: 3 });
  });

  it("validates presets and rejects degenerate params", () => {
    for (const p of PRESETS) expect(validateParams(p, true)).toBeNull();
    // A 1x1 square grid is too small for the cube.
    expect(
      validateParams({ solid: SolidType.Cube, d1: 1, d2: 1 }, true),
    ).not.toBeNull();
    // Negative dimensions.
    expect(
      validateParams({ solid: SolidType.Cube, d1: -1, d2: 4 }, true),
    ).not.toBeNull();
  });

  it("default params are the cube preset", () => {
    expect(defaultParams()).toEqual({ solid: SolidType.Cube, d1: 4, d2: 4 });
  });
});

describe("cube generation + description", () => {
  it("produces a valid, parseable description for every preset", () => {
    const rng = randomNew("cube-test-seed");
    for (const p of PRESETS) {
      const { desc } = newDesc(p, rng);
      expect(validateDesc(p, desc)).toBeNull();
      const state = newState(p, desc);
      // Exactly nfaces squares are painted blue at the start; none on faces.
      const solid = SOLIDS[p.solid];
      let blueSquares = 0;
      for (const b of state.blue) blueSquares += b;
      expect(blueSquares).toBe(solid.nfaces);
      expect(totalBlue(state)).toBe(solid.nfaces);
      // Start square is non-blue and in range.
      expect(state.current).toBeGreaterThanOrEqual(0);
      expect(state.current).toBeLessThan(state.grid.length);
      expect(state.blue[state.current]).toBe(0);
    }
  });

  it("enumerates the documented number of squares", () => {
    // Square grid: d1*d2. Triangular: d1^2 + d2^2 + 4*d1*d2.
    expect(enumGridSquares(SolidType.Cube, 4, 4).length).toBe(gridArea(4, 4, 4));
    expect(enumGridSquares(SolidType.Tetrahedron, 1, 2).length).toBe(gridArea(1, 2, 3));
    expect(enumGridSquares(SolidType.Icosahedron, 3, 3).length).toBe(gridArea(3, 3, 3));
  });
});

describe("cube rolling", () => {
  it("conserves total paint and yields a full face permutation", () => {
    const rng = randomNew("cube-roll-seed");
    for (const p of PRESETS) {
      const { desc } = newDesc(p, rng);
      let state = newState(p, desc);
      const solid = SOLIDS[p.solid];

      for (let step = 0; step < 40; step++) {
        const next = anyLegalRoll(state);
        expect(next).not.toBeNull();
        if (!next) break;
        state = next;
        // Paint is swapped, never created or destroyed.
        expect(totalBlue(state)).toBe(solid.nfaces);
        // Every face received a colour from the permutation (no -1 left).
        for (const f of state.faceColours) expect(f).toBeGreaterThanOrEqual(0);
        // Move counter advances.
        expect(state.movecount).toBe(step + 1);
      }
    }
  });

  it("does not mutate the source state", () => {
    const rng = randomNew("cube-immutable-seed");
    const p = PRESETS[0];
    const { desc } = newDesc(p, rng);
    const state = newState(p, desc);
    const before = {
      current: state.current,
      blue: Uint8Array.from(state.blue),
      faceColours: Int32Array.from(state.faceColours),
      movecount: state.movecount,
    };
    anyLegalRoll(state);
    expect(state.current).toBe(before.current);
    expect(state.movecount).toBe(before.movecount);
    expect(Array.from(state.blue)).toEqual(Array.from(before.blue));
    expect(Array.from(state.faceColours)).toEqual(Array.from(before.faceColours));
  });

  it("rolling right then left returns the cube to its start, paint restored", () => {
    // Place a cube where a right and then left roll are both legal: an
    // interior square of the 4x4 grid.
    const p: CubeParams = { solid: SolidType.Cube, d1: 4, d2: 4 };
    // Hand-built description: blue squares are irrelevant for reversal;
    // pick start square index 5 (interior: x=1,y=1) with no blue squares.
    const area = gridArea(p.d1, p.d2, SOLIDS[p.solid].order);
    const blue = new Uint8Array(area);
    const desc = `${"0".repeat(Math.floor((area + 3) / 4))},5`;
    const start = newState(p, desc);
    void blue;

    const rolledRight = executeMove(start, { dir: "R" });
    expect(rolledRight.current).not.toBe(start.current);
    const back = executeMove(rolledRight, { dir: "L" });
    expect(back.current).toBe(start.current);
    // Two paint swaps with the same square return the faces to start.
    expect(Array.from(back.faceColours)).toEqual(Array.from(start.faceColours));
  });

  it("completes when every face is painted blue (BFS to a real win)", () => {
    // A small all-blue cube grid: a bounded breadth-first search over
    // (square, face-paint, square-paint) states must find a roll
    // sequence that collects all six faces, and the engine must flag
    // completion exactly when it does. This exercises the full
    // roll → face-permutation → paint-swap → completion machinery.
    const p: CubeParams = { solid: SolidType.Cube, d1: 3, d2: 3 };
    const area = gridArea(p.d1, p.d2, SOLIDS[p.solid].order);
    const fullHexDigits = "F".repeat(Math.floor(area / 4));
    const rem = area % 4;
    const tail = rem ? "0123456789ABCDEF"[((1 << rem) - 1) << (4 - rem)] : "";
    const start = newState(p, `${fullHexDigits}${tail},0`); // all squares blue
    expect(start.completed).toBe(0);

    const key = (s: CubeState): string => {
      let fm = 0;
      for (let i = 0; i < s.faceColours.length; i++) if (s.faceColours[i]) fm |= 1 << i;
      let bm = 0;
      for (let i = 0; i < s.blue.length; i++) if (s.blue[i]) bm |= 1 << i;
      return `${s.current}|${fm}|${bm}`;
    };

    const seen = new Set<string>([key(start)]);
    let frontier: CubeState[] = [start];
    let won: CubeState | null = null;
    for (let depth = 0; depth < 40 && !won && frontier.length; depth++) {
      const next: CubeState[] = [];
      for (const s of frontier) {
        for (const dir of ["L", "R", "U", "D"] as const) {
          let cand: CubeState;
          try {
            cand = executeMove(s, { dir });
          } catch {
            continue;
          }
          if (cand.completed > 0) {
            won = cand;
            break;
          }
          const k = key(cand);
          if (!seen.has(k)) {
            seen.add(k);
            next.push(cand);
          }
        }
        if (won) break;
      }
      frontier = next;
    }

    expect(won).not.toBeNull();
    expect(won?.completed).toBeGreaterThan(0);
    // At a win every face is blue; paint is conserved at the board's
    // initial total (all `area` squares were blue, more than the six
    // faces, so leftover blue squares remain — upstream lets the solved
    // cube keep rolling).
    if (won) {
      for (const f of won.faceColours) expect(f).toBe(1);
      expect(totalBlue(won)).toBe(totalBlue(start));
    }
  });
});

describe("cube Game wiring", () => {
  it("advertises the right capabilities", () => {
    expect(cubeGame.id).toBe("cube");
    expect(cubeGame.canSolve).toBe(false);
    expect(cubeGame.canFormatAsText).toBe(false);
    expect(cubeGame.wantsStatusbar).toBe(true);
    expect(cubeGame.hint).toBeUndefined();
    expect(cubeGame.findMistakes).toBeUndefined();
  });

  it("status reflects completion", () => {
    const p = PRESETS[0];
    const rng = randomNew("cube-status-seed");
    const { desc } = newDesc(p, rng);
    const state = newState(p, desc);
    expect(cubeGame.status(state)).toBe("ongoing");
  });

  it("reports a directions mask for square grids with no diagonals", () => {
    const sq = enumGridSquares(SolidType.Cube, 4, 4)[0];
    expect(sq.directions[Direction.UpLeft]).toBe(0);
    expect(sq.directions[Direction.Left]).not.toBe(0);
  });

  it("triangular grids carry diagonal direction masks", () => {
    const squares = enumGridSquares(SolidType.Tetrahedron, 1, 2);
    // At least one triangle exposes a diagonal roll.
    expect(squares.some((s) => s.directions[Direction.UpLeft] !== 0)).toBe(true);
  });
});
