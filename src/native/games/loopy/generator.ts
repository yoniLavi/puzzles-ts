/**
 * Loopy's puzzle generator: draw a random loop, read off every clue it implies,
 * then erase as many clues as the solver can do without.
 *
 * The whole thing is **solver-gated** — `gameHasUniqueSoln` decides every clue
 * removal, every board retry and the too-easy rejection — which is why a single
 * divergence anywhere in the solver changes which descriptions come out, and
 * why the description byte-match is such a strong differential.
 */
import { APERIODIC_GRID_TYPES, type GridType } from "../../engine/grid.ts";
import { FACE_BLACK, FACE_GREY, generateLoop } from "../../engine/loopgen.ts";
import { RetryLimitExceeded, retryLimit } from "../../engine/retry-limit.ts";
import { shuffle } from "../../engine/shuffle.ts";
import type { RandomState } from "../../random/index.ts";
import { buildLoopyGrid } from "./grid-build.ts";
import { gridTypeOf, type LoopyParams } from "./params.ts";
import { gameHasUniqueSoln } from "./solver.ts";
import {
  encodeClues,
  LINE_UNKNOWN,
  type LoopyState,
  NO_CLUE,
  validateDesc,
} from "./state.ts";

/**
 * Colour every face inside or outside a random closed loop, then derive each
 * face's clue by counting its edges that cross the loop.
 *
 * The infinite exterior counts as **black** (`loopgen.h`'s `FACE_COLOUR(NULL)`),
 * which is what makes the boundary clues come out right: a white face at the
 * edge of the patch sees a colour transition across its outer edges, and so is
 * clued for them.
 */
function addFullClues(state: LoopyState, rng: RandomState): void {
  const g = state.grid;
  const board = new Int8Array(g.numFaces);
  generateLoop(g, board, rng);

  const colour = (index: number | null): number =>
    index === null ? FACE_BLACK : board[index];

  state.clues.fill(0);
  for (let i = 0; i < g.numEdges; i++) {
    const e = g.edges[i];
    const c1 = colour(e.face1?.index ?? null);
    const c2 = colour(e.face2?.index ?? null);
    // Also a check that the loop generator left no face uncoloured.
    if (c1 === FACE_GREY || c2 === FACE_GREY) {
      throw new Error("loopy: generateLoop left a face grey");
    }
    if (c1 !== c2) {
      if (e.face1) state.clues[e.face1.index]++;
      if (e.face2) state.clues[e.face2.index]++;
    }
  }
}

/**
 * Erase clues one at a time, in a random order, keeping each erasure only if
 * the board stays uniquely solvable at this difficulty.
 *
 * Mutates `state.clues` in place. Upstream clones the whole game state around
 * each attempt and restores the clone on failure; since only the clue array can
 * change, restoring the single clue is exactly equivalent — and `solveGame`
 * works on its own copy, so nothing else observes the intermediate boards.
 */
function removeClues(state: LoopyState, rng: RandomState, diff: number): void {
  const numFaces = state.grid.numFaces;
  const faceList: number[] = [];
  for (let n = 0; n < numFaces; n++) faceList.push(n);
  shuffle(faceList, rng);

  for (let n = 0; n < numFaces; n++) {
    const face = faceList[n];
    const old = state.clues[face];
    state.clues[face] = NO_CLUE;
    if (!gameHasUniqueSoln(state, diff)) state.clues[face] = old;
  }
}

/**
 * Generate a fresh puzzle description for these params.
 *
 * **Two nested retry loops, and the nesting order is not negotiable.**
 *
 * - The **outer** loop draws a grid description and builds the grid, retrying
 *   when an aperiodic patch trims away to nothing. That recovery is new (see
 *   `grid-build.ts`); upstream has no equivalent because it aborts instead.
 * - The **inner** loop is upstream's `goto newboard_please`: it re-draws the
 *   loop and its clues over the **already-built grid** until the result is
 *   uniquely solvable at the requested difficulty and *not* solvable one
 *   difficulty easier.
 *
 * Inverting them would re-derive the grid on every failed clue attempt, which
 * consumes randomness in a different order and diverges from the C on seeds
 * where it currently agrees. Upstream calls `grid_new_desc` exactly once,
 * outside its retry loop, and so do we.
 *
 * **The one recovery upstream lacks**, on top of the degenerate-patch retry: if
 * the inner loop exhausts its budget on an aperiodic grid, the *patch* is
 * unfavourable rather than the params. Upstream concedes the hazard in a
 * comment — *"this can loop for ever if the params are suitably unfavourable"* —
 * and simply hangs. Measured on the smallest legal Penrose sizes, drawing a
 * fresh patch rescues most of them (Penrose kite/dart 4x4 at Normal took 25
 * patches; the same size at Hard succeeded on the first), so the outer loop
 * re-draws. That only ever engages where upstream would hang, because the inner
 * budget stays at the house default: any board upstream *would* have found is
 * still found before we give up on a patch.
 *
 * For the deterministic tilings a fresh draw is the *same* grid, so exhaustion
 * there means the params genuinely admit no puzzle, and it propagates.
 */
export function newDesc(p: LoopyParams, rng: RandomState): { desc: string } {
  const type = gridTypeOf(p);
  // Only these tilings' descriptions consume randomness, so only for these can
  // a fresh draw produce a different grid to try.
  const gridVaries = (APERIODIC_GRID_TYPES as readonly GridType[]).includes(type);
  const patch = retryLimit("loopy: unfavourable grid patch", gridVaries ? 10 : 1);

  for (;;) {
    patch();
    const { desc: gridDesc, grid } = buildLoopyGrid(type, p.w, p.h, rng);

    const state: LoopyState = {
      grid,
      gridDesc,
      gridType: p.type,
      clues: new Int8Array(grid.numFaces),
      lines: new Uint8Array(grid.numEdges),
      lineErrors: new Uint8Array(grid.numEdges),
      exactlyOneLoop: false,
      solved: false,
      cheated: false,
    };

    try {
      generateOnGrid(state, p, rng);
    } catch (e) {
      // An unfavourable patch, not unfavourable params: try another one.
      if (e instanceof RetryLimitExceeded && gridVaries) continue;
      throw e;
    }

    const clueDesc = encodeClues(state.clues, grid.numFaces);
    return { desc: finishDesc(p, gridDesc, clueDesc) };
  }
}

/** Upstream's `newboard_please` loop: draw a loop and its clues over an
 * already-built grid until the result is uniquely solvable at this difficulty
 * and not solvable one rung easier. Mutates `state`. */
function generateOnGrid(state: LoopyState, p: LoopyParams, rng: RandomState): void {
  const board = retryLimit("loopy: board generation");
  for (;;) {
    board();
    state.lines.fill(LINE_UNKNOWN);
    state.lineErrors.fill(0);
    state.exactlyOneLoop = false;
    state.solved = false;
    state.cheated = false;

    // A fully-clued board is always solvable in principle, but not necessarily
    // *uniquely* at this difficulty — so keep drawing loops until one is.
    const clue = retryLimit("loopy: full-clue generation");
    do {
      clue();
      addFullClues(state, rng);
    } while (!gameHasUniqueSoln(state, p.diff));

    removeClues(state, rng, p.diff);

    // Reject a board a player one rung down could also solve: it would not be
    // the difficulty they asked for.
    if (p.diff > 0 && gameHasUniqueSoln(state, p.diff - 1)) continue;

    return;
  }
}

function finishDesc(p: LoopyParams, gridDesc: string | null, clueDesc: string): string {
  const desc = gridDesc === null ? clueDesc : `${gridDesc}_${clueDesc}`;

  // Upstream asserts the same thing: a description this function produced that
  // its own validator rejects is a bug in one of them, and it is much cheaper
  // to find here than in `newState`.
  const err = validateDesc(p, desc);
  if (err !== null) throw new Error(`loopy: generated an invalid desc (${err})`);

  return desc;
}
