/**
 * Mines (Minesweeper) — native TS port of `puzzles/mines.c`.
 *
 * Mines is the collection's exemplar of desc supersession
 * (`Game.supersededDesc`): it generates its mine layout on the *first click*,
 * so the desc the player starts from names no layout at all, and must be
 * replaced once the real board exists. It also runs a live timer (`isTimed`).
 */

import { assertNever } from "../../engine/assert-never.ts";
import {
  BLACK,
  BLUE,
  BLUE_BOLD,
  GRAY,
  GREEN,
  PINK,
  RED,
  RED_BOLD,
  TEAL,
} from "../../engine/color/colors.ts";
import { ERROR, ERROR_WASH, INK, PAPER } from "../../engine/color/palette.ts";
import { minesLowlight, minesUnclearedFace } from "../../engine/color/palette-games.ts";
import { fromCoord } from "../../engine/geometry.ts";
import {
  type Game,
  registerGame,
  type SolveResult,
  type SupersededDesc,
  UI_UPDATE,
  type UiUpdate,
} from "../../engine/index.ts";
import { dimensionParamConfig, parseConfigInt } from "../../engine/params.ts";
import {
  CURSOR_SELECT,
  CURSOR_SELECT2,
  isCursorMove,
  LEFT_BUTTON,
  LEFT_DRAG,
  LEFT_RELEASE,
  MIDDLE_BUTTON,
  MIDDLE_DRAG,
  MIDDLE_RELEASE,
  moveCursor,
  newCursor,
  RIGHT_BUTTON,
} from "../../engine/pointer.ts";
import {
  type RandomState,
  randomStateEncode,
  randomUpto,
} from "../../engine/random/index.ts";
import type { Color, ConfigValues, GameStatus, Point } from "../../engine/types.ts";
import { minegen } from "./generator.ts";
import {
  borderFor,
  COL_1,
  COL_2,
  COL_3,
  COL_4,
  COL_5,
  COL_6,
  COL_7,
  COL_8,
  COL_BACKGROUND,
  COL_BACKGROUND2,
  COL_BANG,
  COL_CROSS,
  COL_CURSOR,
  COL_FLAG,
  COL_FLAGBASE,
  COL_HIGHLIGHT,
  COL_LOWLIGHT,
  COL_MINE,
  COL_QUERY,
  COL_WRONGNUMBER,
  computeSize,
  FLASH_FRAME,
  type MinesDrawState,
  NCOLORS,
  newDrawState,
  PREFERRED_TILE_SIZE,
  redraw,
  setTileSize,
} from "./render.ts";
import {
  around,
  COVERED,
  cloneState,
  decodeDesc,
  decodeParams,
  decodeUi,
  defaultParams,
  encodeLayoutHex,
  encodeParams,
  encodeUi,
  FLAG,
  KILLED,
  MINE,
  type MineOp,
  type MinesMove,
  type MinesParams,
  type MinesState,
  type MinesUi,
  QUERY,
  TODO,
  validateDesc,
  validateParams,
  WRONGFLAG,
} from "./state.ts";

// --- the flood-open + first-click layout generation (open_square) ------

/**
 * Open square (x, y), generating the mine layout on the first click if it does
 * not yet exist (upstream `open_square`, mines.c:2135). Mutates `state` (a
 * fresh clone from `executeMove`) and, on the first click only, the *shared*
 * {@link MinesState.layout} box.
 */
function openSquare(state: MinesState, x: number, y: number): void {
  const { w, h, grid, layout } = state;

  if (!layout.mines) {
    // The single deliberate mutation of a shared object. The layout memoizes a
    // deterministic function of the desc's RNG state and this click, so
    // replaying the move log reproduces it exactly. The engine then pulls the
    // new desc from `supersededDesc`; the game never pushes into the midend.
    layout.mines = minegen(
      w,
      h,
      layout.n,
      x,
      y,
      layout.unique,
      layout.rs as RandomState,
    );
    layout.startx = x;
    layout.starty = y;
    layout.rs = null;
  }
  const mines = layout.mines;

  // Record the first click on the *state* whether or not the layout was
  // generated here: a save restored from the private desc has the layout but
  // not the click, and this replayed open must put it back.
  if (state.clickedAt === null) state.clickedAt = { x, y };

  if (mines[y * w + x]) {
    // Trodden on a mine. Expose only it (so an undo can carry on).
    state.dead = true;
    grid[y * w + x] = KILLED;
    return;
  }

  // Flood: a square with no neighboring mines opens its covered neighbors.
  const todo: Point[] = [{ x, y }];
  grid[y * w + x] = TODO;
  while (todo.length > 0) {
    const sq = todo.pop() as Point;
    const near = around(w, h, sq.x, sq.y);
    const v = near.filter((q) => mines[q.y * w + q.x]).length;
    grid[sq.y * w + sq.x] = v;
    if (v > 0) continue;
    for (const q of near) {
      if (grid[q.y * w + q.x] === COVERED) {
        grid[q.y * w + q.x] = TODO;
        todo.push(q);
      }
    }
  }

  if (state.dead) return;

  // Win when exactly as many squares stay covered as there are mines.
  let nmines = 0;
  let ncovered = 0;
  for (let i = 0; i < w * h; i++) {
    if (grid[i] < 0) ncovered++;
    if (mines[i]) nmines++;
  }
  if (ncovered === nmines) {
    for (let i = 0; i < w * h; i++) if (grid[i] < 0) grid[i] = FLAG;
    state.completed = true;
  }
}

// --- Game object -------------------------------------------------------

const mk = (w: number, h: number, n: number): MinesParams => ({
  ...defaultParams(),
  w,
  h,
  n,
});

export const minesGame: Game<
  MinesParams,
  MinesState,
  MinesMove,
  MinesUi,
  MinesDrawState
> = {
  id: "mines",
  wantsStatusbar: true,
  isTimed: true,
  canSolve: true,
  canFormatAsText: true,
  preferredTileSize: PREFERRED_TILE_SIZE,

  defaultParams,
  presets() {
    return {
      title: "Mines",
      submenu: [
        { title: "9x9, 10 mines", params: mk(9, 9, 10) },
        { title: "9x9, 35 mines", params: mk(9, 9, 35) },
        { title: "16x16, 40 mines", params: mk(16, 16, 40) },
        { title: "16x16, 99 mines", params: mk(16, 16, 99) },
        { title: "30x16, 99 mines", params: mk(30, 16, 99) },
        { title: "30x16, 170 mines", params: mk(30, 16, 170) },
      ],
    };
  },
  encodeParams,
  decodeParams,
  validateParams,

  describeParams(p: MinesParams): ConfigValues {
    return {
      width: String(p.w),
      height: String(p.h),
      mines: String(p.n),
      "ensure-solubility": p.unique ? 1 : 0,
    };
  },
  paramConfig: [
    ...dimensionParamConfig<MinesParams>(),
    {
      kw: "mines",
      name: "Mines",
      type: "string",
      get: (p) => String(p.n),
      set: (p, v) => {
        // Percentage-of-area form (upstream `custom_params`, mines.c:271). The
        // width/height items run first (array order), so `p.w * p.h` is current.
        const n = parseConfigInt(v);
        p.n = v.includes("%") ? Math.floor((n * (p.w * p.h)) / 100) : n;
      },
    },
    {
      kw: "ensure-solubility",
      name: "Ensure solubility",
      type: "boolean",
      get: (p) => p.unique,
      set: (p, v) => {
        p.unique = v;
      },
    },
  ],

  newDesc(p: MinesParams, rng: RandomState): { desc: string } {
    // Burn the two `random_upto` draws batch generation spends on a first
    // click, purely to keep the RNG stream in step with it so shared seeds
    // reproduce.
    randomUpto(rng, p.w);
    randomUpto(rng, p.h);
    return { desc: `r${p.n},${p.unique ? "u" : "a"},${randomStateEncode(rng)}` };
  },
  validateDesc,
  newState(p: MinesParams, desc: string): MinesState {
    const { layout, openXY } = decodeDesc(p, desc);
    const state: MinesState = {
      w: p.w,
      h: p.h,
      n: p.n,
      dead: false,
      completed: false,
      cheated: false,
      layout,
      clickedAt: null,
      grid: new Int8Array(p.w * p.h).fill(COVERED),
    };
    if (openXY) openSquare(state, openXY.x, openXY.y);
    return state;
  },
  newUi(): MinesUi {
    return {
      hx: -1,
      hy: -1,
      hradius: 0,
      validradius: 0,
      flashIsDeath: false,
      deaths: 0,
      everCompleted: false,
      cursor: newCursor(),
    };
  },
  encodeUi,
  decodeUi,
  changedState(ui: MinesUi, _old: MinesState | null, newState: MinesState): void {
    if (newState.completed) ui.everCompleted = true;
  },

  interpretMove(
    s: MinesState,
    ui: MinesUi,
    ds: MinesDrawState,
    p: Point,
    button: number,
  ): MinesMove | null | UiUpdate {
    const { w, h } = s;
    if (s.dead || s.completed) return null; // no further moves permitted

    const tileSize = ds.tileSize;
    const border = borderFor(tileSize);
    let cx = fromCoord(p.x, tileSize, border);
    let cy = fromCoord(p.y, tileSize, border);

    /** Chord the number at (cx, cy) (upstream `goto uncover`, mines.c:2682): if
     * its flags match its count, open every covered neighbor (`C`) — unless one
     * of them is really a mine (a misplaced flag), in which case reveal *only*
     * those mines and count a death. */
    const uncover = (): MinesMove | null | UiUpdate => {
      if (s.grid[cy * w + cx] > 0 && ui.validradius === 1) {
        const near = around(w, h, cx, cy);
        const flags = near.filter((q) => s.grid[q.y * w + q.x] === FLAG).length;
        if (flags === s.grid[cy * w + cx]) {
          const ops: MineOp[] = near
            .filter(
              (q) => s.grid[q.y * w + q.x] !== FLAG && s.layout.mines?.[q.y * w + q.x],
            )
            .map((q) => ({ op: "O", x: q.x, y: q.y }));
          if (ops.length > 0) {
            ui.deaths++;
            return { type: "ops", ops };
          }
          return { type: "ops", ops: [{ op: "C", x: cx, y: cy }] };
        }
      }
      return UI_UPDATE;
    };

    if (isCursorMove(button)) {
      return moveCursor(ui.cursor, button, w, h) ? UI_UPDATE : null;
    }

    if (button === CURSOR_SELECT || button === CURSOR_SELECT2) {
      const v = s.grid[ui.cursor.y * w + ui.cursor.x];
      if (!ui.cursor.visible) {
        ui.cursor.visible = true;
        return UI_UPDATE;
      }
      if (button === CURSOR_SELECT2) {
        if (v !== COVERED && v !== FLAG) return null;
        return { type: "ops", ops: [{ op: "F", x: ui.cursor.x, y: ui.cursor.y }] };
      }
      // CURSOR_SELECT behaves as LEFT_BUTTON on a single square.
      if (v === COVERED || v === QUERY) {
        if (s.layout.mines?.[ui.cursor.y * w + ui.cursor.x]) ui.deaths++;
        return { type: "ops", ops: [{ op: "O", x: ui.cursor.x, y: ui.cursor.y }] };
      }
      cx = ui.cursor.x;
      cy = ui.cursor.y;
      ui.validradius = 1;
      return uncover();
    }

    if (
      button === LEFT_BUTTON ||
      button === LEFT_DRAG ||
      button === MIDDLE_BUTTON ||
      button === MIDDLE_DRAG
    ) {
      if (cx < 0 || cx >= w || cy < 0 || cy >= h) return null;
      // A press moves the highlight, whose *radius* previews a chord: 1 lights
      // the 3×3 around a number, 0 only the pressed cell. A plain LEFT press on
      // a number shows no preview: pressed cells render like opened ones, so on
      // an unsatisfied number it flashed a false "uncover" that reverted on
      // release. Upstream shows none for a left-click either; the deliberate
      // chord gesture (middle button / Shift+left) keeps the 3×3 preview.
      const onNumber = s.grid[cy * w + cx] >= 0;
      const isMiddle = button === MIDDLE_BUTTON || button === MIDDLE_DRAG;
      ui.hx = cx;
      ui.hy = cy;
      ui.hradius = isMiddle && onNumber ? 1 : 0;
      // validradius records chord-vs-open intent, preview or no preview: the
      // release chords a number (1) and opens a covered square (0).
      if (button === LEFT_BUTTON) ui.validradius = onNumber ? 1 : 0;
      else if (button === MIDDLE_BUTTON) ui.validradius = 1;
      ui.cursor.visible = false;
      return UI_UPDATE;
    }

    if (button === RIGHT_BUTTON) {
      if (cx < 0 || cx >= w || cy < 0 || cy >= h) return null;
      // Toggles a covered square between flagged and unflagged only.
      if (s.grid[cy * w + cx] !== COVERED && s.grid[cy * w + cx] !== FLAG) return null;
      return { type: "ops", ops: [{ op: "F", x: cx, y: cy }] };
    }

    if (button === LEFT_RELEASE || button === MIDDLE_RELEASE) {
      ui.hx = ui.hy = -1;
      ui.hradius = 0;
      // Past this point we have adjusted the ui, so never return null.
      if (cx < 0 || cx >= w || cy < 0 || cy >= h) return UI_UPDATE;
      if (
        button === LEFT_RELEASE &&
        (s.grid[cy * w + cx] === COVERED || s.grid[cy * w + cx] === QUERY) &&
        ui.validradius === 0
      ) {
        if (s.layout.mines?.[cy * w + cx]) ui.deaths++;
        return { type: "ops", ops: [{ op: "O", x: cx, y: cy }] };
      }
      return uncover();
    }

    return null;
  },

  executeMove(s: MinesState, m: MinesMove): MinesState {
    const { w, h } = s;
    if (m.type === "solve") {
      if (!s.layout.mines) throw new Error("Game has not been started yet");
      const ret = cloneState(s);
      const mines = s.layout.mines;
      if (!ret.dead) {
        // Expose the entire grid as a completed solution.
        for (let y = 0; y < h; y++) {
          for (let x = 0; x < w; x++) {
            ret.grid[y * w + x] = mines[y * w + x]
              ? FLAG
              : around(w, h, x, y).filter((q) => mines[q.y * w + q.x]).length;
          }
        }
      } else {
        // A full corrections grid, standard-Minesweeper style (mines.c:2788).
        for (let i = 0; i < w * h; i++) {
          if ((ret.grid[i] === COVERED || ret.grid[i] === QUERY) && mines[i]) {
            ret.grid[i] = MINE;
          } else if (ret.grid[i] === FLAG && !mines[i]) {
            ret.grid[i] = WRONGFLAG;
          }
        }
      }
      ret.cheated = true;
      return ret;
    }
    if (m.type !== "ops") return assertNever(m, "mines: executeMove");

    if (s.dead) throw new Error("dead players cannot move");
    const ret = cloneState(s);
    for (const op of m.ops) {
      const { x, y } = op;
      if (x < 0 || x >= w || y < 0 || y >= h) {
        throw new Error(`move out of range: ${op.op}${x},${y}`);
      }
      const i = y * w + x;
      if (op.op === "F") {
        if (ret.grid[i] === FLAG || ret.grid[i] === COVERED) {
          ret.grid[i] ^= COVERED ^ FLAG; // toggle -2 <-> -1
        } else {
          throw new Error("illegal flag move");
        }
      } else if (op.op === "O") {
        openSquare(ret, x, y);
      } else if (op.op === "C") {
        for (const q of around(w, h, x, y)) {
          const v = ret.grid[q.y * w + q.x];
          if (v === COVERED || v === QUERY) openSquare(ret, q.x, q.y);
        }
      } else {
        // `op` is one shape with a three-value `op` field, not a union of
        // shapes, so it is `op.op` that narrows to `never` here.
        assertNever(op.op, `mines: executeMove op at (${x},${y})`);
      }
    }
    return ret;
  },

  supersededDesc(s: MinesState): SupersededDesc | null {
    // Answer "nothing to say" until the layout exists AND the first click is
    // recorded — both happen together on the first open.
    if (!s.layout.mines || !s.clickedAt) return null;
    const hex = encodeLayoutHex(s.layout.mines, s.w * s.h);
    return { desc: `${s.clickedAt.x},${s.clickedAt.y},m${hex}`, privDesc: `m${hex}` };
  },

  solve(_orig: MinesState, curr: MinesState): SolveResult<MinesMove> {
    if (!curr.layout.mines)
      return { ok: false, error: "Game has not been started yet" };
    return { ok: true, move: { type: "solve" } };
  },

  status(s: MinesState): GameStatus {
    // Death is NOT a loss (the player will undo); only a genuine win is
    // reported, and the midend upgrades it to "solved-with-help" if the Solve
    // button was used (mines.c game_status:3322).
    return s.completed ? "solved" : "ongoing";
  },

  statusbarText(s: MinesState, ui: MinesUi): string {
    let mines = 0;
    let markers = 0;
    let closed = 0;
    for (let i = 0; i < s.w * s.h; i++) {
      const v = s.grid[i];
      if (v < 0) closed++;
      if (v === FLAG) markers++;
      if (s.layout.mines?.[i]) mines++;
    }
    if (!s.layout.mines) mines = s.layout.n;

    let sb: string;
    if (s.dead) {
      sb = "DEAD!";
    } else if (s.completed) {
      sb = s.cheated ? "Auto-solved." : "COMPLETED!";
    } else {
      sb = `Marked: ${markers} / ${mines}`;
      const safeClosed = closed - mines;
      if (safeClosed > 0 && safeClosed <= 9) {
        sb +=
          safeClosed === 1
            ? " (1 safe square remains)"
            : ` (${safeClosed} safe squares remain)`;
      }
    }
    if (ui.deaths) sb += `  Deaths: ${ui.deaths}`;
    return sb;
  },

  textFormat(s: MinesState): string {
    let out = "";
    for (let y = 0; y < s.h; y++) {
      for (let x = 0; x < s.w; x++) {
        const v = s.grid[y * s.w + x];
        let c: string;
        if (v === 0) c = "-";
        else if (v >= 1 && v <= 8) c = String(v);
        else if (v === FLAG) c = "*";
        else if (v === COVERED || v === QUERY) c = "?";
        else if (v >= 64) c = "!";
        else c = " ";
        out += c;
      }
      out += "\n";
    }
    return out;
  },

  flashLength(a: MinesState, b: MinesState, dir: number, ui: MinesUi): number {
    if (a.cheated || b.cheated) return 0;
    if (dir > 0 && !a.dead && !a.completed) {
      if (b.dead) {
        ui.flashIsDeath = true;
        return 3 * FLASH_FRAME;
      }
      if (b.completed) {
        ui.flashIsDeath = false;
        return 2 * FLASH_FRAME;
      }
    }
    return 0;
  },

  timingState(s: MinesState, ui: MinesUi): boolean {
    // The clock stops before the first click, after death, after a win, and
    // once the game has ever been completed (mines.c game_timing_state:3332).
    return !(s.dead || s.completed || ui.everCompleted || !s.layout.mines);
  },

  colors(defaultBackground: Color): Color[] {
    const bg = defaultBackground;
    const ret: Color[] = new Array(NCOLORS);
    ret[COL_BACKGROUND] = bg;
    ret[COL_BACKGROUND2] = minesUnclearedFace(bg);
    // Upstream's count colors, and by now most players' expectation of what a
    // minesweeper looks like: 1 blue, 2 green, 3 red, 4 navy, 5 maroon, 6 teal.
    // The two dark ones are why the palette has a bold step at all — a wash is a
    // fill, and these are digits.
    ret[COL_1] = BLUE;
    ret[COL_2] = GREEN;
    ret[COL_3] = RED;
    ret[COL_4] = BLUE_BOLD;
    ret[COL_5] = RED_BOLD;
    ret[COL_6] = TEAL;
    ret[COL_7] = INK;
    ret[COL_8] = GRAY;
    ret[COL_MINE] = BLACK;
    ret[COL_BANG] = ERROR;
    ret[COL_CROSS] = ERROR;
    // Red because a flag is yours and deliberate, not because anything is
    // wrong — but the same red, which is what the collection has one of.
    ret[COL_FLAG] = RED;
    ret[COL_FLAGBASE] = INK;
    ret[COL_QUERY] = INK;
    ret[COL_HIGHLIGHT] = PAPER;
    ret[COL_LOWLIGHT] = minesLowlight(bg);
    ret[COL_WRONGNUMBER] = ERROR_WASH;
    // Pink: it has to read on a cleared square and an uncleared one alike, and
    // the board's own grays and the count digits have the rest spoken for.
    ret[COL_CURSOR] = PINK;
    return ret;
  },
  computeSize,
  setTileSize,
  newDrawState,
  redraw,
};

registerGame(minesGame);
