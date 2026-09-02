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
import { deduceHintPlan } from "../../engine/hint-plan.ts";
import type { HintStep } from "../../engine/index.ts";
import { stepBudget } from "../../engine/step-budget.ts";
import type { GalaxiesMove } from "./index.ts";
import { okToAddAssocWithOpposite, reachableFromDot } from "./moves.ts";
import { type GalaxiesFiring, type Pos, RUNGS } from "./solver.ts";
import {
  addAssoc,
  checkComplete,
  cloneState,
  F_DOT_BLACK,
  F_EDGE_SET,
  F_TILE_ASSOC,
  type GalaxiesState,
  idx,
  inUi,
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
  targets: Pos[];
  /**
   * The one cell the narration is talking about, when the firing has one.
   *
   * A deduction settles a cell and the game brings its 180° partner along —
   * two cells, one move, but *not* two cells the player has to think about.
   * Painted identically they made "this cell" ambiguous (owner-reported), and
   * they are genuinely different roles: one is deduced, the other follows by a
   * symmetry the player already knows. So the deduced cell takes the solid
   * action color and the partner a bare outline of it — same hue, because
   * they share a fate; different weight, because only one is the point.
   *
   * `null` where the cells really are equivalent (a dot's own cells, which are
   * all forced by the same one-line rule) — there, all of them fill solid.
   */
  focus: Pos | null;
  /** Walls the move draws. */
  targetWalls: Pos[];
  /** The dot the association points at, ringed in the action color. */
  targetDot: Pos | null;
  /** Cells the deduction reasons over. */
  area: Pos[];
  /** Walls the deduction reasons over. */
  walls: Pos[];
  /** Dots the argument cites (never the one it acts on — one ring role per
   * color, so "the ringed dot" is never ambiguous). */
  refDots: Pos[];
}

/**
 * How many *showable* steps one `hint()` call plans ahead. A UX bound, not a
 * correctness one: the player sees one step at a time and every request
 * recomputes, so a longer plan buys nothing and costs a slower press.
 *
 * Showable, not firings — the distinction was a shipped bug (owner-reported).
 * A dot sitting inside its own cell forces that cell, but the game refuses to
 * draw an arrow there, so the firing re-derives on every recompute and can
 * never be shown. Counting firings let those eat the entire budget on a 15x15
 * (twenty of them in a row, measured on the reported board) and the hint
 * reported "No further move can be deduced" on a board with plenty left.
 */
const PLAN_CAP = 20;

/**
 * Hard bound on firings per call, so a board whose deduction runs a long way
 * before yielding anything showable still terminates promptly. Generous: a
 * 15x15 has 225 cells, and every firing decides at least one cell or wall, so
 * an honest plan cannot approach this.
 */
const FIRING_CAP = 600;

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
 * on — which is exactly the predicate behind the rings a cell→dot drag shows.
 * When exactly one dot passes, the cell is forced, and the player can check it
 * by dragging: one ring means one answer.
 *
 * It is not in the C solver, and deliberately hint-only: it decides nothing
 * about which boards exist (the generator never calls it), and it is sound on
 * its own terms — every condition it tests is necessary for ownership. Its
 * value over the reach rung below is that it argues from the *dots*, which is
 * the thing the sentence is about and the thing the player can point at
 * (owner-suggested at acceptance). Where both apply this one wins, because it
 * is the shorter story.
 */
function soleOwnerFiring(s: GalaxiesState): GalaxiesFiring | null {
  const cols = checkComplete(s, true).colors;
  if (!cols) return null;
  // One flood per dot, not one per (cell, dot) pair — the whole rung is then
  // about as cheap as a single reach computation.
  const reach = s.dots.map((d) => reachableFromDot(s, d.x, d.y));
  for (let y = 1; y < s.sy - 1; y += 2) {
    for (let x = 1; x < s.sx - 1; x += 2) {
      const i = idx(s, x, y);
      if (s.flags[i] & F_TILE_ASSOC) continue;
      let only: Pos | null = null;
      let several = false;
      for (let n = 0; n < s.dots.length; n++) {
        const d = s.dots[n];
        if (!okToAddAssocWithOpposite(s, x, y, d.x, d.y, cols, reach[n])) continue;
        if (only) {
          several = true;
          break;
        }
        only = d;
      }
      if (several || !only) continue;
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
    // And nothing after it. Where every direct rule is spent, the board can
    // still be settled by hypothesizing a cell's dot and propagating until
    // something breaks — that rung existed and was removed on owner
    // acceptance: it is guessing, and "I tried them all and this one survived"
    // is not a technique anyone can learn. The hint refuses instead, and the
    // player has the save slot and the solver.
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
function committable(s: GalaxiesState, tile: Pos, dot: Pos): boolean {
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

/** Deduce as far as the plan cap allows, from the player's own board. */
export function galaxiesHintPlan(state: GalaxiesState): Planned[] {
  const board = cloneState(state);
  let showable = 0;
  return deduceHintPlan<GalaxiesState, Planned, "solved" | "unfinished">({
    board,
    status: (b) => (checkComplete(b, false).complete ? "solved" : "unfinished"),
    incomplete: "unfinished",
    // The rungs mutate as they detect, so there is no `apply` — re-applying a
    // firing that has already been made would be wrong, not just redundant.
    next: (b) => {
      if (showable >= PLAN_CAP) return null;
      const firing = nextPlanFiring(b);
      if (!firing) return null;
      const p = planned(b, firing);
      if (p.showable) showable++;
      return p;
    },
    planCap: FIRING_CAP,
    budget: stepBudget("galaxies hint"),
  }).plan;
}

// --- narration --------------------------------------------------------

/** Is this wall part of the board's own rim? Those are set before the player
 * touches anything, so the narration names them as the board's edge. */
function atBoardEdge(s: GalaxiesState, wall: Pos): boolean {
  return wall.x === 0 || wall.y === 0 || wall.x === s.sx - 1 || wall.y === s.sy - 1;
}

function dotWord(s: GalaxiesState, dot: Pos): string {
  return s.flags[idx(s, dot.x, dot.y)] & F_DOT_BLACK ? "black dot" : "white dot";
}

export function narrate(s: GalaxiesState, firing: GalaxiesFiring): string {
  switch (firing.kind) {
    case "dotTile": {
      const n = firing.tiles.length;
      const cells =
        n === 1 ? "this cell" : n === 2 ? "both these cells" : `these ${n} cells`;
      // Named by where it is, not by a ring: the dot is *on* the cells being
      // filled, so a ring would be the hint's color on the hint's color.
      const where =
        n === 2 ? "between them" : n === 4 ? "at their shared corner" : "they touch";
      return `A galaxy always covers the cells its own dot sits on, so ${cells} must belong to the ${dotWord(s, firing.dot)} ${where}.`;
    }
    case "separate": {
      // A cell that *holds* its own dot draws no arrow — there is nothing to
      // point at from inside itself — so "point at different dots" would send
      // the player looking for an arrow that is not there. Both cells are
      // still visibly settled: one shows an arrow, the other shows the dot.
      const points = firing.tiles.every(
        (t, n) => t.x !== firing.dots[n].x || t.y !== firing.dots[n].y,
      );
      const verb = points ? "point at" : "go with";
      return `These two cells ${verb} different dots, so they belong to different galaxies — a wall must run between them.`;
    }
    case "mirrorWall": {
      const dot = dotWord(s, firing.dot);
      // The mirrored wall is very often the board's own rim, and calling that
      // "the marked wall" would have the player hunting for a wall they are
      // already looking at the edge of.
      // "Outlined" for a **cell**, "ringed" for a **dot**: both marks are rings
      // now, so the noun is what keeps them apart and the words follow it.
      return atBoardEdge(s, firing.from)
        ? `The two outlined cells are partners across the ${dot}, and one of them is up against the edge of the board — so the other must be walled off on the matching side.`
        : `A galaxy looks the same turned 180° about its dot: the two outlined cells are partners across the ${dot}, so the marked wall beside one must be matched beside the other.`;
    }
    case "enclosed": {
      const lead =
        firing.openings.length === 1
          ? "The only way out of this cell leads"
          : "Every way out of this cell leads";
      const walled =
        firing.openings.length === 4 ? "" : " — its other sides are walled";
      return `${lead} into the outlined galaxy${walled}, and a galaxy is one connected region, so this cell must belong to the ringed ${dotWord(s, firing.dot)}.`;
    }
    case "soleOwner":
      // The claim *is* this rung's own condition, so it is checkable by the
      // player with the gesture they already have: drag from the cell and
      // count the rings.
      return `Only one dot could ever own this cell — for any other, the cell across the dot from it would be off the board or on top of another dot. So it must belong to the ringed ${dotWord(s, firing.dot)}.`;
    case "onlyReach":
      // "shows how far", not "is everywhere": the acted-on cell carries the
      // action mark rather than the evidence one, so the outlined set is the
      // reach minus one square and an absolute claim would be a shade off true.
      return `The outline shows how far the ringed ${dotWord(s, firing.dot)}'s galaxy can still stretch. No other galaxy can reach this cell at all, so it must belong to the ringed dot.`;
    case "exclave":
      return `The outlined cells belong to the ringed ${dotWord(s, firing.dot)} but are cut off from it, and this is the only cell they can still grow through — so it must belong to the ringed dot too.`;
  }
}

// --- highlights -------------------------------------------------------

/** The cells an association claims: the tile and the partner the same move
 * commits. A tile that is its own partner (dead center of its galaxy) lists
 * once. */
function pair(tile: Pos, opp: Pos | null): Pos[] {
  if (!opp || (opp.x === tile.x && opp.y === tile.y)) return [tile];
  return [tile, opp];
}

/**
 * Only the cell being acted on is kept out of its own evidence area — the
 * partner stays shaded.
 *
 * Dropping both was wrong twice over: it made a claim false (the partner *is*
 * inside the reach the sentence describes, so a shaded area that skipped it
 * did not show "everywhere the galaxy can stretch"), and it left the partner
 * outlined on bare board, which reads as loudly as the solid fill it is
 * supposed to defer to. Shaded underneath, the outline is plainly the
 * quieter mark. Owner-reported.
 */
function evidenceFor(cells: Pos[], focus: Pos): Pos[] {
  return without(cells, [focus]);
}

function without(cells: Pos[], drop: Pos[]): Pos[] {
  return cells.filter((c) => !drop.some((d) => d.x === c.x && d.y === c.y));
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
    case "enclosed": {
      const targets = pair(firing.tile, firing.opp);
      return {
        ...EMPTY,
        targets,
        focus: firing.tile,
        targetDot: firing.dot,
        // The ways out are the whole premise, so the shaded count is exactly
        // the number the sentence claims.
        area: evidenceFor(firing.openings, firing.tile),
      };
    }
    case "soleOwner": {
      // No shaded area, and none is missing: this argument is about the dots,
      // not about a region, and the one dot that survives it is ringed. The
      // ruled-out dots are deliberately *not* marked — symmetry alone leaves
      // up to eleven of them on a 15x15 (measured), and eleven crossed-out
      // dots teach nothing.
      const targets = pair(firing.tile, firing.opp);
      return { ...EMPTY, targets, focus: firing.tile, targetDot: firing.dot };
    }
    case "onlyReach": {
      const targets = pair(firing.tile, firing.opp);
      return {
        ...EMPTY,
        targets,
        focus: firing.tile,
        targetDot: firing.dot,
        area: evidenceFor(firing.region, firing.tile),
      };
    }
    case "exclave": {
      const targets = pair(firing.tile, firing.opp);
      return {
        ...EMPTY,
        targets,
        focus: firing.tile,
        targetDot: firing.dot,
        area: evidenceFor(firing.component, firing.tile),
      };
    }
  }
}

function dedupe(cells: Pos[]): Pos[] {
  const out: Pos[] = [];
  for (const c of cells) {
    if (!out.some((o) => o.x === c.x && o.y === c.y)) out.push(c);
  }
  return out;
}

// --- the move ---------------------------------------------------------

export function moveOf(firing: GalaxiesFiring): GalaxiesMove {
  switch (firing.kind) {
    case "separate":
    case "mirrorWall":
      return {
        ops: [{ kind: "edge", x: firing.edge.x, y: firing.edge.y }],
        solving: false,
      };
    case "dotTile":
      // One op at the dot's own position claims every cell it sits on —
      // `applyOp` walks the dot's 3x3 — so a vertex dot's four cells are one
      // move, as one deduction should be.
      return {
        ops: [
          {
            kind: "assoc",
            x: firing.dot.x,
            y: firing.dot.y,
            ax: firing.dot.x,
            ay: firing.dot.y,
          },
        ],
        solving: false,
      };
    default:
      return {
        ops: [
          {
            kind: "assoc",
            x: firing.tile.x,
            y: firing.tile.y,
            ax: firing.dot.x,
            ay: firing.dot.y,
          },
        ],
        solving: false,
      };
  }
}

export function galaxiesHintSteps(
  state: GalaxiesState,
): HintStep<GalaxiesMove, GalaxiesHint>[] {
  return galaxiesHintPlan(state)
    .filter((p) => p.showable)
    .map((p) => ({
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
): Pos[] {
  const hl = step.highlights;
  if (!hl) return [];
  const out: Pos[] = [];
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

function wallSet(s: GalaxiesState, w: Pos): boolean {
  if (!inUi(s, w.x, w.y) || spaceTypeAt(w.x, w.y) !== SpaceType.Edge) return false;
  return (s.flags[idx(s, w.x, w.y)] & F_EDGE_SET) !== 0;
}

function associatedWith(s: GalaxiesState, tile: Pos, dot: Pos): boolean {
  const i = idx(s, tile.x, tile.y);
  if (!(s.flags[i] & F_TILE_ASSOC)) return false;
  return s.dotx[i] === dot.x && s.doty[i] === dot.y;
}
