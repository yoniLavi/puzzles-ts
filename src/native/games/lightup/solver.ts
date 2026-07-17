/**
 * Light Up solver — faithful port of the solver half of `lightup.c`
 * (`try_solve_light` / `try_solve_number` / the overlapping-set discount
 * machinery / `solve_sub` / `dosolve`).
 *
 * The generator is solver-gated twice over (`puzzle_is_good` decides both
 * which grids are accepted and which clue numbers strip), so byte-match
 * with the C reference requires this solver to reach C's exact verdict on
 * every intermediate board — including its scan orders, its first-wins
 * tie-breaks, and its restart-after-first-discount control flow. Deviate
 * from the C shape here only with a differential run to prove it.
 */
import { Combi } from "../../combi/index.ts";
import { stepBudget } from "../../engine/step-budget.ts";
import {
  cloneState,
  F_BLACK,
  F_IMPOSSIBLE,
  F_LIGHT,
  F_NUMBERED,
  F_NUMBERUSED,
  getSurrounds,
  gridCorrect,
  gridOverlap,
  idx,
  type LightupState,
  litCells,
  setLight,
} from "./state.ts";

// --- solver flags (upstream values) -----------------------------------------

export const F_SOLVE_FORCEUNIQUE = 1;
export const F_SOLVE_DISCOUNTSETS = 2;
export const F_SOLVE_ALLOWRECURSE = 4;

export function flagsFromDifficulty(difficulty: number): number {
  let sflags = F_SOLVE_FORCEUNIQUE;
  if (difficulty >= 1) sflags |= F_SOLVE_DISCOUNTSETS;
  if (difficulty >= 2) sflags |= F_SOLVE_ALLOWRECURSE;
  return sflags;
}

const MAXRECURSE = 5;

// --- hint recording -----------------------------------------------------------
//
// The hint plan is the solver's own deduction script, so a recorder is
// threaded through the deduction functions and gated on presence: with no
// recorder every function runs byte-for-byte as before (the generator's
// byte-match differential is the regression guard); with one, each firing
// is reported with the cells it forces and the premise to narrate.

export interface HintCell {
  x: number;
  y: number;
}

/** The premise of one deduction firing — what the hint narrates/highlights. */
export type LightupHintReason =
  | {
      /** An unlit square with exactly one remaining way to be lit. */
      kind: "forcedLight";
      /** The square in the dark. */
      dark: HintCell;
      /** Its whole line of sight (every square that could light it). */
      corridor: HintCell[];
    }
  | {
      /** A clue with all its bulbs placed rules out its free neighbours. */
      kind: "clueSatisfied";
      clue: HintCell;
      n: number;
      /** The clue's placed bulbs (the premise). */
      bulbs: HintCell[];
    }
  | {
      /** A clue with as many bulbs left to place as free neighbours. */
      kind: "clueSaturated";
      clue: HintCell;
      n: number;
      /** Bulbs still to place (= the number of free neighbours). */
      need: number;
    }
  | {
      /** Overlapping-set discount seeded by an unlit square: a bulb at
       * the target would extinguish every way to light `dark`. */
      kind: "discountUnlit";
      dark: HintCell;
      set: HintCell[];
    }
  | {
      /** Overlapping-set discount seeded by a clue: at least one of
       * `set` must be a bulb, and a bulb at the target rules them all out. */
      kind: "discountClue";
      clue: HintCell;
      n: number;
      set: HintCell[];
    };

/** One recorded firing: the mark it places and every cell it places it
 * on (one firing = one grouped hint step). */
export interface LightupFiring {
  kind: "light" | "impossible";
  cells: HintCell[];
  reason: LightupHintReason;
  /** Working-board snapshot with this firing (and all before it)
   * applied — highlights are computed against it, not the start board,
   * so they stay truthful as the player follows the plan. */
  flags: Uint8Array;
  lights: Int16Array;
}

/** Called once per firing, after its marks are applied to the state. */
export type LightupRecorder = (
  kind: "light" | "impossible",
  cells: HintCell[],
  reason: LightupHintReason,
) => void;

/** The discount seed, threaded to the mark site for the reason payload. */
type DiscountSource =
  | { kind: "unlit"; dark: HintCell }
  | { kind: "clue"; clue: HintCell; n: number };

// --- basic deductions ---------------------------------------------------------

export function couldPlaceLight(flags: number, lights: number): boolean {
  if (flags & (F_BLACK | F_IMPOSSIBLE)) return false;
  return !(lights > 0);
}

function couldPlaceLightXy(state: LightupState, x: number, y: number): boolean {
  const i = idx(x, y, state.w);
  return couldPlaceLight(state.flags[i], state.lights[i]);
}

/** An unlit square with exactly one remaining way to be lit forces a bulb
 * there (the square itself counts as one of the ways). */
function trySolveLight(
  state: LightupState,
  ox: number,
  oy: number,
  flags: number,
  lights: number,
  rec?: LightupRecorder,
): boolean {
  if (lights > 0) return false;
  if (flags & F_BLACK) return false;

  // Count the squares that could hold a bulb lighting us (including this
  // square); the squares that could light us are exactly the squares we
  // would light.
  let sx = 0;
  let sy = 0;
  let n = 0;
  for (const { x, y } of litCells(state, ox, oy, true)) {
    const i = idx(x, y, state.w);
    if (state.flags[i] & F_IMPOSSIBLE) continue;
    if (state.lights[i] > 0) continue;
    sx = x;
    sy = y;
    n++;
  }
  if (n === 1) {
    setLight(state, sx, sy, true);
    if (rec) {
      rec("light", [{ x: sx, y: sy }], {
        kind: "forcedLight",
        dark: { x: ox, y: oy },
        corridor: [...litCells(state, ox, oy, true)],
      });
    }
    return true;
  }
  return false;
}

/** A clue with enough info places all its bulbs (or marks all remaining
 * neighbours impossible). Sets F_NUMBERUSED when it acts. */
function trySolveNumber(
  state: LightupState,
  nx: number,
  ny: number,
  nflags: number,
  nlights: number,
  rec?: LightupRecorder,
): boolean {
  if (!(nflags & F_NUMBERED)) return false;
  const { w, h } = state;
  let nl = nlights;
  const points = getSurrounds(w, h, nx, ny).map((pt) => ({ ...pt, mark: false }));
  let ns = points.length;

  // nl is the number of bulbs still to place, ns the number of spaces left
  // to place them in; narrow both and mark the points to ignore.
  for (const pt of points) {
    const i = idx(pt.x, pt.y, w);
    if (state.flags[i] & F_LIGHT) {
      nl--;
      ns--;
      pt.mark = true;
    } else if (!couldPlaceLight(state.flags[i], state.lights[i])) {
      ns--;
      pt.mark = true;
    }
  }
  if (ns === 0) return false; // nowhere to put anything
  let ret = false;
  if (nl === 0) {
    // All bulbs this clue needs are placed; the remaining surrounds are
    // impossible.
    state.flags[idx(nx, ny, w)] |= F_NUMBERUSED;
    const targets: HintCell[] = [];
    for (const pt of points) {
      if (!pt.mark) {
        state.flags[idx(pt.x, pt.y, w)] |= F_IMPOSSIBLE;
        ret = true;
        if (rec) targets.push({ x: pt.x, y: pt.y });
      }
    }
    if (rec && targets.length > 0) {
      rec("impossible", targets, {
        kind: "clueSatisfied",
        clue: { x: nx, y: ny },
        n: nlights,
        bulbs: points
          .filter((pt) => state.flags[idx(pt.x, pt.y, w)] & F_LIGHT)
          .map((pt) => ({ x: pt.x, y: pt.y })),
      });
    }
  } else if (nl === ns) {
    // As many bulbs to place as spaces left; fill them all.
    state.flags[idx(nx, ny, w)] |= F_NUMBERUSED;
    const targets: HintCell[] = [];
    for (const pt of points) {
      if (!pt.mark) {
        setLight(state, pt.x, pt.y, true);
        ret = true;
        if (rec) targets.push({ x: pt.x, y: pt.y });
      }
    }
    if (rec && targets.length > 0) {
      rec("light", targets, {
        kind: "clueSaturated",
        clue: { x: nx, y: ny },
        n: nlights,
        need: nl,
      });
    }
  }
  return ret;
}

// --- overlapping-set discount (tricky difficulty) --------------------------------
//
// Upstream's "new solver algorithm": a MAKESLIGHT set (from an unlit square
// or a clue combination) is a set of squares of which at least one must be
// a bulb; any candidate square whose placement would rule out *every*
// member of such a set can itself be marked impossible. See the long
// comment block above `discount_set` in lightup.c for the full derivation.

interface Scratch {
  x: number;
  y: number;
  n: number;
}

/**
 * Enumerate every square that would rule out a bulb at (x, y): anything
 * that would light it, plus any empty neighbour of an adjacent clue that
 * has exactly one bulb left to place. Calls `cb` once per square, in
 * upstream order (the counts and tie-breaks downstream depend on it).
 */
function tryRuleOut(
  state: LightupState,
  x: number,
  y: number,
  cb: (dx: number, dy: number) => void,
): void {
  const { w, h } = state;
  for (const pt of litCells(state, x, y, false)) {
    if (couldPlaceLightXy(state, pt.x, pt.y)) cb(pt.x, pt.y);
  }

  for (const pt of getSurrounds(w, h, x, y)) {
    if (!(state.flags[idx(pt.x, pt.y, w)] & F_NUMBERED)) continue;
    // An adjacent clue square: count the bulbs it still needs.
    const around = getSurrounds(w, h, pt.x, pt.y);
    let currLights = 0;
    for (const q of around) {
      if (state.flags[idx(q.x, q.y, w)] & F_LIGHT) currLights++;
    }
    const totLights = state.lights[idx(pt.x, pt.y, w)];
    // If a bulb at (x, y) would fill the clue up, every other unlit
    // square around that clue would be discounted.
    if (currLights + 1 === totLights) {
      for (const q of around) {
        if (q.x === x && q.y === y) continue;
        if (couldPlaceLightXy(state, q.x, q.y)) cb(q.x, q.y);
      }
    }
  }
}

/** Given a MAKESLIGHT set in `scratch`, find candidate squares that rule
 * out the whole set and mark them impossible. Returns whether any were.
 * On the recording path each discounted square is its own firing (the
 * candidate check runs per square, so each is a separate deduction). */
function discountSet(
  state: LightupState,
  scratch: Scratch[],
  rec?: LightupRecorder,
  source?: DiscountSource,
): boolean {
  const n = scratch.length;
  if (n === 0) return false;

  // Count, for each set member, how many squares would rule it out.
  for (const s of scratch) {
    tryRuleOut(state, s.x, s.y, () => {
      s.n++;
    });
  }

  // The member with the fewest rule-out squares (first wins ties) gives
  // the smallest candidate list to check.
  const SCRATCHSZ = state.w + state.h;
  let besti = -1;
  let bestn = SCRATCHSZ;
  for (let i = 0; i < n; i++) {
    if (scratch[i].n < bestn) {
      bestn = scratch[i].n;
      besti = i;
    }
  }
  if (besti < 0) throw new Error("lightup discountSet: no best square");

  // For each square that rules out the best member, check whether it
  // rules out every member; if so it cannot be a bulb.
  let didsth = false;
  tryRuleOut(state, scratch[besti].x, scratch[besti].y, (dx, dy) => {
    if (state.flags[idx(dx, dy, state.w)] & F_IMPOSSIBLE) return;
    for (const s of scratch) s.n = 0;
    tryRuleOut(state, dx, dy, (ex, ey) => {
      for (const s of scratch) {
        if (s.x === ex && s.y === ey) {
          s.n = 1;
          return;
        }
      }
    });
    for (const s of scratch) {
      if (s.n === 0) return;
    }
    // This candidate ruled out everything in the set.
    state.flags[idx(dx, dy, state.w)] |= F_IMPOSSIBLE;
    didsth = true;
    if (rec && source) {
      const set = scratch.map((sc) => ({ x: sc.x, y: sc.y }));
      rec(
        "impossible",
        [{ x: dx, y: dy }],
        source.kind === "unlit"
          ? { kind: "discountUnlit", dark: source.dark, set }
          : { kind: "discountClue", clue: source.clue, n: source.n, set },
      );
    }
  });
  return didsth;
}

/** MAKESLIGHT set from an unlit square: everywhere a bulb could sit that
 * would light it. */
function discountUnlit(
  state: LightupState,
  x: number,
  y: number,
  rec?: LightupRecorder,
): boolean {
  const scratch: Scratch[] = [];
  for (const pt of litCells(state, x, y, true)) {
    if (couldPlaceLightXy(state, pt.x, pt.y)) {
      scratch.push({ x: pt.x, y: pt.y, n: 0 });
    }
  }
  return discountSet(state, scratch, rec, rec && { kind: "unlit", dark: { x, y } });
}

/**
 * MAKESLIGHT sets from a clue square: with n free neighbours needing m
 * more bulbs, every (n−m+1)-subset of the free neighbours must contain a
 * bulb. All subsets are tried (no early exit), as upstream.
 */
function discountClue(
  state: LightupState,
  x: number,
  y: number,
  rec?: LightupRecorder,
): boolean {
  const { w, h } = state;
  const clue = state.lights[idx(x, y, w)];
  let m = clue;
  if (m === 0) return false;

  const sempty: { x: number; y: number }[] = [];
  for (const pt of getSurrounds(w, h, x, y)) {
    const i = idx(pt.x, pt.y, w);
    if (state.flags[i] & F_LIGHT) m--;
    if (couldPlaceLight(state.flags[i], state.lights[i])) sempty.push(pt);
  }
  const n = sempty.length;
  if (n === 0) return false; // clue is full already
  if (m < 0 || m > n) return false; // become impossible

  let didsth = false;
  const source: DiscountSource | undefined = rec && {
    kind: "clue",
    clue: { x, y },
    n: clue,
  };
  const combi = new Combi(n - m + 1, n);
  while (combi.next()) {
    const scratch: Scratch[] = combi.a.map((j) => ({ ...sempty[j], n: 0 }));
    if (discountSet(state, scratch, rec, source)) didsth = true;
  }
  return didsth;
}

// --- the solve loop -----------------------------------------------------------------

/** Mutable max-recursion-depth tracker (upstream's `int *maxdepth`). */
export interface DepthTracker {
  value: number;
}

function solveSub(
  state: LightupState,
  solveFlags: number,
  depth: number,
  maxdepth: DepthTracker | null,
  rec?: LightupRecorder,
): number {
  if (maxdepth && maxdepth.value < depth) maxdepth.value = depth;
  const maxrecurse = solveFlags & F_SOLVE_ALLOWRECURSE ? MAXRECURSE : 0;
  const { w, h } = state;

  // Guard the hint/recording path against a non-terminating fixpoint; the
  // generator (no `rec`) runs unguarded and byte-for-byte unchanged.
  const budget = rec ? stepBudget("lightup hint") : undefined;

  for (;;) {
    budget?.tick();
    if (gridOverlap(state)) {
      // From scratch this never happens on a soluble grid; solving a
      // half-completed *incorrect* grid can reach it — no solutions.
      return 0;
    }
    if (gridCorrect(state)) return 1;

    let ncanplace = 0;
    let didstuff = false;
    // The critical timing loops, in upstream scan order (x outer).
    for (let x = 0; x < w; x++) {
      for (let y = 0; y < h; y++) {
        const i = idx(x, y, w);
        const flags = state.flags[i];
        const lights = state.lights[i];
        if (couldPlaceLight(flags, lights)) ncanplace++;
        if (trySolveLight(state, x, y, flags, lights, rec)) didstuff = true;
        if (trySolveNumber(state, x, y, flags, lights, rec)) didstuff = true;
      }
    }
    if (didstuff) continue;
    if (!ncanplace) {
      // Nowhere to put a bulb: insoluble.
      return 0;
    }

    if (solveFlags & F_SOLVE_DISCOUNTSETS) {
      // Restart the cheap loop after the FIRST successful discount
      // (upstream's `goto reduction_success`).
      outer: for (let x = 0; x < w; x++) {
        for (let y = 0; y < h; y++) {
          const i = idx(x, y, w);
          const flags = state.flags[i];
          const lights = state.lights[i];
          if (!(flags & F_BLACK) && lights === 0) {
            if (discountUnlit(state, x, y, rec)) {
              didstuff = true;
              break outer;
            }
          } else if (flags & F_NUMBERED) {
            if (discountClue(state, x, y, rec)) {
              didstuff = true;
              break outer;
            }
          }
        }
      }
    }
    if (didstuff) continue;

    // We have to guess.
    if (depth >= maxrecurse) return -1; // mustn't delve any deeper

    // Guess the candidate square that would light the most unlit squares
    // (first wins ties, in scan order).
    let bestn = 0;
    let bestx = -1;
    let besty = -1;
    for (let x = 0; x < w; x++) {
      for (let y = 0; y < h; y++) {
        const i = idx(x, y, w);
        if (!couldPlaceLight(state.flags[i], state.lights[i])) continue;
        let n = 0;
        for (const pt of litCells(state, x, y, true)) {
          if (state.lights[idx(pt.x, pt.y, w)] === 0) n++;
        }
        if (n > bestn) {
          bestn = n;
          bestx = x;
          besty = y;
        }
      }
    }
    if (bestn <= 0 || bestx < 0 || besty < 0)
      throw new Error("lightup solveSub: no guess candidate");

    // Try (bestx, besty) once as impossible (in place) and once as a bulb
    // (in a copy).
    const scopy = cloneState(state);
    state.flags[idx(bestx, besty, w)] |= F_IMPOSSIBLE;
    const selfSoluble = solveSub(state, solveFlags, depth + 1, maxdepth);

    if (!(solveFlags & F_SOLVE_FORCEUNIQUE) && selfSoluble > 0) {
      // We didn't need all solutions and just found one.
      return selfSoluble;
    }

    setLight(scopy, bestx, besty, true);
    const copySoluble = solveSub(scopy, solveFlags, depth + 1, maxdepth);

    if (solveFlags & F_SOLVE_FORCEUNIQUE && (copySoluble < 0 || selfSoluble < 0)) {
      // Wanted uniqueness but hit the recursion limit on a branch: we may
      // have missed solutions, so report "don't know".
      return -1;
    }
    if (copySoluble <= 0) return selfSoluble;
    if (selfSoluble <= 0) {
      // Only the copy solved; adopt its solved arrays (upstream memcpys
      // exactly the two arrays, not nlights).
      state.lights.set(scopy.lights);
      state.flags.set(scopy.flags);
      return copySoluble;
    }
    return copySoluble + selfSoluble;
  }
}

/**
 * Fill in the (possibly partially-complete) state as far as possible,
 * returning the number of solutions found (0 none, -1 recursion-limited
 * "don't know", ≥1 solved in place). Mutates `state`.
 */
export function dosolve(
  state: LightupState,
  solveFlags: number,
  maxdepth: DepthTracker | null = null,
  rec?: LightupRecorder,
): number {
  for (let i = 0; i < state.flags.length; i++) state.flags[i] &= ~F_NUMBERUSED;
  return solveSub(state, solveFlags, 0, maxdepth, rec);
}

/**
 * Run the deductive solver (no recursion — a guess isn't a teachable
 * step) from the player's current position, honouring their bulbs and
 * impossible-marks as constraints, and record every firing in deduction
 * order. The returned script is the hint plan's raw material; it ends
 * either with the board solved or at the point where deduction runs dry
 * (only possible on an Unreasonable board or after the player's own
 * unsound-but-not-wrong marks starve a line of deduction).
 */
export function deduceHintPlan(state: LightupState): LightupFiring[] {
  const work = cloneState(state);
  const firings: LightupFiring[] = [];
  dosolve(
    work,
    F_SOLVE_FORCEUNIQUE | F_SOLVE_DISCOUNTSETS,
    null,
    (kind, cells, reason) => {
      firings.push({
        kind,
        cells,
        reason,
        flags: work.flags.slice(),
        lights: work.lights.slice(),
      });
    },
  );
  return firings;
}

/** Remove every bulb and every impossible-mark (and the solver-scratch
 * NUMBERUSED bits), leaving just the black/numbered layout. */
export function unplaceLights(state: LightupState): void {
  for (let x = 0; x < state.w; x++) {
    for (let y = 0; y < state.h; y++) {
      const i = idx(x, y, state.w);
      if (state.flags[i] & F_LIGHT) setLight(state, x, y, false);
      state.flags[i] &= ~F_IMPOSSIBLE;
      state.flags[i] &= ~F_NUMBERUSED;
    }
  }
}

/**
 * Solve the clue layout of `state` to its unique solution, ignoring the
 * player's bulbs/marks. Returns the solved board, or null when the board
 * is not uniquely solvable within the full solver's power (hand-typed
 * descs can be ambiguous). Used by `findMistakes`.
 */
export function solveUnique(state: LightupState): LightupState | null {
  const clean = cloneState(state);
  unplaceLights(clean);
  const nsol = dosolve(
    clean,
    F_SOLVE_FORCEUNIQUE | F_SOLVE_DISCOUNTSETS | F_SOLVE_ALLOWRECURSE,
  );
  return nsol === 1 ? clean : null;
}
