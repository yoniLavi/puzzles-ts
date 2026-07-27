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
 * generator + solver + codec (playbook §4.4).
 *
 * The fixtures span all twelve presets, both modes, both difficulties and a
 * non-square size sweep. They stop at 7×7 because upstream's generator does:
 * its region stage succeeds roughly once in 200,000 attempts there and never
 * above ~50 cells (see `MAX_CELLS` in `state.ts`).
 *
 * Regenerate while `puzzles/unreleased/seismic.c` still exists (it is deleted at
 * owner acceptance; the fixture stays as this test's frozen baseline):
 *   cmake -B build/native -S puzzles -DUSE_TS_RANDOM=0
 *   (cd build/native && make seismic-trace)
 *   build/native/auxiliary/seismic-trace \
 *     > src/native/games/seismic/__fixtures__/seismic-c-reference.json
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
   * (playbook §5.2). */
  genMs: number;
}

const data = cReference as { fixtures: Fixture[] };

/** 7×7 boards legitimately cost upstream (and this port) tens of seconds to
 * generate — that is the documented weakness of the algorithm, not slow code,
 * and this port is measurably *faster* than the C on every fixture. They are
 * split into their own block purely so the suite's slow cases are named rather
 * than hidden inside a 28-case loop. */
const isSlow = (f: Fixture) => f.w * f.h >= 49;

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
  newDesc: newSeismicDesc,
  extra,
});

describeDescDifferential<Fixture, SeismicParams>({
  title: "seismic differential, 7x7 (frozen C reference; slow by construction)",
  fixtures: data.fixtures.filter(isSlow),
  label,
  params,
  newDesc: newSeismicDesc,
  extra,
});
