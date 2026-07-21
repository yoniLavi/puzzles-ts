/**
 * Sokoban — gated differential check against a frozen snapshot of
 * C-generated reference boards (`__fixtures__/sokoban-c-reference.json`).
 *
 * C-free: this test does not link the C build. Sokoban has no solver, so
 * the *desc* is the whole reproducible output. The strongest meaningful
 * bar is therefore that the TS generator reproduces the C engine's level
 * byte-for-byte for the same seed — proving `random.ts` is bit-identical
 * end-to-end through every `random_upto` call the reverse-move generator
 * and its hand-rolled priority-queue BFS make, and validating the
 * run-length codec at the same time. See the change's design D1/D10.
 *
 * The fixture is a frozen snapshot — both `puzzles/unfinished/sokoban.c`
 * and `puzzles/auxiliary/sokoban-trace.c` are deleted in the same change
 * that flips the TS port to TS_PORTED (per-game C-deletion doctrine). To
 * regenerate (e.g. to broaden the snapshot) before that deletion:
 *   cmake -B build/native -S puzzles -DUSE_TS_RANDOM=0
 *   make -C build/native sokoban-trace
 *   ./build/native/auxiliary/sokoban-trace \
 *     > src/native/games/sokoban/__fixtures__/sokoban-c-reference.json
 * (`-DUSE_TS_RANDOM=0` restores the C `random.c`, which the umbrella
 * default drops.) After deletion, recover the harness from git history.
 */
import { expect } from "vitest";
import { describeDescDifferential } from "../../engine/testing/differential.ts";
import cReference from "./__fixtures__/sokoban-c-reference.json" with { type: "json" };
import { newSokobanDesc } from "./generator.ts";
import { type SokobanParams, validateDesc } from "./state.ts";

interface Fixture {
  w: number;
  h: number;
  seed: string;
  desc: string;
}

const data = cReference as { fixtures: Fixture[] };

describeDescDifferential<Fixture, SokobanParams>({
  title: "Sokoban differential (frozen C reference)",
  fixtures: data.fixtures,
  label: (f) => `${f.w}x${f.h} seed=${f.seed}`,
  params: (f) => ({ w: f.w, h: f.h }),
  newDesc: newSokobanDesc,
  extra: (f, p) => {
    // The desc the generator emits must also pass validation.
    expect(validateDesc(p, f.desc)).toBeNull();
  },
});
