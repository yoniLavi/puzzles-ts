/**
 * Behavioral tests for the Seismic port.
 *
 * Tiers (docs/games/testing.md § "The test tiers"): tier 1 for params / codec / solver / moves / mistakes,
 * tier 2 and 2.5 for every frame the renderer can reach.
 *
 * The boards are the C-reference descriptions the differential already pins, so
 * every test runs against a real upstream puzzle without paying to generate one
 * (7×7 boards cost tens of seconds — see `MAX_CELLS` in `state.ts`).
 */
import { describe, expect, it } from "vitest";
import { UI_UPDATE } from "../../engine/game.ts";
import { Midend } from "../../engine/index.ts";
import { LEFT_BUTTON, MOD_STYLUS, RIGHT_BUTTON } from "../../engine/pointer.ts";
import { randomNew, randomUpto } from "../../engine/random/index.ts";
import {
  type DrawOp,
  RecordingDrawing,
} from "../../engine/testing/recording-drawing.ts";
import { renderScenario } from "../../engine/testing/render-scenario.ts";
import { sizedDrawState } from "../../engine/testing/sized-draw-state.ts";
import cReference from "./__fixtures__/seismic-c-reference.json" with { type: "json" };
import { maxGeneratedRegionSize, maxRegionSize, newSeismicDesc } from "./generator.ts";
import { seismicGame } from "./index.ts";
import {
  COL_BORDER,
  COL_HIGHLIGHT,
  COL_LOWLIGHT,
  COL_NUM_ERROR,
  COL_NUM_FIXED,
  COL_NUM_GUESS,
  COL_NUM_PENCIL,
  COL_PENCIL_BODY,
  newDrawState,
  redraw,
  setTileSize,
} from "./render.ts";
import {
  SOLVE_FAILED,
  STATUS_COMPLETE,
  STATUS_INVALID,
  STATUS_UNFINISHED,
  solveGame,
  validateGame,
} from "./solver.ts";
import {
  areaBits,
  borderCount,
  cloneState,
  DIFF_EASY,
  DIFF_HARD,
  DIFF_NAMES,
  decodeParams,
  encodeDesc,
  encodeParams,
  encodeWalls,
  FM_ERRORDIST,
  FM_ERRORDUP,
  FM_FIXED,
  MAX_CELLS_SEISMIC,
  MAX_CELLS_TECTONIC,
  MODE_NAMES,
  MODE_SEISMIC,
  MODE_TECTONIC,
  newState,
  newUi,
  numBit,
  PRESETS,
  presetName,
  type SeismicMove,
  type SeismicParams,
  type SeismicState,
  textFormat,
  validateDesc,
  validateParams,
} from "./state.ts";

interface Fixture {
  seed: string;
  desc: string;
  w: number;
  h: number;
  diff: number;
  mode: number;
}
const FIXTURES = (cReference as { fixtures: Fixture[] }).fixtures;

const paramsOf = (f: Fixture): SeismicParams => ({
  w: f.w,
  h: f.h,
  diff: f.diff,
  mode: f.mode,
});
const idOf = (f: Fixture) => `${encodeParams(paramsOf(f), true)}:${f.desc}`;
const findFixture = (seed: string): Fixture => {
  const f = FIXTURES.find((x) => x.seed === seed);
  if (!f) throw new Error(`no such fixture: ${seed}`);
  return f;
};

/** A small Seismic board with real clues — the workhorse for the move and
 * mistake tests. */
const SMALL = findFixture("seismic-4x4-e-s");
/** A Tectonic board, so the mode-dependent keep-apart rule is exercised too. */
const SMALL_TECTONIC = findFixture("seismic-4x4-e-t");

const stateOf = (f: Fixture): SeismicState => newState(paramsOf(f), f.desc);

/** The unique solution of a fixture, via the solver. */
function solutionOf(f: Fixture): Uint8Array {
  const board = stateOf(f);
  expect(solveGame(board, 2)).not.toBe(SOLVE_FAILED);
  return board.grid;
}

/** The first editable (non-given) cell of a board. */
function firstFreeCell(state: SeismicState): { x: number; y: number; i: number } {
  for (let i = 0; i < state.w * state.h; i++) {
    if (!(state.flags[i] & FM_FIXED)) {
      return { x: i % state.w, y: (i / state.w) | 0, i };
    }
  }
  throw new Error("no free cell");
}

const TILE = 40;
const BORDER = 2;
const pixel = (x: number, y: number) => ({
  x: BORDER + x * TILE + TILE / 2,
  y: BORDER + y * TILE + TILE / 2,
});

// --- params ----------------------------------------------------------------

describe("seismic params", () => {
  it("round-trips every preset through encode/decode", () => {
    for (const p of PRESETS) {
      expect(decodeParams(encodeParams(p, true))).toEqual(p);
      expect(validateParams(p, true)).toBeNull();
    }
  });

  it("encodes the mode letter before the difficulty suffix", () => {
    expect(
      encodeParams({ w: 6, h: 6, diff: DIFF_EASY, mode: MODE_SEISMIC }, true),
    ).toBe("6x6de");
    expect(
      encodeParams({ w: 6, h: 6, diff: DIFF_HARD, mode: MODE_TECTONIC }, true),
    ).toBe("6x6Tdh");
    // Without `full` the difficulty is omitted, as upstream.
    expect(
      encodeParams({ w: 7, h: 4, diff: DIFF_HARD, mode: MODE_SEISMIC }, false),
    ).toBe("7x4");
  });

  it("decodes a bare width as a square board", () => {
    expect(decodeParams("5")).toEqual({
      w: 5,
      h: 5,
      diff: DIFF_EASY,
      mode: MODE_SEISMIC,
    });
  });

  it("rejects an unknown difficulty letter rather than defaulting it", () => {
    expect(validateParams(decodeParams("6x6dq"), true)).toBe(
      "Unknown difficulty rating",
    );
  });

  it("rejects boards below the minimum size", () => {
    expect(
      validateParams({ w: 3, h: 6, diff: DIFF_EASY, mode: MODE_SEISMIC }, true),
    ).toMatch(/at least 4/);
  });

  it("bounds each mode by what limits that mode", () => {
    // The two bounds answer different questions — see `MAX_CELLS_SEISMIC`'s doc
    // comment. Tectonic's is reachability (every size to 100 cells generates;
    // 10×10 takes seconds, which the owner accepts for a size the player typed).
    // Seismic's is possibility: 10×10 does not generate at all, and takes ~16 s
    // per attempt to say so.
    expect(MAX_CELLS_TECTONIC).toBe(10 * 10);
    expect(MAX_CELLS_SEISMIC).toBe(8 * 8);

    // 10×10 — the size upstream's TODO names — is available in Tectonic...
    expect(
      validateParams({ w: 10, h: 10, diff: DIFF_EASY, mode: MODE_TECTONIC }, true),
    ).toBeNull();
    // ...and refused in Seismic, with a reason naming the mode, rather than left
    // to churn for sixteen seconds and throw.
    expect(
      validateParams({ w: 10, h: 10, diff: DIFF_EASY, mode: MODE_SEISMIC }, true),
    ).toMatch(/at most 64 in Seismic mode/);
    // Past Tectonic's own bound it is refused too.
    expect(
      validateParams({ w: 11, h: 11, diff: DIFF_EASY, mode: MODE_TECTONIC }, true),
    ).toMatch(/at most 100 in Tectonic mode/);

    // Every preset stays inside its mode's bound — and presets stop well short
    // of it, because a preset is a wait nobody chose (see the doc comment).
    for (const p of PRESETS) {
      expect(validateParams(p, true)).toBeNull();
      expect(p.w * p.h).toBeLessThanOrEqual(8 * 8);
    }
  });

  it("names presets mode-first, with the game's own tier word", () => {
    // The tier word comes from `DIFF_NAMES` rather than being restated here: it
    // is the collection's, by position (`adopt-conventional-tier-names`), and a
    // literal would be a second copy to rot. What this pins is the *shape* —
    // mode, then size, then tier — which is what upstream's menu does and what
    // the config-summary template below reads.
    expect(presetName(PRESETS[4])).toBe(`Seismic: 6x6 ${DIFF_NAMES[0]}`);
    expect(presetName(PRESETS[3])).toBe(`Tectonic: 4x4 ${DIFF_NAMES[1]}`);
  });

  it("round-trips the custom-params form", () => {
    const cfg = seismicGame.paramConfig ?? [];
    for (const p of PRESETS) {
      const copy = { ...p };
      for (const item of cfg) {
        if (item.type === "string") item.set(copy, item.get(p));
        else if (item.type === "choices") item.set(copy, item.get(p));
      }
      expect(copy).toEqual(p);
    }
  });

  it("describes params with the keys the config-summary template reads", () => {
    // augmentation.ts: "{game-mode:Seismic|Tectonic}: {width}x{height} {difficulty:Easy|Hard}"
    expect(seismicGame.describeParams?.(PRESETS[7])).toEqual({
      width: "6",
      height: "6",
      difficulty: DIFF_HARD,
      "game-mode": MODE_TECTONIC,
    });
  });
});

// --- description codec -----------------------------------------------------

/** A decoder written strictly to the C's reading rules, so the encoder is
 * checked against upstream's grammar rather than against itself. */
function decodeWallsAsC(s: string, ws: number): number[] {
  const walls: number[] = [];
  let at = 0;
  let erun = 0;
  let wrun = 0;
  for (let i = 0; i < ws; i++) {
    if (erun === 0 && wrun === 0) {
      const c = s[at];
      if (c >= "0" && c <= "9") {
        let j = at;
        while (j < s.length && s[j] >= "0" && s[j] <= "9") j++;
        wrun = Number.parseInt(s.slice(at, j), 10);
        at = j;
      } else if (c >= "a" && c <= "y") {
        // A letter is a gap run *and* the wall that ends it.
        erun = c.charCodeAt(0) - 0x61 + 1;
        wrun = 1;
        at++;
      } else if (c === "z") {
        erun = 26;
        at++;
      } else {
        throw new Error(`invalid wall character ${JSON.stringify(c)} in "${s}"`);
      }
    }
    if (erun > 0) {
      walls.push(0);
      erun--;
    } else if (wrun > 0) {
      walls.push(1);
      wrun--;
    } else {
      walls.push(0);
    }
  }
  return walls;
}

describe("seismic description codec", () => {
  it("re-encodes every C description to itself", () => {
    for (const f of FIXTURES) {
      expect(encodeDesc(stateOf(f))).toBe(f.desc);
      expect(validateDesc(paramsOf(f), f.desc)).toBeNull();
    }
  });

  it("emits exactly the C's characters for ordinary short runs", () => {
    // 'a' = one gap then a wall; a digit run is that many walls.
    expect(encodeWalls([0, 1, 1, 0, 0, 1], 6)).toBe("a1b");
    expect(encodeWalls([1, 1, 1], 3)).toBe("3");
    expect(encodeWalls([0, 0, 0], 3)).toBe("c");
    expect(encodeWalls([0, 1, 0, 1], 4)).toBe("aa");
  });

  it("round-trips gap runs of 26 and more, which the C's own writer loses", () => {
    // Upstream writes a gap run as a bare `'a' + run - 1`, so a run of exactly
    // 26 becomes 'z' — which its own reader takes as "26 gaps and NO wall",
    // dropping one — and a longer run leaves the alphabet entirely. This port
    // chunks in 'z' units instead (state.ts, `encodeWalls`).
    for (const walls of [
      [...Array(26).fill(0), 1, 1, 0, 0],
      [...Array(27).fill(0), 1],
      [...Array(30).fill(0), 1, 0],
      [...Array(52).fill(0), 1],
      Array(26).fill(0),
      Array(60).fill(0),
    ]) {
      const encoded = encodeWalls(walls, walls.length);
      expect(
        [...encoded].every((c) => c >= "a" && c <= "z") || /\d/.test(encoded),
      ).toBe(true);
      expect(decodeWallsAsC(encoded, walls.length)).toEqual(walls);
    }
  });

  it("round-trips random wall patterns", () => {
    const rng = randomNew("wall-codec");
    for (let k = 0; k < 300; k++) {
      const n = 4 + randomUpto(rng, 80);
      // A biased coin, so both long gap runs and long wall runs occur.
      const wallOdds = 1 + randomUpto(rng, 9);
      const walls: number[] = [];
      for (let i = 0; i < n; i++) walls.push(randomUpto(rng, 10) < wallOdds ? 1 : 0);
      expect(decodeWallsAsC(encodeWalls(walls, n), n)).toEqual(walls);
    }
  });

  it("counts border positions as horizontal-then-vertical", () => {
    expect(borderCount(4, 4)).toBe(3 * 4 + 4 * 3);
    expect(borderCount(7, 4)).toBe(6 * 4 + 7 * 3);
  });

  it("reports upstream's three rejection reasons", () => {
    const p = paramsOf(SMALL);
    expect(validateDesc(p, "!!!,d4c1f3")).toMatch(/invalid characters/);
    // No walls at all: one region of 16 cells, far larger than 9.
    expect(validateDesc(p, "zz,p")).toMatch(/region is too large/);
    // A clue bigger than the region that holds it.
    expect(validateDesc(p, `${SMALL.desc.split(",")[0]},9o`)).toMatch(
      /clue is too large/,
    );
  });
});

// --- solver ----------------------------------------------------------------

describe("seismic solver", () => {
  it("solves every C board at exactly its recorded difficulty band", () => {
    for (const f of FIXTURES) {
      const atTarget = stateOf(f);
      expect(solveGame(atTarget, f.diff)).not.toBe(SOLVE_FAILED);
      expect(validateGame(atTarget)).toBe(STATUS_COMPLETE);

      if (f.diff > DIFF_EASY) {
        // The generator accepts a board only if it is *not* solvable one tier
        // easier, so a Hard board must defeat the Easy rungs.
        const easier = stateOf(f);
        expect(solveGame(easier, f.diff - 1)).toBe(SOLVE_FAILED);
      }
    }
  });

  it("classifies an untouched board as unfinished", () => {
    expect(validateGame(stateOf(SMALL))).toBe(STATUS_UNFINISHED);
  });

  it("flags a repeated number inside one region", () => {
    const state = stateOf(SMALL);
    const { w, h, dsf } = state;
    let a = -1;
    let b = -1;
    for (let i = 0; i < w * h && b < 0; i++) {
      if (state.grid[i] !== 0) continue;
      for (let j = i + 1; j < w * h; j++) {
        if (state.grid[j] === 0 && dsf.equivalent(i, j)) {
          a = i;
          b = j;
          break;
        }
      }
    }
    expect(b).toBeGreaterThan(-1);
    state.grid[a] = 1;
    state.grid[b] = 1;
    expect(validateGame(state)).toBe(STATUS_INVALID);
    expect(state.flags[a] & FM_ERRORDUP).toBeTruthy();
    expect(state.flags[b] & FM_ERRORDUP).toBeTruthy();
  });

  it("keeps equal numbers apart by their own value in Seismic mode", () => {
    const state = stateOf(SMALL);
    state.grid.fill(0);
    state.flags.fill(0);
    // Two 2s three cells apart on a row have two cells between them, so they
    // are legal; two apart (one cell between) is not.
    state.grid[0] = 2;
    state.grid[3] = 2;
    expect(validateGame(state)).toBe(STATUS_UNFINISHED);
    expect(state.flags[0] & FM_ERRORDIST).toBeFalsy();

    state.grid[3] = 0;
    state.grid[2] = 2;
    expect(validateGame(state)).toBe(STATUS_INVALID);
    expect(state.flags[0] & FM_ERRORDIST).toBeTruthy();
    expect(state.flags[2] & FM_ERRORDIST).toBeTruthy();
  });

  it("bars only touching cells in Tectonic mode, whatever the number", () => {
    const state = stateOf(SMALL_TECTONIC);
    state.grid.fill(0);
    state.flags.fill(0);
    const w = state.w;
    // Diagonally adjacent: illegal in Tectonic (and legal in Seismic, whose
    // rule looks only along rows and columns).
    state.grid[0] = 5;
    state.grid[w + 1] = 5;
    expect(validateGame(state)).toBe(STATUS_INVALID);
    expect(state.flags[0] & FM_ERRORDIST).toBeTruthy();

    // Two cells apart on a row: legal, even for a 5.
    state.flags.fill(0);
    state.grid[w + 1] = 0;
    state.grid[2] = 5;
    expect(validateGame(state)).toBe(STATUS_UNFINISHED);
    expect(state.flags[0] & FM_ERRORDIST).toBeFalsy();
  });
});

// --- generator -------------------------------------------------------------

describe("seismic generator", () => {
  it("is deterministic for a seed", () => {
    const p = paramsOf(SMALL);
    expect(newSeismicDesc(p, randomNew("determinism")).desc).toBe(
      newSeismicDesc(p, randomNew("determinism")).desc,
    );
  });

  it("produces a board solvable at the requested difficulty", () => {
    for (const p of [
      { w: 4, h: 4, diff: DIFF_HARD, mode: MODE_SEISMIC },
      { w: 5, h: 4, diff: DIFF_EASY, mode: MODE_TECTONIC },
    ]) {
      const { desc } = newSeismicDesc(p, randomNew(`gen-${p.w}x${p.h}-${p.mode}`));
      expect(validateDesc(p, desc)).toBeNull();
      const board = newState(p, desc);
      expect(solveGame(board, p.diff)).not.toBe(SOLVE_FAILED);
    }
  });
});

// --- the constructive generator ---------------------------------------------

/**
 * These are what **replaces the byte-match** for the shipped region generator.
 *
 * `replace-seismic-region-generator` inverted upstream's first two stages
 * (partition first, then fill), which necessarily leaves the frozen C
 * descriptions behind — upstream's stages survive only behind
 * `upstreamRegionGrower`, where the differential still runs them. So everything
 * the byte-match was implicitly guaranteeing about the *regions* has to be
 * stated and checked directly here (design D4): the structure, the mode's
 * keep-apart rule, unique solubility at the requested band, and determinism.
 *
 * Every case is a fixed seed, so the work and the verdict are identical on every
 * run, and nothing is clock-gated (docs/games/testing.md § "Seed-deterministic, never clock-gated").
 */
describe("seismic constructive generator", () => {
  /** The configurations swept below — small enough to stay fast, but covering
   * both modes, both difficulties, square and oblong. */
  const SWEEP: SeismicParams[] = [
    { w: 4, h: 4, diff: DIFF_EASY, mode: MODE_SEISMIC },
    { w: 4, h: 4, diff: DIFF_HARD, mode: MODE_SEISMIC },
    { w: 4, h: 4, diff: DIFF_EASY, mode: MODE_TECTONIC },
    { w: 4, h: 4, diff: DIFF_HARD, mode: MODE_TECTONIC },
    { w: 6, h: 5, diff: DIFF_EASY, mode: MODE_SEISMIC },
    { w: 5, h: 6, diff: DIFF_HARD, mode: MODE_TECTONIC },
  ];
  const SEEDS = ["p0", "p1", "p2"];

  /** Generate, then recover the unique solution with the solver. Returns both
   * the puzzle (clues + regions) and the completed grid. */
  function generated(p: SeismicParams, seed: string) {
    const { desc } = newSeismicDesc(p, randomNew(seed));
    const puzzle = newState(p, desc);
    const solved = newState(p, desc);
    const diff = solveGame(solved, p.diff);
    return { desc, puzzle, solved, diff };
  }

  /** The cells of each region, keyed by canonical root. */
  function regionsOf(board: SeismicState): Map<number, number[]> {
    const out = new Map<number, number[]>();
    for (let i = 0; i < board.w * board.h; i++) {
      const c = board.dsf.canonify(i);
      const cells = out.get(c);
      if (cells) cells.push(i);
      else out.set(c, [i]);
    }
    return out;
  }

  it("partitions into connected regions, each holding exactly 1..k", () => {
    for (const p of SWEEP) {
      for (const seed of SEEDS) {
        const { solved } = generated(p, `struct-${seed}`);
        const label = `${MODE_NAMES[p.mode]} ${p.w}x${p.h} d${p.diff} ${seed}`;

        for (const [, cells] of regionsOf(solved)) {
          // No region may exceed what the generator says it produces — the
          // bound the on-screen keypad is sized to — nor, a fortiori, what its
          // mode's numbers can fill.
          expect(cells.length, label).toBeLessThanOrEqual(
            maxGeneratedRegionSize(p.mode),
          );
          expect(cells.length, label).toBeLessThanOrEqual(maxRegionSize(p.mode));

          // Connected: a flood fill from one cell reaches the whole region.
          const inRegion = new Set(cells);
          const seen = new Set<number>([cells[0]]);
          const queue = [cells[0]];
          while (queue.length > 0) {
            const i = queue.pop() as number;
            const x = i % p.w;
            const y = (i / p.w) | 0;
            for (const j of [
              x > 0 ? i - 1 : -1,
              x < p.w - 1 ? i + 1 : -1,
              y > 0 ? i - p.w : -1,
              y < p.h - 1 ? i + p.w : -1,
            ]) {
              if (j >= 0 && inRegion.has(j) && !seen.has(j)) {
                seen.add(j);
                queue.push(j);
              }
            }
          }
          expect(seen.size, `${label}: region not connected`).toBe(cells.length);

          // Exactly 1..k, each once — the invariant upstream could only hope for.
          expect(
            [...cells.map((i) => solved.grid[i])].sort((a, b) => a - b),
            label,
          ).toEqual(cells.map((_, n) => n + 1));
        }
      }
    }
  });

  it("satisfies the mode's keep-apart rule across the whole solution", () => {
    for (const p of SWEEP) {
      for (const seed of SEEDS) {
        const { solved } = generated(p, `rule-${seed}`);
        const label = `${MODE_NAMES[p.mode]} ${p.w}x${p.h} d${p.diff} ${seed}`;
        const at = (x: number, y: number) => solved.grid[y * p.w + x];

        for (let y = 0; y < p.h; y++) {
          for (let x = 0; x < p.w; x++) {
            const n = at(x, y);
            expect(n, `${label}: unfilled cell`).toBeGreaterThan(0);
            if (p.mode === MODE_SEISMIC) {
              // Seismic: two n's must be more than n cells apart on a row/column.
              for (let d = 1; d <= n; d++) {
                if (x + d < p.w) expect(at(x + d, y), label).not.toBe(n);
                if (y + d < p.h) expect(at(x, y + d), label).not.toBe(n);
              }
            } else {
              // Tectonic: no two equal numbers even diagonally adjacent.
              for (let dx = -1; dx <= 1; dx++) {
                for (let dy = -1; dy <= 1; dy++) {
                  if (!dx && !dy) continue;
                  const nx = x + dx;
                  const ny = y + dy;
                  if (nx < 0 || ny < 0 || nx >= p.w || ny >= p.h) continue;
                  expect(at(nx, ny), label).not.toBe(n);
                }
              }
            }
          }
        }
      }
    }
  });

  it("is uniquely soluble at exactly the requested band, and round-trips", () => {
    for (const p of SWEEP) {
      for (const seed of SEEDS) {
        const { desc, puzzle, diff } = generated(p, `band-${seed}`);
        const label = `${MODE_NAMES[p.mode]} ${p.w}x${p.h} d${p.diff} ${seed}`;

        // The codec's halves are exact inverses, or a fresh game would not load.
        expect(validateDesc(p, desc), label).toBeNull();
        expect(encodeDesc(puzzle), label).toBe(desc);

        // Soluble at the requested difficulty. The solver never backtracks, so
        // driving the board to completion *is* the uniqueness proof.
        expect(diff, label).not.toBe(SOLVE_FAILED);

        // ...and NOT one tier easier, or it belongs in the easier band.
        if (p.diff > DIFF_EASY) {
          const easier = newState(p, desc);
          expect(
            solveGame(easier, p.diff - 1),
            `${label}: solvable one tier down`,
          ).toBe(SOLVE_FAILED);
        }
      }
    }
  });

  it("is deterministic: the same seed gives the same description", () => {
    for (const p of SWEEP) {
      const a = newSeismicDesc(p, randomNew("determinism")).desc;
      const b = newSeismicDesc(p, randomNew("determinism")).desc;
      expect(b).toBe(a);
    }
  });

  it("still differs from upstream's grower, so the oracle cannot decay", () => {
    // The differential runs `upstreamRegionGrower: true`. If the flag ever
    // stopped changing anything, those 28 byte-match assertions would silently
    // become a test of the shipped path against itself — and the whole point of
    // keeping upstream's stages alive would be lost. Design D3.
    let differences = 0;
    for (const p of SWEEP) {
      const shipped = newSeismicDesc(p, randomNew("oracle-check")).desc;
      const upstream = newSeismicDesc(p, randomNew("oracle-check"), {
        upstreamRegionGrower: true,
      }).desc;
      if (shipped !== upstream) differences++;
    }
    expect(differences, "the two generators produced identical output").toBe(
      SWEEP.length,
    );
  });
});

// --- input and moves -------------------------------------------------------

describe("seismic input", () => {
  it("selects a cell on a left click and enters a digit there", () => {
    const state = stateOf(SMALL);
    const ui = newUi(state);
    const cell = firstFreeCell(state);

    expect(
      seismicGame.interpretMove(
        state,
        ui,
        sizedDrawState(seismicGame, state),
        pixel(cell.x, cell.y),
        LEFT_BUTTON,
      ),
    ).toBe(UI_UPDATE);
    expect(ui.cursor.visible).toBe(true);
    expect(ui.cursor.x).toBe(cell.x);
    expect(ui.cursor.y).toBe(cell.y);

    expect(
      seismicGame.interpretMove(
        state,
        ui,
        sizedDrawState(seismicGame, state),
        { x: 0, y: 0 },
        0x31,
      ),
    ).toEqual({
      type: "set",
      x: cell.x,
      y: cell.y,
      n: 1,
      pencil: false,
    });
  });

  it("responds to a touch press exactly as to a mouse press", () => {
    // The midend strips MOD_STYLUS before interpretMove (docs/games/input.md § "Touch is stripped for you"); this
    // would still catch a raw-button comparison.
    const state = stateOf(SMALL);
    const cell = firstFreeCell(state);
    const mouse = newUi(state);
    const touch = newUi(state);
    seismicGame.interpretMove(
      state,
      mouse,
      sizedDrawState(seismicGame, state),
      pixel(cell.x, cell.y),
      LEFT_BUTTON,
    );
    seismicGame.interpretMove(
      state,
      touch,
      sizedDrawState(seismicGame, state),
      pixel(cell.x, cell.y),
      LEFT_BUTTON | MOD_STYLUS,
    );
    expect(touch).toEqual(mouse);
  });

  it("refuses a number larger than the cell's region", () => {
    const state = stateOf(SMALL);
    const ui = newUi(state);
    const cell = firstFreeCell(state);
    const size = state.dsf.size(cell.i);
    expect(size).toBeLessThan(9);

    ui.cursor.visible = true;
    ui.cursorFromKeyboard = true;
    ui.cursor.x = cell.x;
    ui.cursor.y = cell.y;
    expect(
      seismicGame.interpretMove(
        state,
        ui,
        sizedDrawState(seismicGame, state),
        { x: 0, y: 0 },
        0x30 + size + 1,
      ),
    ).toBeNull();
    expect(
      seismicGame.interpretMove(
        state,
        ui,
        sizedDrawState(seismicGame, state),
        { x: 0, y: 0 },
        0x30 + size,
      ),
    ).toEqual({ type: "set", x: cell.x, y: cell.y, n: size, pencil: false });
  });

  it("suppresses a no-op re-entry of the number already there", () => {
    const state = stateOf(SMALL);
    const ui = newUi(state);
    const cell = firstFreeCell(state);
    const next = seismicGame.executeMove(state, {
      type: "set",
      x: cell.x,
      y: cell.y,
      n: 1,
      pencil: false,
    });
    ui.cursor.visible = true;
    ui.cursorFromKeyboard = true;
    ui.cursor.x = cell.x;
    ui.cursor.y = cell.y;
    expect(
      seismicGame.interpretMove(
        next,
        ui,
        sizedDrawState(seismicGame, next),
        { x: 0, y: 0 },
        0x31,
      ),
    ).toBeNull();
  });

  it("never leaves a given cell highlighted", () => {
    const state = stateOf(SMALL);
    const ui = newUi(state);
    let given = -1;
    for (let i = 0; i < state.w * state.h; i++)
      if (state.flags[i] & FM_FIXED) given = i;
    expect(given).toBeGreaterThan(-1);
    seismicGame.interpretMove(
      state,
      ui,
      sizedDrawState(seismicGame, state),
      pixel(given % state.w, (given / state.w) | 0),
      LEFT_BUTTON,
    );
    expect(ui.cursor.visible).toBe(false);
  });

  it("toggles sticky pencil mode on a right click", () => {
    const state = stateOf(SMALL);
    const ui = newUi(state);
    expect(ui.pencilSticky).toBe(true);
    const cell = firstFreeCell(state);
    seismicGame.interpretMove(
      state,
      ui,
      sizedDrawState(seismicGame, state),
      pixel(cell.x, cell.y),
      RIGHT_BUTTON,
    );
    expect(ui.pencilMode).toBe(true);
    expect(ui.cursor.visible).toBe(true);
    seismicGame.interpretMove(
      state,
      ui,
      sizedDrawState(seismicGame, state),
      pixel(cell.x, cell.y),
      RIGHT_BUTTON,
    );
    expect(ui.pencilMode).toBe(false);
  });

  it("offers mark-all only while some cell's notes are incomplete", () => {
    const state = stateOf(SMALL);
    const ui = newUi(state);
    expect(
      seismicGame.interpretMove(
        state,
        ui,
        sizedDrawState(seismicGame, state),
        { x: 0, y: 0 },
        0x4d,
      ),
    ).toEqual({
      type: "pencilAll",
    });
    const filled = seismicGame.executeMove(state, { type: "pencilAll" });
    expect(
      seismicGame.interpretMove(
        filled,
        ui,
        sizedDrawState(seismicGame, filled),
        { x: 0, y: 0 },
        0x6d,
      ),
    ).toBeNull();
    for (let i = 0; i < filled.w * filled.h; i++) {
      if (filled.grid[i] === 0) {
        expect(filled.pencil[i]).toBe(areaBits(filled.dsf.size(i)));
      }
    }
  });
});

describe("seismic moves", () => {
  it("refuses to overwrite a given", () => {
    const state = stateOf(SMALL);
    let given = -1;
    for (let i = 0; i < state.w * state.h; i++)
      if (state.flags[i] & FM_FIXED) given = i;
    expect(() =>
      seismicGame.executeMove(state, {
        type: "set",
        x: given % state.w,
        y: (given / state.w) | 0,
        n: 1,
        pencil: false,
      }),
    ).toThrow();
  });

  it("toggles one pencil mark and clears them all with 0", () => {
    const state = stateOf(SMALL);
    const cell = firstFreeCell(state);
    const set = (s: SeismicState, n: number) =>
      seismicGame.executeMove(s, {
        type: "set",
        x: cell.x,
        y: cell.y,
        n,
        pencil: true,
      });
    const a = set(state, 3);
    expect(a.pencil[cell.i]).toBe(numBit(3));
    const b = set(a, 3);
    expect(b.pencil[cell.i]).toBe(0);
    const c = set(set(b, 1), 2);
    expect(c.pencil[cell.i]).toBe(numBit(1) | numBit(2));
    expect(set(c, 0).pencil[cell.i]).toBe(0);
  });

  it("leaves the original state untouched (executeMove is pure)", () => {
    const state = stateOf(SMALL);
    const before = cloneState(state);
    const cell = firstFreeCell(state);
    seismicGame.executeMove(state, {
      type: "set",
      x: cell.x,
      y: cell.y,
      n: 1,
      pencil: false,
    });
    expect(state.grid).toEqual(before.grid);
    expect(state.pencil).toEqual(before.pencil);
    expect(state.flags).toEqual(before.flags);
  });

  it("completes the board on Solve, and marks it solved-with-help", () => {
    // Driven through a real Midend: the interactive completion path is not the
    // one the differential exercises (docs/games/testing.md § "The test tiers").
    const me = new Midend(seismicGame);
    let status = "";
    me.setCallbacks(
      (n) => {
        if (n.type === "game-state-change") status = n.status;
      },
      () => {},
    );
    expect(me.newGameFromId(idOf(SMALL))).toBeUndefined();
    expect(me.solve()).toBeUndefined();
    expect(status).toBe("solved-with-help");
    // Every cell is filled in, so Solve really finished the job.
    expect(me.formatAsText()).not.toContain(".");

    // A solver fill must not fire the win flash.
    const state = stateOf(SMALL);
    const solved = seismicGame.executeMove(state, {
      type: "solve",
      grid: Array.from(solutionOf(SMALL)),
    });
    expect(solved.completed).toBe(true);
    expect(solved.cheated).toBe(true);
    expect(seismicGame.flashLength?.(state, solved, 1, newUi(state))).toBe(0);
  });

  it("flashes when the player finishes it themselves", () => {
    const state = stateOf(SMALL);
    const soln = solutionOf(SMALL);
    let cur = state;
    for (let i = 0; i < state.w * state.h; i++) {
      if (state.flags[i] & FM_FIXED) continue;
      cur = seismicGame.executeMove(cur, {
        type: "set",
        x: i % state.w,
        y: (i / state.w) | 0,
        n: soln[i],
        pencil: false,
      });
    }
    expect(cur.completed).toBe(true);
    expect(cur.cheated).toBe(false);
    expect(seismicGame.status(cur)).toBe("solved");
    expect(seismicGame.flashLength?.(state, cur, 1, newUi(state))).toBeGreaterThan(0);
  });

  it("renders the board as text with the region walls drawn", () => {
    const text = textFormat(stateOf(SMALL));
    const lines = text.trimEnd().split("\n");
    expect(lines).toHaveLength(SMALL.h * 2 + 1);
    expect(lines[0]).toBe("+-+-+-+-+");
    for (let y = 0; y < SMALL.h; y++) {
      expect(lines[1 + y * 2].startsWith("|")).toBe(true);
      expect(lines[1 + y * 2].endsWith("|")).toBe(true);
    }
    // An interior gap marks two cells sharing a region.
    expect(text).toContain(" ");
  });
});

describe("seismic keypad", () => {
  // The generator may not make a region its mode's numbers cannot fill. This
  // is the format bound's one production-adjacent reader: its job is to bound
  // the generator bound, and this is where it does it.
  it("the generator's bound never exceeds the format's, in either mode", () => {
    for (const mode of [MODE_SEISMIC, MODE_TECTONIC]) {
      expect(maxGeneratedRegionSize(mode)).toBeGreaterThan(0);
      expect(maxGeneratedRegionSize(mode)).toBeLessThanOrEqual(maxRegionSize(mode));
    }
  });

  // Pinned literally, per docs/games/input.md § "The on-screen keypad". Both
  // modes offer five: the panel is sized to the largest region the generator
  // produces, not to the nine the Seismic format admits — a digit no board can
  // hold is a button that does nothing, and on touch the panel is the only way
  // to type. Widening `SEISMIC_REGION_SIZES` is meant to fail this test.
  it("offers exactly the digits a generated board can accept, in both modes", () => {
    expect(PRESETS[4].mode).toBe(MODE_SEISMIC);
    expect(PRESETS[5].mode).toBe(MODE_TECTONIC);
    const five = ["1", "2", "3", "4", "5", "Clear"];
    expect((seismicGame.requestKeys?.(PRESETS[4]) ?? []).map((k) => k.label)).toEqual(
      five,
    );
    expect((seismicGame.requestKeys?.(PRESETS[5]) ?? []).map((k) => k.label)).toEqual(
      five,
    );
  });
});

// --- findMistakes ----------------------------------------------------------

describe("seismic findMistakes", () => {
  it("reports nothing on a correct partial board", () => {
    const state = stateOf(SMALL);
    const soln = solutionOf(SMALL);
    const cell = firstFreeCell(state);
    const partial = seismicGame.executeMove(state, {
      type: "set",
      x: cell.x,
      y: cell.y,
      n: soln[cell.i],
      pencil: false,
    });
    expect(seismicGame.findMistakes?.(partial)).toEqual([]);
  });

  it("flags a placed number that contradicts the unique solution", () => {
    const state = stateOf(SMALL);
    const soln = solutionOf(SMALL);
    const cell = firstFreeCell(state);
    const size = state.dsf.size(cell.i);
    const wrong = (soln[cell.i] % size) + 1;
    expect(wrong).not.toBe(soln[cell.i]);
    const bad = seismicGame.executeMove(state, {
      type: "set",
      x: cell.x,
      y: cell.y,
      n: wrong,
      pencil: false,
    });
    expect(seismicGame.findMistakes?.(bad)).toEqual([
      { kind: "cell", x: cell.x, y: cell.y },
    ]);
  });

  it("flags an empty cell whose notes have crossed the solution out", () => {
    // Notes are first-class markings (docs/games/mechanics.md § "Pencil marks: the full note-taking UX"): penciling every value
    // *except* the right one is as wrong as writing the wrong number.
    const state = stateOf(SMALL);
    const soln = solutionOf(SMALL);
    const cell = firstFreeCell(state);
    const size = state.dsf.size(cell.i);
    let noted = state;
    for (let n = 1; n <= size; n++) {
      if (n === soln[cell.i]) continue;
      noted = seismicGame.executeMove(noted, {
        type: "set",
        x: cell.x,
        y: cell.y,
        n,
        pencil: true,
      });
    }
    expect(seismicGame.findMistakes?.(noted)).toEqual([
      { kind: "note", x: cell.x, y: cell.y },
    ]);
  });

  it("does not flag notes that merely carry extra candidates", () => {
    const withAllNotes = seismicGame.executeMove(stateOf(SMALL), { type: "pencilAll" });
    expect(seismicGame.findMistakes?.(withAllNotes)).toEqual([]);
  });

  it("is offered to the app, so Check & Save can hard-block on it", () => {
    const me = new Midend(seismicGame);
    expect(me.newGameFromId(idOf(SMALL))).toBeUndefined();
    expect(me.getStaticProperties().canFindMistakes).toBe(true);
  });
});

// --- midend lifecycle ------------------------------------------------------

describe("seismic midend lifecycle", () => {
  it("round-trips a game with progress through save/load", () => {
    const me = new Midend(seismicGame);
    expect(me.newGameFromId(idOf(SMALL))).toBeUndefined();
    const cell = firstFreeCell(stateOf(SMALL));
    me.playMoves([
      { type: "set", x: cell.x, y: cell.y, n: 1, pencil: false },
      { type: "set", x: cell.x, y: cell.y, n: 2, pencil: true },
    ]);
    const text = me.formatAsText();

    const restored = new Midend(seismicGame);
    expect(restored.loadGame(me.saveGame())).toBeUndefined();
    expect(restored.formatAsText()).toBe(text);
    expect(restored.getParams()).toBe(me.getParams());
  });

  it("accepts every recorded board as a game id", () => {
    for (const f of FIXTURES) {
      const me = new Midend(seismicGame);
      expect(me.newGameFromId(idOf(f))).toBeUndefined();
    }
  });
});

// --- rendering -------------------------------------------------------------

describe("seismic rendering", () => {
  it("draws the opening frame: black backing, the givens, and no cursor", () => {
    const r = renderScenario({ game: seismicGame, id: idOf(SMALL) });
    const ops = r.recording.ops;
    expect(ops.some((o) => o.op === "rect" && o.color === COL_BORDER)).toBe(true);
    expect(ops.some((o) => o.op === "text" && o.color === COL_NUM_FIXED)).toBe(true);
    expect(ops.some((o) => o.op === "rect" && o.color === COL_HIGHLIGHT)).toBe(false);
    expect(ops).toMatchSnapshot();
  });

  it("inks a player's entry differently from a given", () => {
    const cell = firstFreeCell(stateOf(SMALL));
    // The solution's own value, so the entry is correct and stays green — a
    // rule-breaking entry would be drawn in the error color instead.
    const r = renderScenario({
      game: seismicGame,
      id: idOf(SMALL),
      moves: [
        {
          type: "set",
          x: cell.x,
          y: cell.y,
          n: solutionOf(SMALL)[cell.i],
          pencil: false,
        },
      ],
    });
    const ops = r.recording.ops;
    expect(ops.some((o) => o.op === "text" && o.color === COL_NUM_GUESS)).toBe(true);
    expect(ops.some((o) => o.op === "text" && o.color === COL_NUM_FIXED)).toBe(true);
    expect(ops).toMatchSnapshot();
  });

  it("reddens a number that breaks a rule the moment it is placed", () => {
    // The live rule check is a separate, weaker feature from findMistakes: it
    // fires on the board as drawn, without consulting the solution.
    const state = stateOf(SMALL);
    const { w, h, dsf } = state;
    let a = -1;
    let b = -1;
    for (let i = 0; i < w * h && b < 0; i++) {
      if (state.grid[i] !== 0) continue;
      for (let j = i + 1; j < w * h; j++) {
        if (state.grid[j] === 0 && dsf.equivalent(i, j)) {
          a = i;
          b = j;
          break;
        }
      }
    }
    const moves: SeismicMove[] = [a, b].map((i) => ({
      type: "set",
      x: i % w,
      y: (i / w) | 0,
      n: 1,
      pencil: false,
    }));
    const r = renderScenario({ game: seismicGame, id: idOf(SMALL), moves });
    expect(
      r.recording.ops.some((o) => o.op === "text" && o.color === COL_NUM_ERROR),
    ).toBe(true);
  });

  it("draws every pencil mark, including a 9", () => {
    // Upstream truncates the 9-bit mark bitmask into a `char` before drawing
    // it, so a penciled 9 never reaches the screen. It takes a nine-cell
    // region to expose that — no *generated* board has one, because the region
    // grower would have to land all nine numbers in one region — so the board
    // is hand-built through the same codec the generator writes.
    const p: SeismicParams = { w: 4, h: 4, diff: DIFF_EASY, mode: MODE_SEISMIC };
    // Cells 0..8 in one nine-cell region, 9..15 in the rest.
    const walls = new Uint8Array(borderCount(4, 4));
    const region = (i: number) => (i <= 8 ? 0 : 1);
    let at = 0;
    for (let y = 0; y < 4; y++)
      for (let x = 0; x < 3; x++)
        walls[at++] = region(y * 4 + x) === region(y * 4 + x + 1) ? 0 : 1;
    for (let y = 0; y < 3; y++)
      for (let x = 0; x < 4; x++)
        walls[at++] = region(y * 4 + x) === region((y + 1) * 4 + x) ? 0 : 1;
    const desc = `${encodeWalls(walls, walls.length)},p`;
    expect(validateDesc(p, desc)).toBeNull();
    expect(newState(p, desc).dsf.size(0)).toBe(9);

    // A 9 is enterable there — `interpretMove` caps entry at the region size.
    const state = newState(p, desc);
    const ui = newUi(state);
    ui.cursor.visible = true;
    ui.cursorFromKeyboard = true;
    ui.pencilMode = true;
    const move = seismicGame.interpretMove(
      state,
      ui,
      sizedDrawState(seismicGame, state),
      { x: 0, y: 0 },
      0x39,
    );
    expect(move).toEqual({ type: "set", x: 0, y: 0, n: 9, pencil: true });

    const r = renderScenario({
      game: seismicGame,
      id: `${encodeParams(p, true)}:${desc}`,
      moves: [move as SeismicMove],
    });
    const penciled = r.recording.ops.filter(
      (o) => o.op === "text" && o.color === COL_NUM_PENCIL,
    );
    expect(penciled).toHaveLength(1);
    expect(penciled[0]).toMatchObject({ text: "9" });
  });

  it("shows the pencil-mode indicator only while pencil mode is on", () => {
    // Tier 2: the indicator is driven by the `Ui`, which `renderScenario` does
    // not reach, so drive `redraw` against a recording double directly.
    const state = stateOf(SMALL);
    const ui = newUi(state);
    const ds = newDrawState(state);
    setTileSize(ds, TILE);
    const palette = seismicGame.colors([1, 1, 1]);

    const paint = () => {
      const dr = new RecordingDrawing(palette);
      redraw(dr, ds, null, state, 1, ui, 0, 0);
      return dr.ops;
    };
    const glyph = (ops: readonly DrawOp[]) =>
      ops.filter((o) => o.op === "polygon" && o.fill === COL_PENCIL_BODY);

    expect(glyph(paint())).toHaveLength(0);

    // A right click turns sticky pencil mode on; the next frame shows the glyph.
    const cell = firstFreeCell(state);
    seismicGame.interpretMove(state, ui, ds, pixel(cell.x, cell.y), RIGHT_BUTTON);
    expect(ui.pencilMode).toBe(true);
    expect(glyph(paint())).toHaveLength(1);

    // …and it is erased when the mode goes off again.
    seismicGame.interpretMove(state, ui, ds, pixel(cell.x, cell.y), RIGHT_BUTTON);
    expect(ui.pencilMode).toBe(false);
    expect(glyph(paint())).toHaveLength(0);
  });

  it("highlights a mistake on a board that was already drawn", () => {
    // Paint-twice (docs/games/rendering.md § "Prove the overlay repaints"): Check & Save runs a frame *after* the move
    // that drew the cell, so an overlay missing from the diff key would never
    // appear — a cold frame could not catch that.
    const state = stateOf(SMALL);
    const soln = solutionOf(SMALL);
    const cell = firstFreeCell(state);
    const wrong = (soln[cell.i] % state.dsf.size(cell.i)) + 1;

    const r = renderScenario({
      game: seismicGame,
      id: idOf(SMALL),
      moves: [{ type: "set", x: cell.x, y: cell.y, n: wrong, pencil: false }],
      showMistakes: true,
    });
    expect(r.mistakeCount).toBe(1);
    // The overlay is a stroked outline, so it records as lines, not a rect
    // (docs/games/testing.md § "Render-op vocabulary").
    expect(
      r.recording.ops.some((o) => o.op === "line" && o.color === COL_NUM_ERROR),
    ).toBe(true);
    expect(r.recording.ops).toMatchSnapshot();
  });

  it("plays the three-phase completion flash", () => {
    // Tier 2: the flash is a function of the clock, so drive `redraw` at three
    // points in it rather than trying to catch a frame mid-animation.
    const state = stateOf(SMALL);
    const palette = seismicGame.colors([1, 1, 1]);
    const phase = (flashTime: number) => {
      const ds = newDrawState(state);
      setTileSize(ds, TILE);
      const dr = new RecordingDrawing(palette);
      redraw(dr, ds, null, state, 1, newUi(state), 0, flashTime);
      return dr.ops
        .filter((o) => o.op === "rect")
        .map((o) => (o as Extract<DrawOp, { op: "rect" }>).color)
        .join(",");
    };

    // Each phase paints a different diagonal of the board in each shade, so the
    // three frames must differ — a static shift would render them identical.
    const frames = [phase(0.05), phase(0.15), phase(0.25)];
    expect(new Set(frames).size).toBe(3);
    // All three background shades appear while the flash plays.
    const ds = newDrawState(state);
    setTileSize(ds, TILE);
    const dr = new RecordingDrawing(palette);
    redraw(dr, ds, null, state, 1, newUi(state), 0, 0.05);
    const colors = new Set(dr.ops.filter((o) => o.op === "rect").map((o) => o.color));
    expect(colors.has(COL_HIGHLIGHT)).toBe(true);
    expect(colors.has(COL_LOWLIGHT)).toBe(true);
  });
});
