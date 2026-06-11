/**
 * Board generation for Cube: paint a balanced random set of blue squares
 * and pick a non-blue start square. Faithful port of `new_game_desc` in
 * cube.c — including its exact `random_upto` call sequence and the
 * shrink-the-array selection, so a given seed reproduces C's board
 * (random.ts is bit-identical end to end).
 *
 * There is no solver: Cube is a route/dexterity puzzle. Every painted
 * board is winnable by rolling, so generation is a single pass with no
 * uniqueness loop.
 */

import { type RandomState, randomUpto } from "../../random/index.ts";
import { enumGridSquares, gridArea } from "./grid.ts";
import { SOLIDS } from "./solids.ts";
import { type CubeParams, classCount, encodeDesc, squareClass } from "./state.ts";

export function newDesc(p: CubeParams, rng: RandomState): { desc: string } {
  const solid = SOLIDS[p.solid];
  const area = gridArea(p.d1, p.d2, solid.order);
  const nclasses = classCount(p.solid);

  // Group square indices by equivalence class, in enumeration order.
  const squares = enumGridSquares(p.solid, p.d1, p.d2);
  const gridptrs: number[][] = Array.from({ length: nclasses }, () => []);
  squares.forEach((sq, idx) => {
    gridptrs[squareClass(sq, nclasses)].push(idx);
  });

  const facesPerClass = solid.nfaces / nclasses;
  const flags = new Uint8Array(area);

  // In each class, pick `facesPerClass` squares to paint blue, shrinking
  // the candidate list as C does (so the random draw sequence matches).
  for (let i = 0; i < nclasses; i++) {
    const list = gridptrs[i];
    let count = list.length;
    for (let jf = 0; jf < facesPerClass; jf++) {
      const n = randomUpto(rng, count);
      flags[list[n]] = 1;
      // Move everything after n down one, mirroring the C array shuffle.
      for (let k = n; k < count - 1; k++) list[k] = list[k + 1];
      count--;
    }
  }

  // Collect the non-blue squares (for the start-square pick), in order.
  const nonBlue: number[] = [];
  for (let i = 0; i < area; i++) {
    if (!flags[i]) nonBlue.push(i);
  }

  const start = nonBlue[randomUpto(rng, nonBlue.length)];
  return { desc: encodeDesc(flags, start) };
}
