/**
 * Gated C-vs-TS differential for Seismic: the TS generator reproduces the
 * upstream description **byte for byte** for every recorded `(params, seed)`.
 *
 * This is the strongest bar available here, and it validates far more than the
 * codec. Generation is solver-gated twice over — a clue is stripped only while
 * the board still solves at the target difficulty, and the finished board is
 * kept only if it solves at that difficulty and *not* one tier easier — so a
 * matching description proves the TS solver reaches C's verdict on every
 * intermediate board, that the region-merge draws the same RNG values in the
 * same order, and that the two-part run-length codec agrees. One assertion,
 * generator + solver + codec (docs/games/solver-and-generator.md § "Solver-gated generation").
 *
 * The fixtures span all twelve of upstream's presets, both modes, both
 * difficulties and a non-square size sweep. They stop at 7×7 because upstream's
 * generator does: its region stage succeeds roughly once in 200,000 attempts
 * there and never above ~50 cells.
 *
 * **These run against the retained upstream region grower, not the shipped
 * one.** `replace-seismic-region-generator` replaced upstream's fill-then-merge
 * stages (the cause of that 1-in-200,000), but kept them reachable behind
 * `upstreamRegionGrower` precisely so this differential survives: everything
 * downstream of the regions — the solver's verdict on every intermediate board,
 * the clue-stripping loop, the codec — keeps its byte-exact oracle. The shipped
 * partition-and-fill is covered by property tests in `seismic.test.ts` instead,
 * along with an assertion that this flag still *changes* the output, so the
 * oracle cannot decay into re-testing the shipped path.
 *
 * The fixture is **frozen and cannot be regenerated**. It was captured by
 * `puzzles/auxiliary/seismic-trace.c` against upstream's C, under an
 * Emscripten/CMake build that `retire-c-engine` deleted along with the
 * sources and the harness — see `engine/testing/differential.ts`.
 */
import { describeDescDifferential } from "../../engine/testing/differential.ts";
import cReference from "./__fixtures__/seismic-c-reference.json" with { type: "json" };
import { newSeismicDesc } from "./generator.ts";
import { MODE_NAMES, type SeismicParams, validateDesc } from "./state.ts";

interface Fixture {
  seed: string;
  desc: string;
  w: number;
  h: number;
  diff: number;
  mode: number;
  /** Milliseconds the C build took for this board — recorded so the port's own
   * cost can be compared against upstream's rather than guessed at. Not
   * asserted on: a wall-clock assertion would measure the box, not the code
   * (docs/games/testing.md § "Seed-deterministic, never clock-gated"). */
  genMs: number;
}

const data = cReference as { fixtures: Fixture[] };

/** 7×7 boards legitimately cost upstream (and this port) tens of seconds to
 * generate — that is the documented weakness of the algorithm, not slow code,
 * and this port is measurably *faster* than the C on every fixture. They are
 * split into their own block purely so the suite's slow cases are named rather
 * than hidden inside a 28-case loop. */
const isSlow = (f: Fixture) => f.w * f.h >= 49;

/** The differential — and *only* the differential — runs upstream's region
 * grower, so the frozen descs stay reproducible byte-for-byte. */
const newDesc = (p: SeismicParams, rng: Parameters<typeof newSeismicDesc>[1]) =>
  newSeismicDesc(p, rng, { upstreamRegionGrower: true });

const label = (f: Fixture) =>
  `${MODE_NAMES[f.mode]} ${f.w}x${f.h} diff=${f.diff} seed=${f.seed}`;
const params = (f: Fixture): SeismicParams => ({
  w: f.w,
  h: f.h,
  diff: f.diff,
  mode: f.mode,
});
/** The generated description must also survive the game's own validator — the
 * codec's two halves are exact inverses, or a fresh game would not load. */
const extra = (f: Fixture, p: SeismicParams) => {
  if (validateDesc(p, f.desc) !== null) {
    throw new Error(`validateDesc rejected the C description: ${f.desc}`);
  }
};

describeDescDifferential<Fixture, SeismicParams>({
  title: "seismic differential (frozen C reference)",
  fixtures: data.fixtures.filter((f) => !isSlow(f)),
  label,
  params,
  newDesc,
  extra,
});

// The 7x7s cost **272 s** — 23% of the entire suite — and every configuration
// they carry (mode 0/1 × difficulty 0/1) is already asserted above by the 4x4,
// 5x5 and 6x6 fixtures. What they add is board *size* over the same code paths,
// which is worth having but not on every commit: `npm run test:slow`.
describeDescDifferential<Fixture, SeismicParams>({
  title: "seismic differential, 7x7 (frozen C reference; slow by construction)",
  fixtures: data.fixtures.filter(isSlow),
  label,
  params,
  newDesc,
  extra,
  slow: true,
});
