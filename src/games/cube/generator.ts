/**
 * Board generation for Cube: paint a balanced random set of blue squares
 * and pick a non-blue start square. Port of `new_game_desc` in cube.c,
 * keeping its `random_upto` call sequence so a seeded game ID deals the
 * same board.
 *
 * There is no solver: Cube is a route/dexterity puzzle. Every painted
 * board is winnable by rolling, so generation is a single pass with no
 * uniqueness loop.
 */

import { type RandomState, randomUpto } from "../../engine/random/index.ts";
import { enumGridSquares } from "./grid.ts";
import { SOLIDS } from "./solids.ts";
import { type CubeParams, classCount, encodeDesc, squareClass } from "./state.ts";

export function newDesc(p: CubeParams, rng: RandomState): { desc: string } {
  const solid = SOLIDS[p.solid];
  const nclasses = classCount(p.solid);

  // Group square indices by equivalence class, in enumeration order.
  const squares = enumGridSquares(p.solid, p.d1, p.d2);
  const classSquares: number[][] = Array.from({ length: nclasses }, () => []);
  squares.forEach((sq, idx) => {
    classSquares[squareClass(sq, nclasses)].push(idx);
  });

  // In each class, paint one square per face blue, drawing without
  // replacement from the class's squares in order.
  const facesPerClass = solid.nfaces / nclasses;
  const flags = new Uint8Array(squares.length);
  for (const list of classSquares) {
    for (let f = 0; f < facesPerClass; f++) {
      const [picked] = list.splice(randomUpto(rng, list.length), 1);
      flags[picked] = 1;
    }
  }

  // Collect the non-blue squares (for the start-square pick), in order.
  const nonBlue: number[] = [];
  for (let i = 0; i < flags.length; i++) {
    if (!flags[i]) nonBlue.push(i);
  }

  const start = nonBlue[randomUpto(rng, nonBlue.length)];
  return { desc: encodeDesc(flags, start) };
}
