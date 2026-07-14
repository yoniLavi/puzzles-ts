/**
 * Netslide's explained hint.
 *
 * Netslide has no solver — the generator saves the unshuffled grid as `aux` and
 * `solve` replays it — so the hint *plans*: it searches for a short sequence of
 * slides from here to a finished network and narrates each one by the
 * consequence it actually has. The search itself is the shared
 * [`slide-planner`](../../engine/slide-planner.ts), which Sixteen also uses; what
 * lives here is everything that makes the plan *Netslide's*:
 *
 * - **Which lines may be slid** — every row and column *except the two through the
 *   source*, and only by one step at a time.
 * - **How far from finished a board is.** Sixteen's tiles are numbered, so a
 *   tile's home is given and the distance is a sum. Netslide's are wire masks and
 *   **many are identical**, so there is no one place a tile belongs — see
 *   `travelToFinish`, and the false start recorded there.
 * - **What finished means** — every tile powered from the source, which is
 *   weaker than "the board equals `aux`" and must stay that way (see below).
 * - **The narration**, which leads with the one thing this game can prove about a
 *   *move*: a tile sitting in the source's row has a single degree of freedom, so
 *   only a column move can shift it. The *rule* that the source itself never moves
 *   is left to the help text — see `narrateStep`.
 */

import type { HintResult, HintStep, HintTrackVerdict } from "../../engine/game.ts";
import { HINT_SETTING_UP } from "../../engine/hint-vocab.ts";
import {
  planSlides,
  type SlideMove,
  slidePieces,
  toroidalDist,
} from "../../engine/slide-planner.ts";
import { reconstructSolution } from "./reconstruct.ts";
import {
  D,
  isComplete,
  L,
  type NetslideMove,
  type NetslideState,
  R,
  U,
  wireCount,
} from "./state.ts";

/** What the renderer marks for the displayed step. Netslide's tiles have no
 * names — there is no "tile 8" to say — so the board carries the reference: the
 * hint marks the tile it is placing and the narration points at the mark. */
export interface NetslideHint {
  /** Flat cell the tile being placed currently sits in. */
  tile: number;
  /** Flat cell this slide lands it on. */
  landing: number;
  /** Flat cell the plan is taking it to — the end of its journey. */
  destination: number;
  /** Whether that destination is somewhere the tile genuinely **belongs**: a
   * cell the finished board wants its wires in. A plan that runs out of budget
   * before finishing can park a tile somewhere that merely helps, and saying "it
   * belongs here" about such a cell would be a claim nothing has checked. */
  belongs: boolean;
  /** The border arrow to press, as a ring cell just outside the grid. */
  arrowX: number;
  arrowY: number;
}

/** The forward-search budget. Netslide slides only ±1, so its plans are several
 * times longer than Sixteen's and the search is correspondingly deeper. A
 * partial plan is a fine outcome, so this is a "how much is a hint worth"
 * number, not a correctness one. */
const MAX_STATES = 6_000;

/* ----------------------------------------------------------------------
 * The target grid, and choosing a home for every tile.
 */

/** The generator's unshuffled grid, as wire masks. */
export function parseAux(aux: string | undefined, n: number): Uint8Array | null {
  if (!aux || aux.length !== n) return null;
  const tiles = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    const mask = Number.parseInt(aux[i], 16);
    if (Number.isNaN(mask)) return null;
    tiles[i] = mask;
  }
  return tiles;
}

/**
 * Minimum-cost perfect matching on a `k × k` cost matrix (row-major in `cost`) —
 * the Hungarian algorithm as a shortest-augmenting-path search over the dual
 * (Jonker-Volgenant form). Writes `assign[row] = column` and returns the total
 * cost.
 *
 * Deterministic by construction: every scan runs in index order and takes a
 * *strict* improvement only, so among equal-cost matchings it always settles on
 * the same one. That is the explicit tie-break the recompute-stability rule
 * demands.
 *
 * It is called once per board the search looks at — hundreds of thousands of
 * times for one hint — so it is handed its scratch space rather than allocating
 * any (`makeMatcher`).
 */
function makeMatcher(
  maxK: number,
): (cost: Int32Array, k: number, assign: Int32Array) => number {
  const size = maxK + 1;
  // 1-based, with column 0 as the virtual "unmatched" slot the search starts
  // from. `potentialRow`/`potentialCol` are the dual variables; `matchedRow[j]`
  // is the row currently matched to column j.
  const potentialRow = new Float64Array(size);
  const potentialCol = new Float64Array(size);
  const matchedRow = new Int32Array(size);
  const cameFrom = new Int32Array(size);
  const slack = new Float64Array(size);
  const done = new Uint8Array(size);
  const INF = Number.POSITIVE_INFINITY;

  return (cost, k, assign) => {
    potentialRow.fill(0, 0, k + 1);
    potentialCol.fill(0, 0, k + 1);
    matchedRow.fill(0, 0, k + 1);

    for (let row = 1; row <= k; row++) {
      matchedRow[0] = row;
      let col = 0;
      slack.fill(INF, 0, k + 1);
      done.fill(0, 0, k + 1);

      // Grow a shortest-path tree from `row` until it reaches a free column.
      do {
        done[col] = 1;
        const curRow = matchedRow[col];
        let delta = INF;
        let nextCol = 0;

        for (let j = 1; j <= k; j++) {
          if (done[j]) continue;
          const reduced =
            cost[(curRow - 1) * k + (j - 1)] - potentialRow[curRow] - potentialCol[j];
          if (reduced < slack[j]) {
            slack[j] = reduced;
            cameFrom[j] = col;
          }
          if (slack[j] < delta) {
            delta = slack[j];
            nextCol = j;
          }
        }

        for (let j = 0; j <= k; j++) {
          if (done[j]) {
            potentialRow[matchedRow[j]] += delta;
            potentialCol[j] -= delta;
          } else {
            slack[j] -= delta;
          }
        }
        col = nextCol;
      } while (matchedRow[col] !== 0);

      // Walk the augmenting path back, flipping the matching along it.
      do {
        const prev = cameFrom[col];
        matchedRow[col] = matchedRow[prev];
        col = prev;
      } while (col);
    }

    let total = 0;
    for (let j = 1; j <= k; j++) {
      const row = matchedRow[j] - 1;
      assign[row] = j - 1;
      total += cost[row * k + (j - 1)];
    }
    return total;
  };
}

/**
 * A tile's wire mask is four bits, so there are sixteen kinds of tile.
 */
const MASK_COUNT = 16;

/**
 * How far the board is from finished: the least total distance its tiles have to
 * travel to show `target`, given that tiles with the same wires are
 * interchangeable. Zero exactly on the finished picture.
 *
 * This steers the planner's search, and getting it right took a false start
 * worth recording. The obvious move is to settle the whole question once — decide
 * up front which tile ends up in which cell, then just add up the distances. It
 * is far cheaper, and it is **wrong**: that assignment is only the cheapest one
 * *for the board it was
 * computed on*, and the further the search wanders from that board the more some
 * other assignment would have cost less. The frozen answer then starts scoring
 * moves that visibly make the picture worse as progress, and the plan wanders and
 * eventually loops. Measuring the board actually in front of it costs a matching
 * per node — the groups are tiny, and nothing here allocates — and buys a number
 * that means the same thing everywhere, which is also exactly what makes a
 * recomputed plan agree with the one before it.
 */
function travelToFinish(
  s: NetslideState,
  target: Uint8Array,
): (board: Int32Array) => number {
  const { w, h } = s;
  const n = w * h;

  // Where each kind of tile is wanted. Fixed for the whole game.
  const wantedCells = new Int32Array(MASK_COUNT * n);
  const wantedCount = new Int32Array(MASK_COUNT);
  for (let cell = 0; cell < n; cell++) {
    const mask = target[cell];
    wantedCells[mask * n + wantedCount[mask]++] = cell;
  }

  const distTable = distanceTable(w, h);
  const holdingCells = new Int32Array(MASK_COUNT * n);
  const holdingCount = new Int32Array(MASK_COUNT);

  let maxGroup = 0;
  for (let mask = 0; mask < MASK_COUNT; mask++) {
    maxGroup = Math.max(maxGroup, wantedCount[mask]);
  }
  const cost = new Int32Array(maxGroup * maxGroup);
  const assign = new Int32Array(maxGroup);
  const match = makeMatcher(maxGroup);

  return (board: Int32Array): number => {
    holdingCount.fill(0);
    for (let cell = 0; cell < n; cell++) {
      const mask = board[cell];
      holdingCells[mask * n + holdingCount[mask]++] = cell;
    }

    let total = 0;
    for (let mask = 0; mask < MASK_COUNT; mask++) {
      const k = holdingCount[mask];
      if (k === 0) continue;

      // A kind of tile the finished board has no room for cannot arise on a board
      // reached by slides, but a hostile `aux` could say otherwise; charge it the
      // size of the board rather than crash.
      if (k !== wantedCount[mask]) {
        total += k * (w + h);
        continue;
      }

      // Both lists are in ascending cell order, so a group already where it
      // belongs compares equal outright — the common case, and worth not building
      // a matrix for.
      let settled = true;
      for (let i = 0; i < k; i++) {
        if (holdingCells[mask * n + i] !== wantedCells[mask * n + i]) {
          settled = false;
          break;
        }
      }
      if (settled) continue;

      if (k === 1) {
        total += distTable[holdingCells[mask * n] * n + wantedCells[mask * n]];
        continue;
      }

      for (let i = 0; i < k; i++) {
        const from = holdingCells[mask * n + i];
        for (let j = 0; j < k; j++) {
          cost[i * k + j] = distTable[from * n + wantedCells[mask * n + j]];
        }
      }
      total += match(cost, k, assign);
    }
    return total;
  };
}

/** Toroidal distance between every pair of cells. */
function distanceTable(w: number, h: number): Int32Array {
  const n = w * h;
  const table = new Int32Array(n * n);
  for (let a = 0; a < n; a++) {
    for (let b = 0; b < n; b++) {
      table[a * n + b] =
        toroidalDist(Math.floor(a / w), Math.floor(b / w), h) +
        toroidalDist(a % w, b % w, w);
    }
  }
  return table;
}

/* ----------------------------------------------------------------------
 * Moves.
 */

/** Every slide the player is allowed to make: one step, either way, along any
 * line but the two through the source. */
function legalMoves(s: NetslideState): SlideMove[] {
  const moves: SlideMove[] = [];
  for (let y = 0; y < s.h; y++) {
    if (y === s.cy) continue;
    moves.push({ axis: "row", index: y, delta: +1 });
    moves.push({ axis: "row", index: y, delta: -1 });
  }
  for (let x = 0; x < s.w; x++) {
    if (x === s.cx) continue;
    moves.push({ axis: "col", index: x, delta: +1 });
    moves.push({ axis: "col", index: x, delta: -1 });
  }
  return moves;
}

/**
 * The planner's `delta` is **how far a tile travels**; Netslide's `dir` names
 * the direction the border *arrow* points, which shifts the line's contents the
 * other way. So the two are negatives of each other, and every crossing of that
 * boundary goes through these two functions rather than an inline minus sign.
 */
function toNetslideMove(m: SlideMove): NetslideMove {
  return {
    type: "slide",
    axis: m.axis,
    index: m.index,
    dir: -m.delta as 1 | -1,
  };
}

/** The border arrow that performs this slide (a ring cell just outside the
 * grid), so the renderer can light up the one the player should press. */
function arrowFor(
  s: NetslideState,
  m: Extract<NetslideMove, { type: "slide" }>,
): { arrowX: number; arrowY: number } {
  if (m.axis === "row") {
    // A row slides left off the *left* gutter's arrow, right off the right's.
    return { arrowX: m.dir === 1 ? -1 : s.w, arrowY: m.index };
  }
  return { arrowX: m.index, arrowY: m.dir === 1 ? -1 : s.h };
}

/* ----------------------------------------------------------------------
 * The plan.
 */

export function netslideHint(
  s: NetslideState,
  aux?: string,
): HintResult<NetslideMove, NetslideHint> {
  const { w, h } = s;
  const n = w * h;

  if (isComplete(s)) return { ok: false, error: "Already solved" };

  // The finished grid to aim at: the generator's, when the game came with one,
  // and otherwise recovered from the board itself (a game arriving as a shared
  // link or a bookmark carries no `aux`, and that is an ordinary way to play).
  const target = parseAux(aux, n) ?? reconstructSolution(s);
  if (!target) {
    return { ok: false, error: "Solution not known for this puzzle" };
  }

  // The search plays on the board the player sees — the wire masks. Tiles that
  // look alike really are alike, and searching for a particular *arrangement* of
  // them would be chasing distinctions the game does not have.
  const start = Int32Array.from(s.tiles);
  const goal = Int32Array.from(target);

  // The win condition is "every tile is powered", which is *weaker* still than
  // "the board shows `aux`": the player may finish on an arrangement the plan
  // never aimed at. Test what actually wins, or the plan keeps issuing moves
  // after the game is over.
  const masks = new Uint8Array(n);
  const powersEverything = (board: Int32Array): boolean => {
    for (let cell = 0; cell < n; cell++) masks[cell] = board[cell];
    return isComplete(s, masks);
  };

  const plan = planSlides({
    w,
    h,
    start,
    goal,
    heuristic: travelToFinish(s, target),
    moves: legalMoves(s),
    isGoal: powersEverything,
    maxStates: MAX_STATES,
    // Try for a *shortest* solution before steering by any heuristic. This is
    // what makes the endgame terminate rather than merely look sensible: a hint
    // is recomputed whenever the player goes their own way, and a heuristic plan
    // recomputed move after move demonstrably loops here — five slides of the
    // same row, each one scoring as progress, land the board exactly where it
    // started. The first move of a *shortest* plan shortens the true distance to
    // the finish by one, so the walk cannot help but arrive.
    //
    // The exact search, and the two things about it that are load-bearing.
    //
    // **It fires only when the heuristic is helpless** — a strict local minimum,
    // where no forward budget will climb out. That keeps it off the common path:
    // most of the time it would be spent on a board far too far from the finish to
    // reach, and a search that cannot succeed still costs its whole budget. This is
    // affordable precisely because a plan, once found, is *carried*: the midend
    // keeps it while the player follows it, so the search is paid once and its whole
    // plan plays out.
    //
    // **And the budget is large, because the boards that reach it have earned it.**
    // The endgame Sixteen calls a swapped pair — two tiles wanting each other's
    // cells — reads as *two* cells from finished and is really ten moves away, with
    // every slide from it looking worse. Nothing but an exact search crosses that,
    // and a plan that is *shortest* is also what keeps a recomputed one from
    // cycling: its first move provably shortens the way home, so the walk cannot
    // help but arrive. A heuristic plan carries no such guarantee, and near the
    // finish it demonstrably loops — five slides of the same row, each one scoring
    // as progress, land the board exactly where it started.
    exactSearch: { when: "no-progress", maxDepth: 14, maxStates: 1_200_000 },
    // Never open by undoing the slide the player just made. It is useless advice
    // ("you just did that"), and it is the exact shape a hint ping-pong takes
    // when a recompute picks a different route: the player follows the hint, the
    // next hint sends them straight back.
    rejectFirstMove: (m) => {
      if (s.lastMoveRow >= 0)
        return (
          m.axis === "row" && m.index === s.lastMoveRow && m.delta === s.lastMoveDir
        );
      if (s.lastMoveCol >= 0)
        return (
          m.axis === "col" && m.index === s.lastMoveCol && m.delta === s.lastMoveDir
        );
      return false;
    },
  });

  if (plan.moves.length === 0) {
    return { ok: false, error: "No helpful hint found" };
  }

  return { ok: true, steps: narratePlan(s, target, plan.moves) };
}

/* ----------------------------------------------------------------------
 * Narration.
 */

/** A tile's name is its shape, which is the one thing about it the player can
 * see. There is no "tile 8" in Netslide, so the shape names the *kind* and the
 * board's highlight says *which one*. */
function tileName(mask: number): string {
  const wires = wireCount(mask);
  if (wires === 1) return "loose end";
  if (wires === 3) return "T-piece";
  if (wires === 4) return "cross";
  return mask === (L | R) || mask === (U | D) ? "straight" : "corner";
}

/** Which tile a step is about, and what the slide does to it. */
interface Focus {
  /** The label — i.e. the cell the tile started the plan in. */
  label: number;
  from: number;
  landing: number;
  /** Where this plan is taking it. */
  destination: number;
  /** Is that destination a cell the finished board wants its wires in? */
  belongs: boolean;
  /** Does this slide land it at its destination? */
  arrives: boolean;
}

/** Where a slide carries the tile currently in `cell`. */
function landingOf(cell: number, m: SlideMove, w: number, h: number): number {
  const y = Math.floor(cell / w);
  const x = cell % w;
  if (m.axis === "row") {
    if (y !== m.index) return cell;
    return y * w + ((((x + m.delta) % w) + w) % w);
  }
  if (x !== m.index) return cell;
  return ((((y + m.delta) % h) + h) % h) * w + x;
}

function distanceTo(cell: number, home: number, w: number, h: number): number {
  return (
    toroidalDist(Math.floor(cell / w), Math.floor(home / w), h) +
    toroidalDist(cell % w, home % w, w)
  );
}

/**
 * Narrate the plan step by step against the board each step applies to — the plan
 * is computed once, so every step's story has to be told from the position its
 * predecessors produce.
 *
 * **Where a tile belongs is read off the plan, not decided in advance.** Simulate
 * the whole plan first and every tile's destination is simply where it ends up.
 * That sounds like a detail and is not: settling it beforehand — picking, say, the
 * nearest cell that wants each tile's wires — produces a perfectly reasonable
 * answer that the plan then contradicts, and the hint ends up describing the very
 * slide that finishes the board as "(setting up)". A tile "belongs" somewhere only
 * if the finished board wants its wires there, and only the plan knows where it is
 * actually putting it.
 *
 * A tile that needs several slides to get there is **one journey**, not several
 * hints: the continuation legs are flagged `continuesPrevious`, so the midend
 * keeps the hint on screen through them and auto-play runs them back to back.
 */
function narratePlan(
  s: NetslideState,
  target: Uint8Array,
  path: SlideMove[],
): HintStep<NetslideMove, NetslideHint>[] {
  const { w, h } = s;
  const n = w * h;

  // Label every tile by the cell it starts in and follow the labels through the
  // plan, so we know both what the board looks like at each step and where each
  // tile finishes up.
  const boards: Int32Array[] = [];
  let at = new Int32Array(n);
  for (let cell = 0; cell < n; cell++) at[cell] = cell;
  boards.push(at);
  for (const m of path) {
    const next = new Int32Array(n);
    slidePieces(at, next, w, h, m);
    boards.push(next);
    at = next;
  }

  const finish = boards[boards.length - 1];
  const destination = new Int32Array(n);
  for (let cell = 0; cell < n; cell++) destination[finish[cell]] = cell;

  const steps: HintStep<NetslideMove, NetslideHint>[] = [];
  let journey: number | null = null;

  for (let k = 0; k < path.length; k++) {
    const focus = chooseFocus(boards[k], destination, target, s, path[k], journey);
    const continuesPrevious = journey !== null && focus.label === journey;

    steps.push(narrateStep(s, path[k], focus, continuesPrevious));

    // The journey ends when its tile arrives; otherwise the next slide that
    // carries this tile further is the same journey's next leg.
    journey = focus.arrives ? null : focus.label;
  }

  return steps;
}

/**
 * Which tile this slide is *about*.
 *
 * A slide moves every tile on its line at once, so "the tile this move is for" is
 * a choice — but it must be an honest one, so it is made by what the move
 * demonstrably does: carry on with the journey already under way if this slide
 * takes that tile nearer where the plan is putting it; otherwise take the tile the
 * slide does the most for.
 */
function chooseFocus(
  board: Int32Array,
  destination: Int32Array,
  target: Uint8Array,
  s: NetslideState,
  m: SlideMove,
  journey: number | null,
): Focus {
  const { w, h } = s;

  const line: number[] = [];
  if (m.axis === "row") {
    for (let x = 0; x < w; x++) line.push(m.index * w + x);
  } else {
    for (let y = 0; y < h; y++) line.push(y * w + m.index);
  }

  const focusOf = (cell: number): Focus => {
    const label = board[cell];
    const dest = destination[label];
    const landing = landingOf(cell, m, w, h);
    return {
      label,
      from: cell,
      landing,
      destination: dest,
      belongs: target[dest] === s.tiles[label],
      arrives: landing === dest,
    };
  };

  // The journey continues as long as this slide is still taking its tile
  // somewhere better.
  if (journey !== null) {
    const cell = line.find((c) => board[c] === journey);
    if (cell !== undefined) {
      const f = focusOf(cell);
      if (
        distanceTo(f.landing, f.destination, w, h) <
        distanceTo(cell, f.destination, w, h)
      ) {
        return f;
      }
    }
  }

  // Otherwise: the tile this slide does the most for. Delivering one outright
  // beats merely improving it; among the rest, the one left nearest its
  // destination wins, with the lowest destination cell breaking a tie — so the
  // same board always narrates the same tile.
  let best: Focus | null = null;
  let bestKey: [number, number, number] | null = null;
  for (const cell of line) {
    const f = focusOf(cell);
    const before = distanceTo(cell, f.destination, w, h);
    const after = distanceTo(f.landing, f.destination, w, h);
    if (after >= before) continue;
    const key: [number, number, number] = [f.arrives ? 0 : 1, after, f.destination];
    if (bestKey === null || less(key, bestKey)) {
      best = f;
      bestKey = key;
    }
  }
  if (best) return best;

  // Nothing on this line is getting closer to where it is going: the slide is
  // shifting the line to make room for a later one. Speak for the tile with the
  // furthest still to travel — it is the one the plan is clearing the way for.
  let furthest = focusOf(line[0]);
  for (const cell of line) {
    const f = focusOf(cell);
    if (
      distanceTo(cell, f.destination, w, h) >
      distanceTo(furthest.from, furthest.destination, w, h)
    ) {
      furthest = f;
    }
  }
  return furthest;
}

function less(a: [number, number, number], b: [number, number, number]): boolean {
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return a[i] < b[i];
  }
  return false;
}

/**
 * One step's sentence.
 *
 * Every clause is a claim, so every clause is checked — and every clause has to
 * earn the width it takes on the hint bar. Two things are worth saying about the
 * tile being placed:
 *
 * - it sits on a line that **cannot be slid**, so only the perpendicular line can
 *   shift it — a single degree of freedom, and the game's whole technique;
 * - or its destination is a cell the finished board wants its wires in, which is
 *   just stated, plainly.
 *
 * What is *not* said: that the source can never move. That is a **rule of the
 * game**, not a deduction about this move — the board already shows it (no arrows
 * are drawn beside the source's row or column) and it belongs in the help text.
 * Saying it every step made the commonest sentence 1.8× the length of the rest and
 * taught nothing the second time.
 *
 * Lines are named by **number** ("row 3 never slides"), never as "the centre":
 * `cx` is `⌊w/2⌋`, so on an even-sized board the source is visibly off-centre and
 * the player can see the claim is false.
 *
 * The move itself is *not* forced by logic — Netslide is a movement game — so
 * the conclusion is an imperative, never a modal of necessity.
 */
function narrateStep(
  s: NetslideState,
  m: SlideMove,
  focus: Focus,
  continuesPrevious: boolean,
): HintStep<NetslideMove, NetslideHint> {
  const { w, cx, cy } = s;
  const move = toNetslideMove(m);
  const name = tileName(s.tiles[focus.label]);

  const landRow = Math.floor(focus.landing / w);
  const landCol = focus.landing % w;
  const where = m.axis === "row" ? `column ${landCol + 1}` : `row ${landRow + 1}`;

  // "Where it belongs" is a claim, so it is only made when the finished board
  // really does want this tile's wires in the cell the slide is delivering it to.
  // A plan that ran out of budget can leave a tile somewhere that merely helps,
  // and there the honest thing to say is that it is being set up.
  const arrivesHome = focus.arrives && focus.belongs;
  const tail = arrivesHome ? ", where it belongs" : ` ${HINT_SETTING_UP}`;

  // A continuation leg neither re-introduces the tile nor re-explains the why:
  // leg one of this journey carried both, and it is still on screen.
  if (continuesPrevious) {
    const legTail = arrivesHome ? ", where it belongs" : "";
    return {
      move,
      explanation: `Now on to ${where}${legTail}.`,
      highlights: highlightsFor(s, move, focus),
      continuesPrevious: true,
    };
  }

  const row = Math.floor(focus.from / w);
  const col = focus.from % w;

  // The single degree of freedom. A tile in the source's row sits on a line that
  // never slides, so the only line that can move it is its column — and the other
  // way about. The row is named by its number: true at every board size, and the
  // player can count it.
  let explanation: string;
  if (row === cy && m.axis === "col") {
    explanation = `Row ${cy + 1} never slides, so only a column move can shift this ${name}: take it to ${where}${tail}.`;
  } else if (col === cx && m.axis === "row") {
    explanation = `Column ${cx + 1} never slides, so only a row move can shift this ${name}: take it to ${where}${tail}.`;
  } else if (focus.belongs && isBesideSource(focus.destination, w, cx, cy)) {
    // Stated, not argued: the network grows outward from the source, so a tile
    // that belongs against it is worth naming — but *why* the source is fixed is a
    // rule of the game, and the help text is where rules live.
    //
    // The consequence still has to be said, and "belongs beside the source" is
    // itself the arrival marker: appending `tail`'s ", where it belongs" would say
    // "belongs" twice in one sentence. So the arriving leg leads with the
    // imperative and closes on the arrival; a leg still on its way keeps the
    // shared "(setting up)" marker, which is what tells the player the cell it is
    // being taken to is not the one it belongs in.
    explanation = arrivesHome
      ? `Take this ${name} to ${where} — it belongs beside the source.`
      : `This ${name} belongs beside the source: take it to ${where} ${HINT_SETTING_UP}.`;
  } else {
    explanation = `Working on the highlighted ${name}: take it to ${where}${tail}.`;
  }

  return { move, explanation, highlights: highlightsFor(s, move, focus) };
}

/** Is `cell` orthogonally adjacent to the source — the tile power flows from, whose
 * row and column are both frozen? (Not toroidally: the claim is about the picture
 * the player is looking at.) */
function isBesideSource(cell: number, w: number, cx: number, cy: number): boolean {
  const dx = Math.abs((cell % w) - cx);
  const dy = Math.abs(Math.floor(cell / w) - cy);
  return dx + dy === 1;
}

function highlightsFor(
  s: NetslideState,
  move: NetslideMove,
  focus: Focus,
): NetslideHint {
  const slide = move as Extract<NetslideMove, { type: "slide" }>;
  return {
    tile: focus.from,
    landing: focus.landing,
    destination: focus.destination,
    belongs: focus.belongs,
    ...arrowFor(s, slide),
  };
}

/* ----------------------------------------------------------------------
 * Following the plan.
 */

/**
 * Netslide's steps are single ±1 slides, so there is no such thing as partial
 * progress within a step: the player either makes the slide the step asks for —
 * which lands the tile exactly where the plan expects, so the remaining steps
 * stay valid — or they have gone their own way and the plan is dropped and
 * recomputed.
 */
export function netslideHintKeepTrack(
  m: NetslideMove,
  step: HintStep<NetslideMove, NetslideHint>,
  _s: NetslideState,
): HintTrackVerdict {
  if (m.type !== "slide" || step.move.type !== "slide") return "off";
  const want = step.move;
  return m.axis === want.axis && m.index === want.index && m.dir === want.dir
    ? "completed"
    : "off";
}
