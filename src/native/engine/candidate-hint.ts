/**
 * Shared hint-*plan* plumbing for the candidate-elimination games — every
 * pencil-notes puzzle whose hint sets and strikes candidate notes and places a
 * value when a cell's notes collapse to one (Towers, Unequal, Keen, Solo). The
 * games' *solvers* stay separate on purpose (Towers/Unequal/Keen ride
 * `latin.ts`; Solo is bespoke for byte-match fidelity); the already-shared seam
 * at the solver boundary is the {@link DeductionRecord} shape, which every game
 * produces from its own techniques and this module consumes uniformly.
 *
 * This module owns the parts that were byte-identical across those four games'
 * `index.ts` hint sections: the pure plan helpers (naked-single finder, the
 * lazy-populate check, the unreflected-placement index, the next-strike and
 * next-place lookups) and the generic `keepCandidateHintTrack` /
 * `refreshCandidateHintStep`. What stays per-game is the `buildSteps` *walk*
 * itself (its step order, strike-split policy and journey continuation differ per
 * game — a shared driver was evaluated and deliberately not built, see
 * `docs/porting/hint-authoring.md` §9) together with the recording solver, the
 * narration and the reason union. The rule of thumb: this module owns the
 * reusable *mechanics*, the game owns the *walk and the meaning*.
 *
 * See `docs/porting/hint-authoring.md` §9 for the candidate-elimination pattern
 * this module supports.
 */

import type { HintResult, HintStep, HintTrackVerdict } from "./game.ts";
import type { DeductionRecord } from "./latin.ts";
import type { ClassifyRegion } from "./latin-hint.ts";

/** A board cell. */
export interface Cell {
  x: number;
  y: number;
}

/** A single pencil candidate `n` at cell `(x, y)` — the unit a strike acts on. */
export interface Mark {
  x: number;
  y: number;
  n: number;
}

/** The three move variants a candidate-elimination hint plan ever emits. Every
 * such game's `Move` union is a superset of these (it also carries `solve` and
 * incidental fields); the generic plan functions act only on this subset and
 * treat anything else as off-plan. */
export type CandidateMove =
  | {
      type: "set";
      x: number;
      y: number;
      n: number;
      pencil: boolean;
      autoElim?: boolean;
    }
  | { type: "pencilAll" }
  | { type: "pencilStrike"; marks: Mark[] };

/** The highlight shape every candidate-elimination game's hint renders: the
 * deduction's evidence (`area`), the cell(s) it acts on (`targets`), and the
 * candidate(s) struck (`marks`). The generic plan functions update `targets` and
 * `marks` as a strike step shrinks; the game's own `Hint` type satisfies this. */
export interface CandidateHighlights {
  area: Cell[];
  targets: Cell[];
  marks: Mark[];
}

/** The shared `hint()` entry every candidate-elimination game uses: refuse on a
 * solved board, refuse (pointing at the mistake overlay) on a wrong board, build
 * the plan, refuse when it is empty, else return it. The only per-game inputs are
 * the game's own `findMistakes` and `buildSteps` (the latter owns the walk that
 * genuinely differs); everything else — the three user-facing refusal strings and
 * the `autoPencil` default — is shared so a wording tweak lands in one place
 * instead of drifting across four games.
 *
 * `autoPencil` defaults **off**: with no `ui` (tests/harness) the hint teaches the
 * trivial row/column/region eliminations as explicit strikes rather than folding
 * them into placements (matches the games' default-auto-pencil-off preference).
 */
export function candidateHint<State extends { completed: boolean }, Move, Hint>(
  state: State,
  ui: { autoPencil?: boolean } | undefined,
  findMistakes: (state: State) => readonly unknown[],
  buildSteps: (state: State, autoClean: boolean) => HintStep<Move, Hint>[],
): HintResult<Move, Hint> {
  if (state.completed) return { ok: false, error: "This board is already solved." };
  if (findMistakes(state).length > 0) {
    return {
      ok: false,
      error:
        "Fix the highlighted mistakes first — a hint can't deduce from a wrong board.",
    };
  }
  const autoClean = ui?.autoPencil ?? false;
  const steps = buildSteps(state, autoClean);
  if (steps.length === 0) {
    return { ok: false, error: "No further move can be deduced from this position." };
  }
  return { ok: true, steps };
}

/** Join a value list for narration: `[3]`→"3", `[1,2]`→"1 and 2",
 * `[1,2,3]`→"1, 2 and 3". */
export function joinNums(ns: number[]): string {
  if (ns.length <= 1) return `${ns[0] ?? ""}`;
  if (ns.length === 2) return `${ns[0]} and ${ns[1]}`;
  return `${ns.slice(0, -1).join(", ")} and ${ns[ns.length - 1]}`;
}

/** A naked single in the working notes: the first empty cell whose pencil set has
 * exactly one candidate. On a mistake-free board that lone candidate is the
 * solution, so placing it is sound — and it is the move a human makes next, so the
 * hint surfaces it ahead of any further elimination (hint-authoring §9.3).
 * `grid`: 0 = empty; `pencil`: bit `1 << d` = candidate `d`; `w` = grid order. */
export function nakedSingle(
  grid: ArrayLike<number>,
  pencil: ArrayLike<number>,
  w: number,
): { x: number; y: number; n: number } | null {
  for (let i = 0; i < w * w; i++) {
    if (grid[i] !== 0 || pencil[i] === 0) continue;
    if ((pencil[i] & (pencil[i] - 1)) !== 0) continue; // more than one bit set
    for (let v = 1; v <= w; v++) {
      if (pencil[i] & (1 << v)) return { x: i % w, y: (i / w) | 0, n: v };
    }
  }
  return null;
}

/** True iff some empty cell carries no pencil notes — i.e. the board needs a
 * fill-all populate before the eliminations have anything to cross out. */
export function anyEmptyLacksNotes(
  grid: ArrayLike<number>,
  pencil: ArrayLike<number>,
  w: number,
): boolean {
  for (let i = 0; i < w * w; i++) {
    if (grid[i] === 0 && pencil[i] === 0) return true;
  }
  return false;
}

/** Index of the first recorded placement whose cell is *not yet* on the working
 * grid: every op before it is valid against the current working grid (placements
 * before it are already reflected), so a strike there can be surfaced now with a
 * premise the player's board supports (hint-authoring §9.3, the
 * "facing-place buries clue deductions" gotcha). */
export function firstUnreflectedPlaceIndex(
  ops: readonly DeductionRecord[],
  grid: ArrayLike<number>,
  w: number,
): number {
  for (let i = 0; i < ops.length; i++) {
    if (ops[i].kind === "place" && grid[ops[i].y * w + ops[i].x] === 0) return i;
  }
  return ops.length;
}

/** The next deduction-strike *firing* whose marks are still live, considering only
 * eliminations valid against the current grid. One returned firing is one `group`
 * (one cage/line/region firing); the caller splits it into a per-cell (or whole)
 * journey. `dup` strikes are excluded — those are placement bookkeeping handled by
 * the placement emitter, not a technique to teach. (Solo never records a `dup`
 * elim, so the filter is a no-op there; Towers/Unequal/Keen's generic solver does,
 * so it is load-bearing for them — the shared filter is correct for all four.) */
export function nextStrike<R extends DeductionRecord>(
  ops: readonly R[],
  grid: ArrayLike<number>,
  pencil: ArrayLike<number>,
  w: number,
): R[] | null {
  const lim = firstUnreflectedPlaceIndex(ops, grid, w);
  const liveAt = (op: R): boolean =>
    op.kind === "elim" &&
    grid[op.y * w + op.x] === 0 &&
    (pencil[op.y * w + op.x] & (1 << op.n)) !== 0 &&
    (op.reason as { kind?: string }).kind !== "dup";
  let i = 0;
  while (i < lim) {
    const g = ops[i].group;
    const group: R[] = [];
    while (i < lim && ops[i].group === g) group.push(ops[i++]);
    const live = group.filter(liveAt);
    if (live.length === 0) continue;
    return live;
  }
  return null;
}

/** The next forced placement the recording solver makes whose cell is still empty
 * — a cube collapse the working notes lag (a naked, hidden or otherwise forced
 * single). Returned whole so the caller can read its (possibly game-specific,
 * e.g. killer-cage) reason or re-derive the *why* from the working board. */
export function nextPlace<R extends DeductionRecord>(
  ops: readonly R[],
  grid: ArrayLike<number>,
  w: number,
): R | null {
  for (const op of ops) {
    if (op.kind === "place" && grid[op.y * w + op.x] === 0) return op;
  }
  return null;
}

/** One firing of the basic-region cleanup: a placed (or given) value `n` at
 * `(px, py)` and every stray pencil copy of it still live across that cell's
 * uniqueness regions. */
export interface RegionDuplicate {
  px: number;
  py: number;
  n: number;
  marks: Mark[];
}

/** The pencil marks the value `n` at `(x, y)` rules out by region uniqueness: every
 * still-empty cell of any of `regions` that still notes `n`, de-duplicated (a cell
 * may lie in two of the cell's regions — e.g. a row and a diagonal in Solo X). The
 * single source of truth for "what a placement strikes," shared by the placement
 * dup-cull and {@link findRegionDuplicate}. `regions` are the cell's uniqueness
 * regions (from the game's `regionsOf`); `w` converts a region's `y*w+x` cell
 * index back to coordinates for the {@link Mark}. The home cell `(x, y)` is never
 * marked. */
export function regionDuplicateMarks(
  grid: ArrayLike<number>,
  pencil: ArrayLike<number>,
  x: number,
  y: number,
  n: number,
  w: number,
  regions: readonly ClassifyRegion[],
): Mark[] {
  const home = y * w + x;
  const bit = 1 << n;
  const seen = new Set<number>();
  const marks: Mark[] = [];
  for (const region of regions) {
    for (let i = 0; i < region.cells.length; i++) {
      const j = region.cells[i];
      if (j === home || seen.has(j)) continue;
      if (grid[j] === 0 && (pencil[j] & bit) !== 0) {
        seen.add(j);
        marks.push({ x: j % w, y: (j / w) | 0, n });
      }
    }
  }
  return marks;
}

/** The next basic-region cleanup: the first filled cell (in grid order) whose value
 * still appears as a live pencil mark in one of its uniqueness regions. Generalises
 * the per-game `basicLatinStrike` (row+col) / `basicRegionStrike`
 * (row+col+block+diag) to a single scan over `regionsOf` — the basic-region opening
 * a given or auto-pencil-off placement leaves behind (hint-authoring §9.2). Returns
 * one firing (one placed value and every stray copy of it), or `null`.
 * `regionsOf(x, y)` returns the uniqueness regions of the cell at `(x, y)`. */
export function findRegionDuplicate(
  grid: ArrayLike<number>,
  pencil: ArrayLike<number>,
  w: number,
  regionsOf: (x: number, y: number) => readonly ClassifyRegion[],
): RegionDuplicate | null {
  for (let i = 0; i < w * w; i++) {
    const v = grid[i];
    if (v === 0) continue;
    const px = i % w;
    const py = (i / w) | 0;
    const marks = regionDuplicateMarks(grid, pencil, px, py, v, w, regionsOf(px, py));
    if (marks.length > 0) return { px, py, n: v, marks };
  }
  return null;
}

/** The whole-board "obvious candidate" strikes for the adaptive mark-all cleanup:
 * for every empty cell, each pencilled value that already sits as a *placed* value
 * in one of that cell's uniqueness regions (per `regionsOf`). "Obvious" is always
 * judged against a placed value, never another pencil mark, so the result is a pure
 * function of the placed grid and pressing repeatedly converges (design D2).
 *
 * Mistaken-board guard: never strike a cell's *last* surviving note. If every note
 * of a cell is region-eliminated — only possible on an already-wrong board — one
 * note is kept, so no cell becomes note-less and the cleanup stays idempotent (a
 * note-less cell would re-fill on the next press, reintroducing oscillation). */
export function obviousCandidateMarks(
  grid: ArrayLike<number>,
  pencil: ArrayLike<number>,
  w: number,
  regionsOf: (x: number, y: number) => readonly ClassifyRegion[],
): Mark[] {
  const marks: Mark[] = [];
  for (let i = 0; i < w * w; i++) {
    if (grid[i] !== 0) continue;
    const notes = pencil[i];
    if (notes === 0) continue;
    const x = i % w;
    const y = (i / w) | 0;
    let placed = 0;
    for (const region of regionsOf(x, y)) {
      for (let k = 0; k < region.cells.length; k++) {
        const v = grid[region.cells[k]];
        if (v !== 0) placed |= 1 << v;
      }
    }
    let removable = notes & placed;
    if (removable === 0) continue;
    // Guard: if striking all "obvious" notes would empty the cell, keep its lowest
    // note (clearing the lowest bit of `removable` leaves that candidate unstruck).
    if ((notes & ~removable) === 0) {
      removable &= removable - 1;
      if (removable === 0) continue;
    }
    for (let n = 1; n <= w; n++) if (removable & (1 << n)) marks.push({ x, y, n });
  }
  return marks;
}

/** The adaptive mark-all move (design: fill, then clean obvious). If any empty cell
 * has *zero* notes, fill every note-less empty cell with all candidates
 * (`pencilAll` — today's behaviour); otherwise strike each cell's
 * {@link obviousCandidateMarks} as one atomic `pencilStrike` (marks baked here, at
 * `interpretMove` time, for deterministic replay). Returns `null` when the board is
 * already fully cleaned (no fill needed, nothing left to strike) so the press is a
 * true no-op and adds no undo entry. Typed as the game's move union `M` (the
 * `pencilAll` / `pencilStrike` variants are members of every such game's `Move`). */
export function adaptiveMarkAllMove<M>(
  grid: ArrayLike<number>,
  pencil: ArrayLike<number>,
  w: number,
  regionsOf: (x: number, y: number) => readonly ClassifyRegion[],
): M | null {
  if (anyEmptyLacksNotes(grid, pencil, w)) {
    return { type: "pencilAll" } as unknown as M;
  }
  const marks = obviousCandidateMarks(grid, pencil, w, regionsOf);
  if (marks.length === 0) return null;
  return { type: "pencilStrike", marks } as unknown as M;
}

/** A freshly-built pencil-strike move, typed as the game's move union `M`. The
 * `pencilStrike` variant is a member of every candidate-elimination game's
 * `Move`; TypeScript can't express that lower bound on a generic, so the
 * construction is asserted here, in one place, rather than at every call site. */
function strikeMove<M>(marks: Mark[]): M {
  return { type: "pencilStrike", marks } as unknown as M;
}

/** Classify a player move against the displayed hint step (the engine's
 * keep-track contract). A `pencilAll` matches a populate step; a real placement
 * matches a `set` step; a pencil toggle that *clears* one of a strike step's
 * marks shrinks it (`onTrack`, mutating the step in place so a later auto-hint
 * strikes only the rest) or finishes it (`completed`); anything else drops the
 * plan (`off`). `state` is the PRE-move board.
 *
 * Generic over the game's move `M`: `m`/`step.move` are read structurally as
 * {@link CandidateMove} (non-candidate moves fall through to `off`), and a shrunk
 * step's new move is rebuilt via {@link strikeMove}. The highlights are the
 * concrete {@link CandidateHighlights} every such game shares; a game's
 * `HintStep<Move, GameHint>` is accepted because `GameHint` is structurally
 * `CandidateHighlights`. */
export function keepCandidateHintTrack<M extends { type: string }>(
  m: M,
  step: HintStep<M, CandidateHighlights>,
  pencil: ArrayLike<number>,
  w: number,
): HintTrackVerdict {
  const pm = m as unknown as CandidateMove;
  const sm = step.move as unknown as CandidateMove;
  if (sm.type === "pencilAll") return pm.type === "pencilAll" ? "completed" : "off";
  if (sm.type === "set") {
    return pm.type === "set" &&
      !pm.pencil &&
      pm.x === sm.x &&
      pm.y === sm.y &&
      pm.n === sm.n
      ? "completed"
      : "off";
  }
  if (sm.type === "pencilStrike") {
    // The player strikes a candidate with a pencil toggle (`set { pencil }`).
    if (pm.type !== "set" || !pm.pencil) return "off";
    const hit = sm.marks.findIndex((k) => k.x === pm.x && k.y === pm.y && k.n === pm.n);
    if (hit < 0) return "off"; // touched a non-target candidate
    // A pencil toggle clears the candidate iff it is present now; if it is already
    // absent the toggle would *re-add* it — off-plan. (The candidate being present
    // is exactly what makes the strike the right move to follow.)
    if (!(pencil[pm.y * w + pm.x] & (1 << pm.n))) return "off";
    const remaining = sm.marks.filter((_, j) => j !== hit);
    if (remaining.length === 0) return "completed";
    step.move = strikeMove<M>(remaining);
    if (step.highlights) {
      step.highlights = {
        ...step.highlights,
        targets: remaining.map((k) => ({ x: k.x, y: k.y })),
        marks: remaining,
      };
    }
    return "onTrack";
  }
  return "off";
}

/** Re-validate a stored hint step against the current board before it is
 * (re-)displayed (the engine's "never show a stale step" guarantee). The way a
 * kept plan goes stale is auto-pencil: turning it on silently strikes a placed
 * value from its row/column/region, so a later stored `pencilStrike` may name
 * notes already gone. Drop dead marks; if none survive the step is resolved
 * (return `null` → the midend skips it). A placement step is resolved once its
 * cell is filled; a populate step once every empty cell already has notes.
 *
 * Generic over the game's move `M` (see {@link keepCandidateHintTrack}). */
export function refreshCandidateHintStep<M extends { type: string }>(
  step: HintStep<M, CandidateHighlights>,
  grid: ArrayLike<number>,
  pencil: ArrayLike<number>,
  w: number,
): HintStep<M, CandidateHighlights> | null {
  const m = step.move as unknown as CandidateMove;
  if (m.type === "pencilStrike") {
    const live = m.marks.filter(
      ({ x, y, n }) => grid[y * w + x] === 0 && (pencil[y * w + x] & (1 << n)) !== 0,
    );
    if (live.length === 0) return null;
    if (live.length === m.marks.length) return step;
    return {
      ...step,
      move: strikeMove<M>(live),
      highlights: step.highlights
        ? {
            ...step.highlights,
            targets: live.map((k) => ({ x: k.x, y: k.y })),
            marks: live,
          }
        : undefined,
    };
  }
  if (m.type === "set" && !m.pencil) {
    // A placement step is resolved once its cell is filled (by the player
    // following it, or any other move). A wrong fill makes the board mistaken and
    // the next recompute will refuse — advancing past it is harmless.
    return grid[m.y * w + m.x] !== 0 ? null : step;
  }
  if (m.type === "pencilAll") {
    // The populate step is resolved once every empty cell already has notes.
    return anyEmptyLacksNotes(grid, pencil, w) ? step : null;
  }
  return step;
}
