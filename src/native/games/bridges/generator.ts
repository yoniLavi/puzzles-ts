/**
 * Bridges generator — RNG-faithful port of `new_game_desc` in
 * `puzzles/bridges.c`. Because `random.ts` is bit-identical to `random.c` and
 * nothing here sorts/shuffles the island list before encoding, the emitted desc
 * is byte-identical to C for the same seed — that is the differential test's
 * bar. The exact `random_upto` draw order (island, direction, two possible
 * expansion rolls, position offsets, bridge count) is preserved rule-for-rule.
 */
import { type RandomState, randomUpto } from "../../random/index.ts";
import { solveFromScratch } from "./solver.ts";
import {
  type BridgesParams,
  BridgesState,
  encodeGame,
  G_ISLAND,
  G_LINEH,
  G_LINEV,
  type Island,
} from "./state.ts";

const MAX_NEWISLAND_TRIES = 50;
const MIN_SENSIBLE_ISLANDS = 3;

export function newBridgesDesc(
  p: BridgesParams,
  rng: RandomState,
): { desc: string; aux?: string } {
  const wh = p.w * p.h;
  const niReq = Math.max(Math.floor((p.islands * wh) / 100), MIN_SENSIBLE_ISLANDS);

  // `generate:` — full restart on any rejection.
  while (true) {
    const st = BridgesState.empty(p);

    // Pick a first island position randomly.
    st.islandAdd(randomUpto(rng, p.w), randomUpto(rng, p.h), 0);
    let niCurr = 1;
    let niBad = 0;

    while (niCurr < niReq) {
      // Pick a random island and a random direction to extend in.
      const i = randomUpto(rng, st.islands.length);
      let is = st.islands[i];
      const j = randomUpto(rng, is.points.length);
      const dx = is.points[j].dx;
      const dy = is.points[j].dy;

      let joinx = -1;
      let joiny = -1;
      const minx = is.x + 2 * dx;
      const miny = is.y + 2 * dy;
      let maxx = 0;
      let maxy = 0;
      let x = is.x + dx;
      let y = is.y + dy;

      let is2: Island | null = null;
      let bad = false;

      if (st.gridAt(x, y) & (G_LINEV | G_LINEH)) {
        // already a line next to the island — bad.
        bad = true;
      } else {
        // Scan outward for the farthest new-island position / a joinable island.
        while (true) {
          if (x < 0 || x >= p.w || y < 0 || y >= p.h) {
            maxx = x - dx;
            maxy = y - dy;
            break;
          }
          if (st.gridAt(x, y) & G_ISLAND) {
            joinx = x;
            joiny = y;
            maxx = x - 2 * dx;
            maxy = y - 2 * dy;
            break;
          }
          if (st.gridAt(x, y) & (G_LINEV | G_LINEH)) {
            maxx = x - dx;
            maxy = y - dy;
            break;
          }
          x += dx;
          y += dy;
        }

        // Either join an existing island (loops allowed) or make a new one.
        // NOTE: the `&&` short-circuit reproduces C's draw order exactly — the
        // first expansion roll happens iff a join is available, and a failed
        // roll falls through to the second (new-island) roll below.
        if (
          p.allowloops &&
          joinx !== -1 &&
          joiny !== -1 &&
          randomUpto(rng, 100) < p.expansion
        ) {
          is2 = st.islandAt(joinx, joiny);
        } else {
          const diffx = (maxx - minx) * dx;
          const diffy = (maxy - miny) * dy;
          if (diffx < 0 || diffy < 0) {
            bad = true;
          } else {
            let newx: number;
            let newy: number;
            if (randomUpto(rng, 100) < p.expansion) {
              newx = maxx;
              newy = maxy;
            } else {
              newx = minx + randomUpto(rng, diffx + 1) * dx;
              newy = miny + randomUpto(rng, diffy + 1) * dy;
            }
            // Reject a position orthogonally adjacent to an existing island.
            if (
              (st.inGrid(newx + dy, newy + dx) &&
                st.gridAt(newx + dy, newy + dx) & G_ISLAND) ||
              (st.inGrid(newx - dy, newy - dx) &&
                st.gridAt(newx - dy, newy - dx) & G_ISLAND)
            ) {
              bad = true;
            } else {
              is2 = st.islandAdd(newx, newy, 0);
              is = st.islands[i]; // refetch (matches C; order is stable)
              niCurr++;
              niBad = 0;
            }
          }
        }
      }

      if (!bad && is2) {
        st.islandJoin(is, is2, randomUpto(rng, p.maxb) + 1, false);
        continue;
      }

      // `bad:`
      niBad++;
      if (niBad > MAX_NEWISLAND_TRIES) break; // -> generated
    }

    // `generated:`
    if (niCurr === 1) continue; // only one island — retry

    // Require at least one island on each of the four extremities.
    let echeck = 0;
    for (let gx = 0; gx < p.w; gx++) {
      if (st.gridi[0 * p.w + gx] >= 0) echeck |= 1;
      if (st.gridi[(p.h - 1) * p.w + gx] >= 0) echeck |= 2;
    }
    for (let gy = 0; gy < p.h; gy++) {
      if (st.gridi[gy * p.w + 0] >= 0) echeck |= 4;
      if (st.gridi[gy * p.w + (p.w - 1)] >= 0) echeck |= 8;
    }
    if (echeck !== 15) continue;

    st.mapCount();
    st.mapFindOrthogonal();

    // Reject if solvable one difficulty easier (too easy). `solveFromScratch`
    // map_clears + solves in place; island counts survive so encode is stable.
    if (p.difficulty > 0) {
      if (niCurr > MIN_SENSIBLE_ISLANDS && solveFromScratch(st, p.difficulty - 1) > 0) {
        continue;
      }
    }
    // Reject if not solvable at the target difficulty (too hard).
    if (solveFromScratch(st, p.difficulty) === 0) continue;

    return { desc: encodeGame(st) };
  }
}
