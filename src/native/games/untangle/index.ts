/**
 * Untangle — native TS port of `puzzles/untangle.c` (deleted when this
 * ships). Drag the vertices of a planar graph until no two edges cross.
 *
 * Idiomatic rendering of the C reference: immutable state, a discriminated
 * `UntangleMove`, GC instead of dup/free, rational integer coordinates,
 * an exact integer crossing test (`state.ts`'s `cross`), and the topology
 * shared by reference across states. The C is the logic reference, not a
 * control-flow template.
 *
 * Notable divergences / decisions (see the change's design.md):
 *  - **No `supersede_desc`**: the public desc is edges-only and never
 *    changes; the player's dragged positions ride the serialised move
 *    log, which the midend save format already replays. (Mines remains
 *    the forcing function for `supersede_desc`.)
 *  - **Editor build excluded**: no `E` add/delete-edge moves, no text
 *    format (`canFormatAsText = false`).
 *  - **No `findMistakes`**: crossed edges drawn red ARE the mistake
 *    feedback. The `hint` (added by `add-untangle-hint`) is *unnarrated* —
 *    Untangle has no deduction to teach, so by owner-approved divergence
 *    from the Palisade quality bar the hint is a suggested move (highlight +
 *    the existing move animation), not an explained deduction. It walks the
 *    player to the known solution (`aux`) when one is available — rescaled
 *    to fill the play box, so guaranteed untangled and well-spaced — and
 *    falls back to a local crossing-reduction heuristic otherwise. See
 *    `hint.ts`.
 *  - **Preferences via the engine `prefs` hook**: snap-to-grid,
 *    show-crossed-edges (default ON), vertex-style — the first consumer
 *    of the per-game preferences hook this change adds.
 */

import type { Colour, Point, Size } from "../../../puzzle/types.ts";
import { mkhighlight } from "../../engine/colour-mkhighlight.ts";
import {
  type Game,
  registerGame,
  UI_UPDATE,
  type UiUpdate,
} from "../../engine/index.ts";
import {
  CURSOR_DOWN,
  CURSOR_LEFT,
  CURSOR_RIGHT,
  CURSOR_SELECT,
  CURSOR_SELECT2,
  CURSOR_UP,
  isCursorMove,
  LEFT_BUTTON,
  LEFT_DRAG,
  LEFT_RELEASE,
  MIDDLE_BUTTON,
  MIDDLE_DRAG,
  MIDDLE_RELEASE,
  MOD_SHFT,
  RIGHT_BUTTON,
  RIGHT_DRAG,
  RIGHT_RELEASE,
  stripModifiers,
} from "../../engine/pointer.ts";
import type { RandomState } from "../../random/index.ts";
import { newUntangleDesc } from "./generator.ts";
import { deduceUntangleHintPlan, type UntangleHint } from "./hint.ts";
import { redrawUntangle } from "./render.ts";
import {
  buildEdges,
  cloneUntangleState,
  coordLimit,
  DRAG_THRESHOLD,
  decodeGame,
  dihedralSolvedUnits,
  findCrossings,
  makeCircle,
  parseAux,
  PLAY_MARGIN,
  type RationalPoint,
  type UntangleDrawState,
  type UntangleMove,
  type UntangleParams,
  type UntangleState,
  type UntangleUi,
} from "./state.ts";

// --- constants (untangle.c) -----------------------------------------
const PREFERRED_TILESIZE = 64;
const ANIM_TIME = 0.13;
const SOLVEANIM_TIME = 0.5;
const FLASH_TIME = 0.3;
/** Tab key — upstream also accepts '\t' to cycle the cursor. */
const TAB = 9;
/** Sane upper cap on vertices (the generator allocates a COORDLIMIT(n)²
 * scratch grid). Upstream's bound is INT_MAX/3; a few thousand is plenty
 * and keeps the O(E²) crossing scan responsive. */
const MAX_POINTS = 2000;

const isMouseDown = (b: number): boolean =>
  b === LEFT_BUTTON || b === MIDDLE_BUTTON || b === RIGHT_BUTTON;
const isMouseDrag = (b: number): boolean =>
  b === LEFT_DRAG || b === MIDDLE_DRAG || b === RIGHT_DRAG;
const isMouseRelease = (b: number): boolean =>
  b === LEFT_RELEASE || b === MIDDLE_RELEASE || b === RIGHT_RELEASE;

/** Nearest vertex within `DRAG_THRESHOLD` pixels of `(x,y)`, or -1
 * (upstream `point_under_mouse`). */
function pointUnderMouse(
  s: UntangleState,
  tileSize: number,
  x: number,
  y: number,
): number {
  let best = -1;
  let bestd = 0;
  for (let i = 0; i < s.n; i++) {
    const px = Math.trunc((s.pts[i].x * tileSize) / s.pts[i].d);
    const py = Math.trunc((s.pts[i].y * tileSize) / s.pts[i].d);
    const dx = px - x;
    const dy = py - y;
    const d = dx * dx + dy * dy;
    if (best === -1 || bestd > d) {
      best = i;
      bestd = d;
    }
  }
  return bestd <= DRAG_THRESHOLD * DRAG_THRESHOLD ? best : -1;
}

/** Update `ui.newPoint` for the live drag position `(x,y)` in pixels,
 * snapping to the coarse grid when that preference is on (upstream
 * `place_dragged_point`). */
function placeDraggedPoint(
  s: UntangleState,
  ui: UntangleUi,
  tileSize: number,
  x: number,
  y: number,
): void {
  // Clamp the drag target to the playable square, keeping the vertex blob
  // fully inside the play-area border (so dragging past the edge shows the
  // vertex pinned at the nearest in-bounds position and a drop commits
  // there — a deliberate divergence from upstream's drag-off-to-cancel).
  // Then round: pointer coords can arrive fractional (sub-pixel /
  // devicePixelRatio scaling) where upstream's GUI hands integer pixels,
  // and the rational-point model / exact-integer `cross` require integers.
  // This is the single boundary where pixels enter the model.
  const size = s.w * tileSize;
  const lo = PLAY_MARGIN;
  const hi = size - PLAY_MARGIN;
  x = Math.round(Math.max(lo, Math.min(hi, x)));
  y = Math.round(Math.max(lo, Math.min(hi, y)));
  if (ui.snapToGrid) {
    const d = s.n - 1;
    const gx = Math.trunc((d * x) / (s.w * tileSize));
    const gy = Math.trunc((d * y) / (s.w * tileSize));
    ui.newPoint = { x: (gx * 2 + 1) * s.w, y: (gy * 2 + 1) * s.w, d: d * 2 };
  } else {
    ui.newPoint = { x, y, d: tileSize };
  }
}

function placeMove(i: number, p: RationalPoint): UntangleMove {
  return { kind: "place", points: [{ i, x: p.x, y: p.y, d: p.d }], solving: false };
}

export const untangleGame: Game<
  UntangleParams,
  UntangleState,
  UntangleMove,
  UntangleUi,
  UntangleDrawState
> = {
  id: "untangle",
  wantsStatusbar: false,
  isTimed: false,
  canSolve: true,
  canFormatAsText: false,
  preferredTileSize: PREFERRED_TILESIZE,

  // --- params --------------------------------------------------------
  defaultParams: () => ({ n: 10 }),
  // Key matches the `untangle` config template in augmentation.ts
  // ("{number-of-points} points"); `n` is not a w/h base param.
  describeParams: (p) => ({ "number-of-points": p.n }),
  presets: () => ({
    title: "Untangle",
    submenu: [6, 10, 15, 20, 25].map((n) => ({ title: `${n} points`, params: { n } })),
  }),
  encodeParams: (p) => `${p.n}`,
  decodeParams: (s) => {
    const n = Number.parseInt(s, 10);
    if (!Number.isFinite(n)) throw new Error(`bad untangle params "${s}"`);
    return { n };
  },
  validateParams: (p) => {
    if (!Number.isInteger(p.n) || p.n < 4)
      return "Number of points must be at least four";
    if (p.n > MAX_POINTS) return "Number of points must not be unreasonably large";
    return null;
  },

  // --- generation ----------------------------------------------------
  newDesc: (p: UntangleParams, rng: RandomState) => newUntangleDesc(p, rng),
  validateDesc: (p, desc) => {
    try {
      decodeGame(desc, p.n);
    } catch (e) {
      return (e as Error).message;
    }
    return null;
  },

  newState: (p, desc) => {
    const n = p.n;
    const w = coordLimit(n);
    const { edges, edgeSet } = buildEdges(decodeGame(desc, n), n);
    const pts = makeCircle(n, w);
    const { crosses, completed } = findCrossings(pts, edges);
    return {
      n,
      w,
      pts,
      edges,
      edgeSet,
      crosses,
      completed,
      cheated: false,
      justSolved: false,
    };
  },

  newUi: () => ({
    dragPoint: -1,
    cursorPoint: -1,
    newPoint: { x: 0, y: 0, d: 1 },
    justDragged: false,
    justMoved: false,
    animLength: ANIM_TIME,
    // Preference defaults (the divergence point — show-crossed-edges ON).
    snapToGrid: false,
    showCrossedEdges: true,
    vertexNumbers: false,
  }),

  changedState: (ui, _old, _next) => {
    // Mirror game_changed_state: end any drag, and carry "the last move
    // was a player drag" into justMoved (so it animates instantly).
    ui.dragPoint = -1;
    ui.justMoved = ui.justDragged;
    ui.justDragged = false;
  },

  // --- input ---------------------------------------------------------
  interpretMove: (
    s: UntangleState,
    ui: UntangleUi,
    ds: UntangleDrawState | null,
    pt: Point,
    button: number,
  ): UntangleMove | null | UiUpdate => {
    const n = s.n;
    const tileSize = ds?.tileSize ?? PREFERRED_TILESIZE;
    const { x, y } = pt;

    if (isMouseDown(button)) {
      const p = pointUnderMouse(s, tileSize, x, y);
      if (p >= 0) {
        ui.dragPoint = p;
        ui.cursorPoint = -1;
        placeDraggedPoint(s, ui, tileSize, x, y);
        return UI_UPDATE;
      }
      return null;
    }
    if (isMouseDrag(button) && ui.dragPoint >= 0) {
      placeDraggedPoint(s, ui, tileSize, x, y);
      return UI_UPDATE;
    }
    if (isMouseRelease(button) && ui.dragPoint >= 0) {
      const p = ui.dragPoint;
      ui.dragPoint = -1;
      ui.cursorPoint = -1;
      // The drag target was clamped into the play area, so a release always
      // commits at the nearest in-bounds position (no drag-off-to-cancel).
      ui.justDragged = true;
      return placeMove(p, ui.newPoint);
    }
    if (isMouseDrag(button) || isMouseRelease(button)) {
      return null; // drag/release with no active drag
    }

    if (isCursorMove(button)) {
      if (ui.dragPoint < 0) {
        // Select the nearest point in the quadrant of the arrow key.
        if (ui.cursorPoint < 0) ui.cursorPoint = 0;
        const cur = s.pts[ui.cursorPoint];
        let best = -1;
        let bestd = 0;
        for (let i = 0; i < n; i++) {
          if (i === ui.cursorPoint) continue;
          const p = s.pts[i];
          const dx = p.x * cur.d - cur.x * p.d;
          const dy = p.y * cur.d - cur.y * p.d;
          if (dx === 0 && dy === 0) continue; // overlaps the cursor point
          // Quadrant test (untangle.c:1479): the [-45°,+45°] cone of the
          // arrow direction, using the screen convention (y grows down).
          if (!quadrantOk(button, dx, dy)) continue;
          const dd = cur.d * p.d;
          const distsq = (dx * dx + dy * dy) / (dd * dd);
          if (best === -1 || distsq < bestd) {
            best = i;
            bestd = distsq;
          }
        }
        if (best >= 0) {
          ui.cursorPoint = best;
          return UI_UPDATE;
        }
        return null;
      }
      // Dragging a held point with the arrow keys: nudge by tileSize/2.
      const inc = Math.trunc(tileSize / 2);
      let dx = 0;
      let dy = 0;
      if (button === CURSOR_UP) dy = -inc;
      else if (button === CURSOR_DOWN) dy = inc;
      else if (button === CURSOR_LEFT) dx = -inc;
      else if (button === CURSOR_RIGHT) dx = inc;
      placeDraggedPoint(
        s,
        ui,
        tileSize,
        Math.trunc((ui.newPoint.x * tileSize) / ui.newPoint.d) + dx,
        Math.trunc((ui.newPoint.y * tileSize) / ui.newPoint.d) + dy,
      );
      return UI_UPDATE;
    }

    if (button === CURSOR_SELECT) {
      if (ui.dragPoint < 0 && ui.cursorPoint >= 0) {
        // Begin a keyboard drag of the highlighted point.
        ui.dragPoint = ui.cursorPoint;
        ui.cursorPoint = -1;
        const p = s.pts[ui.dragPoint];
        ui.newPoint = {
          x: Math.trunc((p.x * tileSize) / p.d),
          y: Math.trunc((p.y * tileSize) / p.d),
          d: tileSize,
        };
        return UI_UPDATE;
      }
      if (ui.dragPoint >= 0) {
        // End the keyboard drag (always commits — newPoint is clamped in).
        const p = ui.dragPoint;
        ui.cursorPoint = ui.dragPoint;
        ui.dragPoint = -1;
        ui.justDragged = true;
        return placeMove(p, ui.newPoint);
      }
      if (ui.cursorPoint < 0) {
        ui.cursorPoint = 0;
        return UI_UPDATE;
      }
      return null;
    }

    const base = stripModifiers(button);
    if (base === CURSOR_SELECT2 || base === TAB) {
      // Cycle the cursor through the points (Shift reverses).
      if (ui.dragPoint >= 0) return null;
      if (ui.cursorPoint < 0) {
        ui.cursorPoint = 0;
        return UI_UPDATE;
      }
      const dir = button & MOD_SHFT ? -1 : 1;
      ui.cursorPoint = (ui.cursorPoint + dir + n) % n;
      return UI_UPDATE;
    }

    return null;
  },

  executeMove: (s, m) => {
    const ns = cloneUntangleState(s);
    ns.justSolved = false;
    if (m.solving) {
      ns.cheated = true;
      ns.justSolved = true;
    }
    for (const p of m.points) {
      // The integer invariant of `RationalPoint` is enforced here, at the
      // single chokepoint where every move (drag, solve, replay, load)
      // becomes state. The exact-integer `cross()` (BigInt accumulator)
      // depends on it; a non-integer slipping through any input path would
      // otherwise surface as a cryptic `BigInt` RangeError deep inside
      // `findCrossings`. Fail loudly and locally instead.
      if (
        !Number.isInteger(p.i) ||
        !Number.isInteger(p.x) ||
        !Number.isInteger(p.y) ||
        !Number.isInteger(p.d) ||
        p.d <= 0 ||
        p.i < 0 ||
        p.i >= s.n
      ) {
        throw new Error(
          `untangle executeMove: bad point ${JSON.stringify(p)} (i in [0,${s.n}), d>0, all integral)`,
        );
      }
      ns.pts[p.i] = { x: p.x, y: p.y, d: p.d };
    }
    const { crosses, completed } = findCrossings(ns.pts, ns.edges);
    ns.crosses = crosses;
    ns.completed = completed;
    return ns;
  },

  status: (s) => (s.completed ? "solved" : "ongoing"),

  // --- hint (aux solution when known, else heuristic; see hint.ts) ---
  hint: (s, aux) => deduceUntangleHintPlan(s, aux),

  // --- solve (decode aux, pick the closest of 8 dihedral symmetries) -
  solve: (orig, curr, aux) => {
    const auxPts = parseAux(aux, orig.n);
    if (auxPts === null) {
      return aux
        ? { ok: false, error: "Internal error: aux_info badly formatted" }
        : { ok: false, error: "Solution not known for this puzzle" };
    }
    // Quantise the dihedral-matched model-unit solution to the d=2 grid
    // upstream's solve emits.
    const points = dihedralSolvedUnits(curr, auxPts).map((p, i) => ({
      i,
      x: Math.floor(p.x * 2 + 0.5),
      y: Math.floor(p.y * 2 + 0.5),
      d: 2,
    }));
    return { ok: true, move: { kind: "place", points, solving: true } };
  },

  // --- timing --------------------------------------------------------
  animLength: (a, b, dir, ui) => {
    if (ui.justMoved) {
      ui.animLength = 0;
      return 0;
    }
    const len = (dir < 0 ? a : b).justSolved ? SOLVEANIM_TIME : ANIM_TIME;
    ui.animLength = len;
    return len;
  },
  flashLength: (a, b) =>
    !a.completed && b.completed && !a.cheated && !b.cheated ? FLASH_TIME : 0,

  // --- preferences (the engine prefs hook; first consumer) -----------
  prefs: [
    {
      kw: "snap-to-grid",
      name: "Snap points to a grid",
      type: "boolean",
      get: (ui) => ui.snapToGrid,
      set: (ui, v) => {
        ui.snapToGrid = v;
      },
    },
    {
      kw: "show-crossed-edges",
      name: "Show edges that cross another edge",
      type: "boolean",
      get: (ui) => ui.showCrossedEdges,
      set: (ui, v) => {
        ui.showCrossedEdges = v;
      },
    },
    {
      kw: "vertex-style",
      name: "Display style for vertices",
      type: "choices",
      choices: ["Circles", "Numbers"],
      get: (ui) => (ui.vertexNumbers ? 1 : 0),
      set: (ui, v) => {
        ui.vertexNumbers = v === 1;
      },
    },
  ],

  // --- rendering -----------------------------------------------------
  colours: (defaultBackground: Colour): Colour[] => {
    const { background, lowlight } = mkhighlight(defaultBackground);
    // Index-for-index with the upstream COL_* enum (untangle.c:57).
    return [
      lowlight, // 0 COL_SYSBACKGROUND (dead space, darker)
      background, // 1 COL_BACKGROUND (play area)
      [0, 0, 0], // 2 COL_LINE
      [1, 0, 0], // 3 COL_CROSSEDLINE
      [0, 0, 0], // 4 COL_OUTLINE
      [0, 0, 1], // 5 COL_POINT
      [1, 1, 1], // 6 COL_DRAGPOINT
      [0.5, 0.5, 0.5], // 7 COL_CURSORPOINT
      // 8 COL_NEIGHBOUR — neighbours of the dragged vertex. Light blue
      // (not the upstream red) so it doesn't read as "danger"/error,
      // which red is reserved for here (crossed edges).
      [0.45, 0.7, 1], // 8 COL_NEIGHBOUR
      [0.5, 0.5, 0.5], // 9 COL_FLASH1
      [1, 1, 1], // 10 COL_FLASH2
      // 11 COL_HINT — the suggested move (line + destination marker).
      // Orange: distinct from blue points, light-blue neighbours, and the
      // red crossed edges.
      [1, 0.55, 0], // 11 COL_HINT
    ];
  },
  computeSize: (p: UntangleParams, tileSize: number): Size => {
    const s = coordLimit(p.n) * tileSize;
    return { w: s, h: s };
  },
  setTileSize: (ds, tileSize) => {
    ds.tileSize = tileSize;
  },
  newDrawState: (s): UntangleDrawState => ({
    started: false,
    tileSize: PREFERRED_TILESIZE,
    bg: -1,
    dragPoint: -1,
    cursorPoint: -1,
    hintVertex: -1,
    hintTx: -1,
    hintTy: -1,
    x: new Array<number>(s.n).fill(-1),
    y: new Array<number>(s.n).fill(-1),
  }),
  redraw: (dr, ds, prev, s, _dir, ui, animTime, flashTime, hint) => {
    redrawUntangle(
      dr,
      ds,
      prev,
      s,
      ui,
      animTime,
      flashTime,
      hint?.highlights as UntangleHint | undefined,
    );
  },
};

/** The quadrant test from untangle.c:1479 — is the vector (dx,dy) within
 * the ±45° cone of the arrow `button`'s direction? Screen convention: y
 * grows downward, so CURSOR_UP wants the most-negative-y cone. */
function quadrantOk(button: number, dx: number, dy: number): boolean {
  switch (button) {
    case CURSOR_UP:
      return dy <= -dx && dy <= dx;
    case CURSOR_DOWN:
      return dy >= -dx && dy >= dx;
    case CURSOR_LEFT:
      return dy >= dx && dy <= -dx;
    case CURSOR_RIGHT:
      return dy <= dx && dy >= -dx;
    default:
      return false;
  }
}

registerGame(untangleGame);
