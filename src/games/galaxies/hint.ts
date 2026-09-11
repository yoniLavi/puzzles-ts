/**
 * Galaxies' explained hint — the second projection of the solver in
 * `solver.ts` (docs/games/hints.md § "Recording the deduction"). The rules
 * there record *why* each association or wall is forced; everything in this
 * file turns one such firing into a step the player can read and follow.
 *
 * Two vocabularies, because Galaxies is played in two:
 *
 *  - the **association** — an arrow saying "this cell belongs to that dot".
 *    Consequence-free notation (it never enters `checkComplete`), which is
 *    exactly what makes it safe for a hint to teach in.
 *  - the **wall** — the only thing that actually completes the board. Every
 *    wall the hint asks for follows from associations already made, so the
 *    plan teaches the reasoning and then cashes it in.
 */

import { deduceHintPlan, type HintPlanResult } from "../../engine/hint-plan.ts";
import type { HintStep } from "../../engine/index.ts";
import { stepBudget } from "../../engine/step-budget.ts";
import type { Point } from "../../engine/types.ts";
import { say } from "./hint-text.ts";
import type { GalaxiesMove } from "./index.ts";
import { okToAddAssocWithOpposite, reachableFromDot } from "./moves.ts";
import { type GalaxiesFiring, RUNGS } from "./solver.ts";
import {
  addAssoc,
  checkComplete,
  cloneState,
  F_DOT_BLACK,
  F_EDGE_SET,
  F_TILE_ASSOC,
  type GalaxiesState,
  idx,
  inInterior,
  SpaceType,
  spaceOppositeDot,
  spaceTypeAt,
} from "./state.ts";

/**
 * What a step paints, in two roles (docs/games/hints.md § "The element-type
 * color legend"):
 *
 *  - the **action** — the cells the association claims, the walls it draws,
 *    and the dot it points at. One color, because they are one move.
 *  - the **evidence** — the cells, walls and dots the argument reasons over.
 *
 * Cells are tile centers and walls are edge cells, both in the state's
 * half-grid coordinates, so the renderer can place them without arithmetic.
 */
export interface GalaxiesHint {
  /** Cells the move associates — the tile *and* its 180° partner, which the
   * game commits in the same move. Both are the action, and the plan tracks
   * both; {@link focus} is which of them the deduction is actually about. */
  targets: Point[];
  /**
   * The one cell the narration is about, when the firing has one. A deduction
   * settles a cell and the game brings its 180° partner along: two cells, one
   * move, but only one the player has to think about. So the deduced cell
   * takes the solid action color and the partner a bare outline of it — same
   * hue because they share a fate, different weight because only one is the
   * point.
   *
   * `null` where the cells really are equivalent (a dot's own cells, all
   * forced by one rule); there, all of them fill solid.
   */
  focus: Point | null;
  /** Walls the move draws. */
  targetWalls: Point[];
  /** The dot the association points at, ringed in the action color. */
  targetDot: Point | null;
  /** Cells the deduction reasons over. */
  area: Point[];
  /** Walls the deduction reasons over. */
  walls: Point[];
  /** Dots the argument cites (never the one it acts on — one ring role per
   * color, so "the ringed dot" is never ambiguous). */
  refDots: Point[];
}

/**
 * How many *showable* steps one `hint()` call plans ahead. A UX bound: the
 * player sees one step at a time and every request recomputes, so a longer
 * plan only costs a slower press.
 *
 * Showable, not firings: a dot inside its own cell forces that cell, but the
 * game draws no arrow there, so the firing recurs on every recompute and is
 * never shown. `deduceHintPlan` counts shown steps once a `showable` is given,
 * and the step budget catches a firing that decides nothing.
 */
const PLAN_CAP = 20;

const EMPTY: Omit<GalaxiesHint, "targets"> = {
  focus: null,
  targetWalls: [],
  targetDot: null,
  area: [],
  walls: [],
  refDots: [],
};

/**
 * The deduction a player makes with the drag itself: **only one dot could ever
 * own this cell.**
 *
 * A cell's owner must be a dot whose 180° image of the cell is on the board,
 * dot-free, and reachable from it through cells no other dot already stands
 * on — exactly the predicate behind the rings a cell→dot drag shows. When one
 * dot passes, the cell is forced, and the player can check it by dragging: one
 * ring means one answer.
 *
 * It is not in upstream's solver, and deliberately hint-only: the generator
 * never calls it, and every condition it tests is necessary for ownership. It
 * argues from the *dots*, which the player can point at, so where it and the
 * reach rung both apply this one wins as the shorter story.
 */
function soleOwnerFiring(s: GalaxiesState): GalaxiesFiring | null {
  const cols = checkComplete(s, true).colors;
  if (!cols) return null;
  // One flood per dot, not one per (cell, dot) pair.
  const reach = s.dots.map((d) => reachableFromDot(s, d.x, d.y));
  for (let y = 1; y < s.sy - 1; y += 2) {
    for (let x = 1; x < s.sx - 1; x += 2) {
      if (s.flags[idx(s, x, y)] & F_TILE_ASSOC) continue;
      const owners = s.dots.filter((d, n) =>
        okToAddAssocWithOpposite(s, x, y, d.x, d.y, cols, reach[n]),
      );
      if (owners.length !== 1) continue;
      const [only] = owners;
      const opp = spaceOppositeDot(s, x, y, only.x, only.y);
      addAssoc(s, x, y, only.x, only.y);
      if (opp && (opp.x !== x || opp.y !== y)) {
        addAssoc(s, opp.x, opp.y, only.x, only.y);
      }
      return { kind: "soleOwner", tile: { x, y }, opp, dot: only };
    }
  }
  return null;
}

// --- the plan ---------------------------------------------------------

/**
 * The ladder, in the order the *player* is best served by, which is not the
 * order the solver happens to use (`docs/games/hints.md` § "Notation and goal
 * are different move sets (Galaxies)"). Every rule is run to a fixpoint
 * regardless, so this decides which explanation is offered first and nothing
 * about what can be deduced.
 */
function nextPlanFiring(b: GalaxiesState): GalaxiesFiring | null {
  const ladder: ((s: GalaxiesState) => GalaxiesFiring | null)[] = [
    RUNGS.dotOwnCells.fire,
    // Walls first among equals: they are what finishes the board.
    RUNGS.separate.fire,
    RUNGS.enclosed.fire,
    // Before the reach argument, because it is the same conclusion with a
    // shorter proof — and one the player can confirm with a drag.
    soleOwnerFiring,
    RUNGS.reach.fire,
    RUNGS.exclave.fire,
    // Last, deliberately. Mirroring a wall is Galaxies' signature technique
    // and stays in the plan — but as the *routine* source of walls it buried
    // everything else (58% of a 7x7 plan's steps, measured), while the walls
    // it drew early are the same ones "these two cells are in different
    // galaxies" narrates later, in the game's plainest terms. Demoted, it
    // fires only where it is genuinely the deduction that unsticks the board.
    RUNGS.mirrorWall.fire,
    // And nothing after it. Hypothesizing a cell's dot and propagating until
    // something breaks would settle more boards, and that rung was removed on
    // owner acceptance: it is guessing, and "I tried them all and this one
    // survived" teaches no technique. The hint refuses instead.
  ];
  for (const rung of ladder) {
    const firing = rung(b);
    if (firing) return firing;
  }
  return null;
}

/** A firing plus whether the player's board would actually take it. A
 * deduction inside a region the player has already closed correctly is sound
 * and pointless — `addAssocWithOpposite` refuses to draw an arrow there — so
 * it advances the working board and is never shown (the Spokes
 * "useless-but-forced move" rule, docs/games/hints.md § "Hint the move that
 * advances the goal"). */
interface Planned {
  firing: GalaxiesFiring;
  showable: boolean;
}

/** Would the game commit this association if the player made it? Nothing in
 * the predicate depends on associations — only on the dots and the walls — so
 * asking after the working board has applied the firing gives the same answer
 * as asking before. */
function committable(s: GalaxiesState, tile: Point, dot: Point): boolean {
  return okToAddAssocWithOpposite(s, tile.x, tile.y, dot.x, dot.y);
}

function planned(s: GalaxiesState, firing: GalaxiesFiring): Planned {
  switch (firing.kind) {
    case "separate":
    case "mirrorWall":
      // A wall the solver forces is always one the player may draw: a wall may
      // not pass through a dot, and the cells a dot sits on are all its own,
      // so no such wall is ever a boundary.
      return { firing, showable: true };
    case "dotTile": {
      const tiles = firing.tiles.filter((t) => committable(s, t, firing.dot));
      return { firing: { ...firing, tiles }, showable: tiles.length > 0 };
    }
    default:
      return { firing, showable: committable(s, firing.tile, firing.dot) };
  }
}

/** Deduce as far as the plan cap allows, from the player's own board. `plan`
 * holds only showable firings; `hidden` counts the ones that advanced the
 * board without being shown. */
export function galaxiesHintPlan(
  state: GalaxiesState,
): HintPlanResult<Planned, string> {
  const board = cloneState(state);
  return deduceHintPlan<GalaxiesState, Planned, string>({
    board,
    status: (b) => (checkComplete(b, false).complete ? "solved" : "unfinished"),
    incomplete: "unfinished",
    // The rungs mutate as they detect, so there is no `apply` — re-applying a
    // firing that has already been made would be wrong, not just redundant.
    next: (b) => {
      const firing = nextPlanFiring(b);
      return firing ? planned(b, firing) : null;
    },
    showable: (_b, p) => p.showable,
    planCap: PLAN_CAP,
    budget: stepBudget("galaxies hint"),
  });
}

// --- narration --------------------------------------------------------

/** Is this wall part of the board's own rim? Those are set before the player
 * touches anything, so the narration names them as the board's edge. */
function atBoardEdge(s: GalaxiesState, wall: Point): boolean {
  return wall.x === 0 || wall.y === 0 || wall.x === s.sx - 1 || wall.y === s.sy - 1;
}

function isBlack(s: GalaxiesState, dot: Point): boolean {
  return (s.flags[idx(s, dot.x, dot.y)] & F_DOT_BLACK) !== 0;
}

/** Which sentence a firing speaks, and with what values. The words are
 * [`hint-text.ts`](./hint-text.ts)'s. */
export function narrate(s: GalaxiesState, firing: GalaxiesFiring): string {
  switch (firing.kind) {
    case "dotTile":
      return say.dotTile(firing.tiles.length, isBlack(s, firing.dot));
    case "separate":
      // Whether both cells draw arrows: a cell that holds its own dot does not.
      return say.separate(
        firing.tiles.every(
          (t, n) => t.x !== firing.dots[n].x || t.y !== firing.dots[n].y,
        ),
      );
    case "mirrorWall":
      return say.mirrorWall(isBlack(s, firing.dot), atBoardEdge(s, firing.from));
    case "enclosed":
      return say.enclosed(firing.openings.length, isBlack(s, firing.dot));
    case "soleOwner":
      return say.soleOwner(isBlack(s, firing.dot));
    case "onlyReach":
      return say.onlyReach(isBlack(s, firing.dot));
    case "exclave":
      return say.exclave;
  }
}

// --- highlights -------------------------------------------------------

/** The cells an association claims: the tile and the partner the same move
 * commits. A tile that is its own partner (dead center of its galaxy) lists
 * once. */
function pair(tile: Point, opp: Point | null): Point[] {
  if (!opp || (opp.x === tile.x && opp.y === tile.y)) return [tile];
  return [tile, opp];
}

/** The action of an association firing: the claimed pair, the deduced cell
 * and the dot. */
function claim(f: { tile: Point; opp: Point | null; dot: Point }): GalaxiesHint {
  return { ...EMPTY, targets: pair(f.tile, f.opp), focus: f.tile, targetDot: f.dot };
}

/**
 * The evidence area minus the cell being acted on. The partner stays shaded:
 * it is inside the area the sentence describes, and an outline over a shaded
 * cell reads as the quieter mark it is meant to be.
 */
function evidenceFor(cells: Point[], focus: Point): Point[] {
  return cells.filter((c) => c.x !== focus.x || c.y !== focus.y);
}

export function highlightsOf(firing: GalaxiesFiring): GalaxiesHint {
  switch (firing.kind) {
    case "dotTile":
      return { ...EMPTY, targets: firing.tiles, targetDot: firing.dot };
    case "separate":
      return {
        ...EMPTY,
        targets: [],
        targetWalls: [firing.edge],
        area: [firing.tiles[0], firing.tiles[1]],
        refDots: dedupe(firing.dots),
      };
    case "mirrorWall":
      return {
        ...EMPTY,
        targets: [],
        targetWalls: [firing.edge],
        // Both partners are shaded: the technique the step teaches is
        // *finding* the partner across the dot, so the picture has to show the
        // pair, not just the cell the evidence wall touches.
        area: [firing.tile, firing.opp],
        walls: [firing.from],
        refDots: [firing.dot],
      };
    case "enclosed":
      // The ways out are the whole premise, so the shaded count is exactly
      // the number the sentence claims.
      return { ...claim(firing), area: evidenceFor(firing.openings, firing.tile) };
    case "soleOwner":
      // No shaded area: the argument is about the dots, and the one that
      // survives is ringed. The ruled-out dots stay unmarked, since symmetry
      // alone leaves up to eleven of them on a 15x15 (measured), and eleven
      // crossed-out dots teach nothing.
      return claim(firing);
    case "onlyReach":
      return { ...claim(firing), area: evidenceFor(firing.region, firing.tile) };
    case "exclave":
      return { ...claim(firing), area: evidenceFor(firing.component, firing.tile) };
  }
}

function dedupe(cells: Point[]): Point[] {
  return cells.filter(
    (c, i) => cells.findIndex((o) => o.x === c.x && o.y === c.y) === i,
  );
}

// --- the move ---------------------------------------------------------

export function moveOf(firing: GalaxiesFiring): GalaxiesMove {
  if (firing.kind === "separate" || firing.kind === "mirrorWall") {
    return {
      ops: [{ kind: "edge", x: firing.edge.x, y: firing.edge.y }],
      solving: false,
    };
  }
  // A dot's own cells are one op at the dot itself (`applyOp` walks the dot's
  // 3x3), so a vertex dot's four cells are one move, as one deduction should be.
  const at = firing.kind === "dotTile" ? firing.dot : firing.tile;
  return {
    ops: [{ kind: "assoc", x: at.x, y: at.y, ax: firing.dot.x, ay: firing.dot.y }],
    solving: false,
  };
}

export function galaxiesHintSteps(
  state: GalaxiesState,
): HintStep<GalaxiesMove, GalaxiesHint>[] {
  return galaxiesHintPlan(state).plan.map((p) => ({
    move: moveOf(p.firing),
    explanation: narrate(state, p.firing),
    highlights: highlightsOf(p.firing),
  }));
}

// --- following the plan -----------------------------------------------

/** Is everything this step asks for already true of `s`? */
export function stepSatisfied(
  s: GalaxiesState,
  step: HintStep<GalaxiesMove, GalaxiesHint>,
): boolean {
  return outstanding(s, step).length === 0;
}

/** The parts of the step the board does not yet show — cells still to be
 * associated with the hinted dot, plus walls still to be drawn. */
export function outstanding(
  s: GalaxiesState,
  step: HintStep<GalaxiesMove, GalaxiesHint>,
): Point[] {
  const hl = step.highlights;
  if (!hl) return [];
  const out: Point[] = [];
  for (const w of hl.targetWalls) {
    if (!wallSet(s, w)) out.push(w);
  }
  const dot = hl.targetDot;
  if (dot) {
    for (const t of hl.targets) {
      if (!associatedWith(s, t, dot)) out.push(t);
    }
  }
  return out;
}

function wallSet(s: GalaxiesState, w: Point): boolean {
  if (!inInterior(s, w.x, w.y) || spaceTypeAt(w.x, w.y) !== SpaceType.Edge) {
    return false;
  }
  return (s.flags[idx(s, w.x, w.y)] & F_EDGE_SET) !== 0;
}

function associatedWith(s: GalaxiesState, tile: Point, dot: Point): boolean {
  const i = idx(s, tile.x, tile.y);
  if (!(s.flags[i] & F_TILE_ASSOC)) return false;
  return s.dotx[i] === dot.x && s.doty[i] === dot.y;
}
