/**
 * Mines (Minesweeper) — native TS port of `puzzles/mines.c`.
 *
 * The headline feature this port exists to prove is desc supersession
 * (`Game.supersededDesc`, the `add-desc-supersede-hook` consumer): Mines
 * generates its mine layout on the *first click*, so the desc the player starts
 * from names no layout at all, and must be replaced once the real board exists
 * (design D1/D2). It is also the first game the TS engine runs with a live
 * timer (`isTimed`, design D3).
 *
 * Logic mirrors the C reference; not a control-flow transliteration.
 */

import type {
  Colour,
  ConfigValues,
  GameStatus,
  Point,
  Size,
} from "../../../puzzle/types.ts";
import { fromCoord } from "../../engine/geometry.ts";
import {
  type Game,
  type HintStep,
  registerGame,
  type SolveResult,
  type SupersededDesc,
  UI_UPDATE,
  type UiUpdate,
} from "../../engine/index.ts";
import { parseConfigInt } from "../../engine/params.ts";
import {
  CURSOR_SELECT,
  CURSOR_SELECT2,
  gridCursorMove,
  isCursorMove,
  LEFT_BUTTON,
  LEFT_DRAG,
  LEFT_RELEASE,
  MIDDLE_BUTTON,
  MIDDLE_DRAG,
  MIDDLE_RELEASE,
  RIGHT_BUTTON,
} from "../../engine/pointer.ts";
import { type RandomState, randomUpto } from "../../random/index.ts";
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
  type MinesDrawState,
  NCOLOURS,
  newDrawState,
  PREFERRED_TILE_SIZE,
  redraw,
  setTileSize,
} from "./render.ts";
import {
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
  randomStateEncode,
  validateDesc,
  validateParams,
  WRONGFLAG,
} from "./state.ts";

const FLASH_FRAME = 0.13;

// --- the flood-open + first-click layout generation (open_square) ------

/**
 * Open square (x, y), generating the mine layout on the first click if it does
 * not yet exist (upstream `open_square`, mines.c:2135). Mutates `state` (a
 * fresh clone from `executeMove`) — and, on the first click only, the *shared*
 * {@link MinesState.layout} box (design D1): the sole controlled impurity of
 * this port, deterministic in `(desc RNG state, click)` so a move-log replay
 * always rebuilds the identical board.
 */
function openSquare(state: MinesState, x: number, y: number): void {
  const { w, h } = state;
  const layout = state.layout;

  if (!layout.mines) {
    // === the single deliberate mutation of a shared object (design D1) ===
    // The layout is a memoisation of a deterministic function of the desc's RNG
    // state and this click, so replaying the move log reproduces it exactly.
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
    // The engine pulls the superseded desc from `supersededDesc` after this
    // move commits — the game never pushes into the midend (design D1/D2).
  }

  // Record the first click on the *state* whether or not the layout was
  // generated here (design D2): a save restored from the private desc has the
  // layout but not the click, and this replayed open must put it back.
  if (state.clickedAt === null) state.clickedAt = { x, y };

  if (layout.mines[y * w + x]) {
    // Trodden on a mine. Expose only it (so an undo can carry on).
    state.dead = true;
    state.grid[y * w + x] = KILLED;
    return;
  }

  state.grid[y * w + x] = -10; // internal `todo` marker
  while (true) {
    let doneSomething = false;
    for (let yy = 0; yy < h; yy++) {
      for (let xx = 0; xx < w; xx++) {
        if (state.grid[yy * w + xx] === -10) {
          let v = 0;
          for (let dx = -1; dx <= 1; dx++) {
            for (let dy = -1; dy <= 1; dy++) {
              if (
                xx + dx >= 0 &&
                xx + dx < w &&
                yy + dy >= 0 &&
                yy + dy < h &&
                layout.mines[(yy + dy) * w + (xx + dx)]
              ) {
                v++;
              }
            }
          }
          state.grid[yy * w + xx] = v;
          if (v === 0) {
            for (let dx = -1; dx <= 1; dx++) {
              for (let dy = -1; dy <= 1; dy++) {
                if (
                  xx + dx >= 0 &&
                  xx + dx < w &&
                  yy + dy >= 0 &&
                  yy + dy < h &&
                  state.grid[(yy + dy) * w + (xx + dx)] === COVERED
                ) {
                  state.grid[(yy + dy) * w + (xx + dx)] = -10;
                }
              }
            }
          }
          doneSomething = true;
        }
      }
    }
    if (!doneSomething) break;
  }

  if (state.dead) return;

  // Win when exactly as many squares stay covered as there are mines.
  let nmines = 0;
  let ncovered = 0;
  for (let i = 0; i < w * h; i++) {
    if (state.grid[i] < 0) ncovered++;
    if (layout.mines[i]) nmines++;
  }
  if (ncovered === nmines) {
    for (let i = 0; i < w * h; i++) if (state.grid[i] < 0) state.grid[i] = FLAG;
    state.won = true;
  }
}

// --- Game object -------------------------------------------------------

const mk = (w: number, h: number, n: number): MinesParams => ({
  w,
  h,
  n,
  unique: true,
  firstClickX: -1,
  firstClickY: -1,
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
  needsRightButton: true,
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
    {
      kw: "width",
      name: "Width",
      type: "string",
      get: (p) => String(p.w),
      set: (p, v) => {
        p.w = parseConfigInt(v);
      },
    },
    {
      kw: "height",
      name: "Height",
      type: "string",
      get: (p) => String(p.h),
      set: (p, v) => {
        p.h = parseConfigInt(v);
      },
    },
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
    // Burn two `random_upto` draws (design D6.1): the interactive path discards
    // an initial click location it never uses, purely to keep the RNG stream in
    // step with batch generation so shared seeds reproduce.
    randomUpto(rng, p.w);
    randomUpto(rng, p.h);
    const rsHex = randomStateEncode(rng);
    return { desc: `r${p.n},${p.unique ? "u" : "a"},${rsHex}` };
  },
  validateDesc,
  newState(p: MinesParams, desc: string): MinesState {
    const { layout, openXY } = decodeDesc(p, desc);
    const state: MinesState = {
      w: p.w,
      h: p.h,
      n: p.n,
      dead: false,
      won: false,
      usedSolve: false,
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
      completed: false,
      curX: 0,
      curY: 0,
      curVisible: false,
    };
  },
  encodeUi,
  decodeUi(ui: MinesUi, encoded: string): void {
    decodeUi(ui, encoded);
  },
  changedState(ui: MinesUi, _old: MinesState | null, newState: MinesState): void {
    if (newState.won) ui.completed = true;
  },

  interpretMove(
    s: MinesState,
    ui: MinesUi,
    ds: MinesDrawState | null,
    p: Point,
    button: number,
  ): MinesMove | null | UiUpdate {
    const { w, h } = s;
    if (s.dead || s.won) return null; // no further moves permitted

    const tileSize = ds?.tileSize || PREFERRED_TILE_SIZE;
    const border = borderFor(tileSize);
    let cx = fromCoord(p.x, tileSize, border);
    let cy = fromCoord(p.y, tileSize, border);

    /** The `uncover` chord path (upstream `goto uncover`, mines.c:2682): if the
     * clicked number's flags match, either open all covered neighbours (`C`),
     * or — if a to-open square is really a mine (mis-flagged) — reveal *only*
     * those mines and count a death (design D7). */
    const uncover = (): MinesMove | null | UiUpdate => {
      if (s.grid[cy * w + cx] > 0 && ui.validradius === 1) {
        let n = 0;
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            if (
              cx + dx >= 0 &&
              cx + dx < w &&
              cy + dy >= 0 &&
              cy + dy < h &&
              s.grid[(cy + dy) * w + (cx + dx)] === FLAG
            ) {
              n++;
            }
          }
        }
        if (n === s.grid[cy * w + cx]) {
          const ops: MineOp[] = [];
          for (let dy = -1; dy <= 1; dy++) {
            for (let dx = -1; dx <= 1; dx++) {
              if (cx + dx >= 0 && cx + dx < w && cy + dy >= 0 && cy + dy < h) {
                if (
                  s.grid[(cy + dy) * w + (cx + dx)] !== FLAG &&
                  s.layout.mines &&
                  s.layout.mines[(cy + dy) * w + (cx + dx)]
                ) {
                  ops.push({ op: "O", x: cx + dx, y: cy + dy });
                }
              }
            }
          }
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
      const wasVisible = ui.curVisible;
      const moved = gridCursorMove(button, ui.curX, ui.curY, w, h);
      const ox = ui.curX;
      const oy = ui.curY;
      if (moved) {
        ui.curX = moved.x;
        ui.curY = moved.y;
      }
      if (!wasVisible) {
        ui.curVisible = true;
        return UI_UPDATE;
      }
      return ui.curX !== ox || ui.curY !== oy ? UI_UPDATE : null;
    }

    if (button === CURSOR_SELECT || button === CURSOR_SELECT2) {
      const v = s.grid[ui.curY * w + ui.curX];
      if (!ui.curVisible) {
        ui.curVisible = true;
        return UI_UPDATE;
      }
      if (button === CURSOR_SELECT2) {
        if (v !== COVERED && v !== FLAG) return null;
        return { type: "ops", ops: [{ op: "F", x: ui.curX, y: ui.curY }] };
      }
      // CURSOR_SELECT behaves as LEFT_BUTTON on a single square.
      if (v === COVERED || v === QUERY) {
        if (s.layout.mines?.[ui.curY * w + ui.curX]) ui.deaths++;
        return { type: "ops", ops: [{ op: "O", x: ui.curX, y: ui.curY }] };
      }
      cx = ui.curX;
      cy = ui.curY;
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
      // Mouse-downs/drags move the highlight (design D8). The highlight *radius*
      // is what previews a chord: `hradius = 1` lights the whole 3×3 around a
      // number, `hradius = 0` lights only the pressed cell.
      const onNumber = s.grid[cy * w + cx] >= 0;
      const isMiddle = button === MIDDLE_BUTTON || button === MIDDLE_DRAG;
      ui.hx = cx;
      ui.hy = cy;
      // Suppress the 3×3 chord preview on a plain LEFT press over a number
      // (owner report 2026-07-15): a left-click still chords on release, but the
      // pressed-preview cells render identically to opened cells, so on a
      // not-yet-satisfied number the preview flashed a false "uncover" that
      // reverted on release — reading as "uncovered blocks re-covered" while
      // solving by clicking numbers. Upstream/MS shows no preview for a
      // left-click either; the deliberate chord gesture (middle button /
      // Shift+left) keeps the 3×3 preview. A left-press over a *covered* cell
      // keeps its single-cell "about to open" highlight.
      ui.hradius = isMiddle && onNumber ? 1 : 0;
      // validradius still records chord-vs-open intent so the release chords a
      // number (1) and opens a covered square (0), preview or no preview.
      if (button === LEFT_BUTTON) ui.validradius = onNumber ? 1 : 0;
      else if (button === MIDDLE_BUTTON) ui.validradius = 1;
      ui.curVisible = false;
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
    if (m.type === "solve") {
      if (!s.layout.mines) throw new Error("Game has not been started yet");
      const ret = cloneState(s);
      const mines = ret.layout.mines as Int8Array;
      if (!ret.dead) {
        // Expose the entire grid as a completed solution.
        for (let yy = 0; yy < ret.h; yy++) {
          for (let xx = 0; xx < ret.w; xx++) {
            if (mines[yy * ret.w + xx]) {
              ret.grid[yy * ret.w + xx] = FLAG;
            } else {
              let v = 0;
              for (let dx = -1; dx <= 1; dx++) {
                for (let dy = -1; dy <= 1; dy++) {
                  if (
                    xx + dx >= 0 &&
                    xx + dx < ret.w &&
                    yy + dy >= 0 &&
                    yy + dy < ret.h &&
                    mines[(yy + dy) * ret.w + (xx + dx)]
                  ) {
                    v++;
                  }
                }
              }
              ret.grid[yy * ret.w + xx] = v;
            }
          }
        }
      } else {
        // A full corrections grid, standard-Minesweeper style (mines.c:2788).
        for (let i = 0; i < ret.w * ret.h; i++) {
          if ((ret.grid[i] === COVERED || ret.grid[i] === QUERY) && mines[i]) {
            ret.grid[i] = MINE;
          } else if (ret.grid[i] === FLAG && !mines[i]) {
            ret.grid[i] = WRONGFLAG;
          }
        }
      }
      ret.usedSolve = true;
      return ret;
    }

    if (s.dead) throw new Error("dead players cannot move");
    const ret = cloneState(s);
    for (const op of m.ops) {
      const { x, y } = op;
      if (x < 0 || x >= ret.w || y < 0 || y >= ret.h) {
        throw new Error(`move out of range: ${op.op}${x},${y}`);
      }
      const i = y * ret.w + x;
      if (op.op === "F") {
        if (ret.grid[i] === FLAG || ret.grid[i] === COVERED) {
          ret.grid[i] ^= COVERED ^ FLAG; // toggle -2 <-> -1
        } else {
          throw new Error("illegal flag move");
        }
      } else if (op.op === "O") {
        openSquare(ret, x, y);
      } else if (op.op === "C") {
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            if (
              x + dx >= 0 &&
              x + dx < ret.w &&
              y + dy >= 0 &&
              y + dy < ret.h &&
              (ret.grid[(y + dy) * ret.w + (x + dx)] === COVERED ||
                ret.grid[(y + dy) * ret.w + (x + dx)] === QUERY)
            ) {
              openSquare(ret, x + dx, y + dy);
            }
          }
        }
      }
    }
    return ret;
  },

  supersededDesc(s: MinesState): SupersededDesc | null {
    // Answer "nothing to say" until the layout exists AND the first click is
    // recorded — both happen together on the first open (design D2).
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
    return s.won ? "solved" : "ongoing";
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
    } else if (s.won) {
      sb = s.usedSolve ? "Auto-solved." : "COMPLETED!";
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
    if (a.usedSolve || b.usedSolve) return 0;
    if (dir > 0 && !a.dead && !a.won) {
      if (b.dead) {
        ui.flashIsDeath = true;
        return 3 * FLASH_FRAME;
      }
      if (b.won) {
        ui.flashIsDeath = false;
        return 2 * FLASH_FRAME;
      }
    }
    return 0;
  },

  timingState(s: MinesState, ui: MinesUi): boolean {
    // The clock stops before the first click, after death, after a win, and
    // once the game has ever been completed (mines.c game_timing_state:3332).
    return !(s.dead || s.won || ui.completed || !s.layout.mines);
  },

  colours(defaultBackground: Colour): Colour[] {
    const bg = defaultBackground;
    const ret: Colour[] = new Array(NCOLOURS);
    ret[COL_BACKGROUND] = bg;
    ret[COL_BACKGROUND2] = [(bg[0] * 19) / 20, (bg[1] * 19) / 20, (bg[2] * 19) / 20];
    ret[COL_1] = [0, 0, 1];
    ret[COL_2] = [0, 0.5, 0];
    ret[COL_3] = [1, 0, 0];
    ret[COL_4] = [0, 0, 0.5];
    ret[COL_5] = [0.5, 0, 0];
    ret[COL_6] = [0, 0.5, 0.5];
    ret[COL_7] = [0, 0, 0];
    ret[COL_8] = [0.5, 0.5, 0.5];
    ret[COL_MINE] = [0, 0, 0];
    ret[COL_BANG] = [1, 0, 0];
    ret[COL_CROSS] = [1, 0, 0];
    ret[COL_FLAG] = [1, 0, 0];
    ret[COL_FLAGBASE] = [0, 0, 0];
    ret[COL_QUERY] = [0, 0, 0];
    ret[COL_HIGHLIGHT] = [1, 1, 1];
    ret[COL_LOWLIGHT] = [(bg[0] * 2) / 3, (bg[1] * 2) / 3, (bg[2] * 2) / 3];
    ret[COL_WRONGNUMBER] = [1, 0.6, 0.6];
    ret[COL_CURSOR] = [
      ret[COL_HIGHLIGHT][0],
      ret[COL_HIGHLIGHT][0] / 2,
      ret[COL_HIGHLIGHT][0] / 2,
    ];
    return ret;
  },
  computeSize(p: MinesParams, tileSize: number): Size {
    return computeSize(p, tileSize);
  },
  setTileSize,
  newDrawState,
  redraw(
    dr,
    ds,
    prev,
    s,
    dir,
    ui,
    animTime,
    flashTime,
    _hint?: HintStep<MinesMove>,
  ): void {
    redraw(dr, ds, prev, s, dir, ui, animTime, flashTime);
  },
};

registerGame(minesGame);
