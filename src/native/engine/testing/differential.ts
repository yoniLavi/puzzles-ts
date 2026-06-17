/**
 * Shared helper for the *byte-for-byte desc* differential shape that recurs
 * across faithful-generator ports (samegame, unruly's 1st assertion, flood,
 * guess): for each frozen C-reference fixture, assert that the TS generator,
 * run over the bit-identical RNG seeded the same way, reproduces the C desc
 * exactly.
 *
 * This is the strongest possible differential bar and is valid ONLY for a
 * faithful generator over `random.ts` (which is bit-identical to `random.c`).
 * It is deliberately narrow: the *solver-agreement* shape (decode a C board,
 * run the TS solver, assert the recorded difficulty) threads each game's own
 * decode + solver + difficulty encoding, so it stays inline in the games that
 * need it (galaxies; unruly's 2nd assertion) rather than being forced through
 * a callback-heavy "universal" helper. See the change `improve-port-tooling`
 * design notes.
 */
import { describe, expect, it } from "vitest";
import { type RandomState, randomNew } from "../../random/index.ts";

/** The minimum a byte-match fixture must carry: a seed and the C-recorded desc. */
export interface DescFixture {
  seed: string;
  desc: string;
}

export interface DescDifferentialOptions<F extends DescFixture, P> {
  /** `describe` block title. */
  title: string;
  /** Per-fixture `it` label; defaults to `seed=<seed>`. */
  label?: (fixture: F) => string;
  /** The frozen C-reference fixtures. */
  fixtures: readonly F[];
  /** Map a fixture to the params its `newDesc` takes. */
  params: (fixture: F) => P;
  /** The game's generator entry point. */
  newDesc: (params: P, rng: RandomState) => { desc: string };
  /**
   * Optional follow-on assertion run inside the same `it` after the
   * byte-match (e.g. `validateDesc(p, f.desc)` is null).
   */
  extra?: (fixture: F, params: P) => void;
}

/**
 * Assert a single fixture's byte-for-byte match (and run `extra` if given).
 * Throws on mismatch — exported so the per-fixture contract is unit-testable
 * directly, and reusable by a game that wants its own `describe`/loop shape.
 */
export function expectDescMatches<F extends DescFixture, P>(
  fixture: F,
  params: P,
  newDesc: (params: P, rng: RandomState) => { desc: string },
  extra?: (fixture: F, params: P) => void,
): void {
  const { desc } = newDesc(params, randomNew(fixture.seed));
  expect(desc).toBe(fixture.desc);
  extra?.(fixture, params);
}

/**
 * Declare the byte-for-byte desc differential for a game: a `describe(title)`
 * block with one `it` per fixture asserting
 * `newDesc(params(f), randomNew(f.seed)).desc === f.desc`. Games whose gated
 * differential is this shape SHALL use this instead of re-declaring the
 * `describe`/`for`/`it`/`expect` loop.
 */
export function describeDescDifferential<F extends DescFixture, P>(
  opts: DescDifferentialOptions<F, P>,
): void {
  const { title, fixtures, params, newDesc, label, extra } = opts;
  describe(title, () => {
    for (const f of fixtures) {
      const name = label ? label(f) : `seed=${f.seed}`;
      it(`${name}: TS desc matches C byte-for-byte`, () => {
        expectDescMatches(f, params(f), newDesc, extra);
      });
    }
  });
}
