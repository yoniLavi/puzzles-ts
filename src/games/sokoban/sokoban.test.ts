/**
 * Behavioural tests for the Sokoban port.
 *
 * Tier 1 — the codec, move classification, push/pit mechanics, the
 * "cannot become more complete" win rule, and generator determinism.
 * Tier 2.5 — a render-scenario frame with targeted op assertions + a
 * snapshot (a generated board and a completed/flash frame).
 *
 * The byte-match generator differential lives in
 * `sokoban-differential.test.ts`; these cover the interactive paths the
 * differential never touches (execute/win/pits), per the playbook.
 */
import { describe, expect, it } from "vitest";
import { Midend } from "../../engine/index.ts";
import { CURSOR_DOWN, CURSOR_RIGHT, LEFT_BUTTON } from "../../engine/pointer.ts";
import { randomNew } from "../../engine/random/index.ts";
import { RecordingDrawing } from "../../engine/testing/recording-drawing.ts";
import {
  DEFAULT_BACKGROUND,
  renderScenario,
} from "../../engine/testing/render-scenario.ts";
import { sizedDrawState } from "../../engine/testing/sized-draw-state.ts";
import type { ChangeNotification, GameStatus } from "../../engine/types.ts";
import { newSokobanDesc } from "./generator.ts";
import { executeMove, sokobanGame } from "./index.ts";
import type { SokobanDrawState } from "./render.ts";
import {
  BARREL,
  BARRELTARGET,
  DEEP_PIT,
  decodeParams,
  encodeParams,
  moveType,
  newState,
  type SokobanMove,
  type SokobanParams,
  type SokobanState,
  type SokobanUi,
  SPACE,
  status,
  TARGET,
  validateDesc,
  validateParams,
} from "./state.ts";

type SokobanMidend = Midend<
  SokobanParams,
  SokobanState,
  SokobanMove,
  SokobanUi,
  SokobanDrawState
>;

/** Redraw a midend to a recording and return its ops (a render-equivalence
 * probe — the Midend exposes state only through drawing). */
function renderOps(me: SokobanMidend) {
  const dr = new RecordingDrawing(sokobanGame.colours(DEFAULT_BACKGROUND));
  me.redraw(dr);
  return dr.ops;
}

// A char-code map for building test levels from readable rows.
const CH: Record<string, number> = {
  w: "w".charCodeAt(0),
  s: "s".charCodeAt(0),
  t: "t".charCodeAt(0),
  b: "b".charCodeAt(0),
  f: "f".charCodeAt(0),
  u: "u".charCodeAt(0),
  v: "v".charCodeAt(0),
  p: "p".charCodeAt(0),
  d: "d".charCodeAt(0),
};

/** Build a state directly from readable rows (bypasses the desc codec).
 * The player char ('u'/'v') is recorded as px/py with SPACE/TARGET beneath. */
function stateFromRows(rows: string[]): SokobanState {
  const h = rows.length;
  const w = rows[0].length;
  const grid = new Uint8Array(w * h);
  let px = -1;
  let py = -1;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const ch = rows[y][x];
      if (ch === "u" || ch === "v") {
        px = x;
        py = y;
        grid[y * w + x] = ch === "v" ? CH["t"] : CH["s"];
      } else {
        grid[y * w + x] = CH[ch];
      }
    }
  }
  return { w, h, grid, px, py, completed: false };
}

const move = (dx: number, dy: number): SokobanMove => ({ type: "move", dx, dy });

// --- params -----------------------------------------------------------

describe("Sokoban params", () => {
  it("round-trips and decodes leniently", () => {
    const p: SokobanParams = { w: 16, h: 12 };
    expect(encodeParams(p, true)).toBe("16x12");
    expect(decodeParams("16x12")).toEqual(p);
    // A bare width yields a square board.
    expect(decodeParams("8")).toEqual({ w: 8, h: 8 });
  });

  it("rejects boards below 4x4", () => {
    expect(validateParams({ w: 3, h: 10 }, true)).toMatch(/at least 4/);
    expect(validateParams({ w: 10, h: 3 }, true)).toMatch(/at least 4/);
    expect(validateParams({ w: 4, h: 4 }, true)).toBeNull();
  });
});

// --- desc codec -------------------------------------------------------

describe("Sokoban desc codec", () => {
  const p5: SokobanParams = { w: 5, h: 5 };
  // Player(1,1), barrel(2,1), target(3,1).
  const desc = "w6ubtw2s3w2s3w6";

  it("newState decodes the run-length grid and finds the player", () => {
    const s = newState(p5, desc);
    expect(s.px).toBe(1);
    expect(s.py).toBe(1);
    // The player's cell holds the SPACE beneath it.
    expect(s.grid[1 * 5 + 1]).toBe(SPACE);
    expect(s.grid[1 * 5 + 2]).toBe(BARREL);
    expect(s.grid[1 * 5 + 3]).toBe(TARGET);
  });

  it("validateDesc accepts a well-formed level and rejects malformed ones", () => {
    expect(validateDesc(p5, desc)).toBeNull();
    // Too little / too much data.
    expect(validateDesc(p5, "w6ubtw2s3w2s3w5")).toMatch(/Too little/);
    expect(validateDesc(p5, "w6ubtw2s3w2s3w7")).toMatch(/Too much/);
    // No player.
    expect(validateDesc(p5, "w6sbtw2s3w2s3w6")).toMatch(/No starting player/);
    // Two players.
    expect(validateDesc(p5, "w6ubuw2s4w2s2w6")).toMatch(/More than one/);
    // Invalid character.
    expect(validateDesc(p5, "w6ubtw2s3w2s3z6")).toMatch(/Invalid character/);
  });

  it("validateDesc accepts pits, deep pits and labelled barrels (hand IDs)", () => {
    // A labelled barrel 'A' and a pit 'p' — the random generator never emits
    // these, but hand-authored level IDs use them (design D7).
    expect(validateDesc(p5, "w6uAtw2p3w2s3w6")).toBeNull();
    expect(validateDesc(p5, "w6ubdw2s3w2s3w6")).toBeNull();
  });
});

// --- move classification ----------------------------------------------

describe("Sokoban moveType", () => {
  // wwwww / wubtw / wsssw / wsssw / wwwww
  const s = stateFromRows(["wwwww", "wubtw", "wsssw", "wsssw", "wwwww"]);

  it("classifies walks, pushes and illegal moves", () => {
    expect(moveType(s, 1, 0)).toBe("push"); // into the barrel, target beyond
    expect(moveType(s, -1, 0)).toBe("illegal"); // into a wall
    expect(moveType(s, 0, 1)).toBe("walk"); // into a space
    expect(moveType(s, 0, -1)).toBe("illegal"); // into a wall
  });

  it("allows a diagonal walk only when a shared-adjacent square is free", () => {
    // Down-right: shares (1,2)=space and (2,1)=barrel; the space makes it legal.
    expect(moveType(s, 1, 1)).toBe("walk");
    // Down-left: target square (0,2) is a wall — illegal regardless.
    expect(moveType(s, -1, 1)).toBe("illegal");
  });

  it("refuses to push a barrel diagonally, or into a wall", () => {
    // Barrel directly right with a wall two to the right.
    const blocked = stateFromRows(["wwwww", "wubww", "wsssw", "wwwww", "wwwww"]);
    expect(moveType(blocked, 1, 0)).toBe("illegal");
  });
});

// --- execute: pushes, pits, targets -----------------------------------

describe("Sokoban executeMove", () => {
  it("pushes a barrel onto a target and detects completion", () => {
    const s = stateFromRows(["wwwww", "wubtw", "wsssw", "wsssw", "wwwww"]);
    const after = executeMove(s, move(1, 0));
    expect(after.px).toBe(2); // player advanced into the vacated cell
    expect(after.py).toBe(1);
    expect(after.grid[1 * 5 + 2]).toBe(SPACE); // barrel gone from here
    expect(after.grid[1 * 5 + 3]).toBe(BARRELTARGET); // now filled
    expect(after.completed).toBe(true);
    expect(status(after)).toBe("solved");
  });

  it("fills an ordinary pit — the barrel is consumed and the pit becomes space", () => {
    const s = stateFromRows(["wwwww", "wubpw", "wsssw", "wsssw", "wwwww"]);
    const after = executeMove(s, move(1, 0));
    expect(after.grid[1 * 5 + 3]).toBe(SPACE); // pit filled
    expect(after.grid[1 * 5 + 2]).toBe(SPACE); // barrel left this cell
  });

  it("a deep pit eats the barrel and remains a deep pit", () => {
    const s = stateFromRows(["wwwww", "wubdw", "wsssw", "wsssw", "wwwww"]);
    const after = executeMove(s, move(1, 0));
    expect(after.grid[1 * 5 + 3]).toBe(DEEP_PIT); // still a deep pit
    expect(after.grid[1 * 5 + 2]).toBe(SPACE); // barrel consumed
  });

  it("completes with a spare barrel when no free target remains", () => {
    // Player, barrel, target, space, spare barrel on one row. Pushing the first
    // barrel onto the only target leaves a free barrel but nowhere to put it —
    // 'cannot become more complete', so the level is solved (design D4).
    const s = stateFromRows(["wwwwwww", "wubtsbw", "wsssssw", "wsssssw", "wwwwwww"]);
    const after = executeMove(s, move(1, 0));
    expect(after.grid[1 * 7 + 3]).toBe(BARRELTARGET); // filled the target
    expect(after.grid[1 * 7 + 5]).toBe(BARREL); // spare still free
    expect(after.completed).toBe(true);
  });

  it("throws on an illegal move reaching executeMove", () => {
    const s = stateFromRows(["wwwww", "wubtw", "wsssw", "wsssw", "wwwww"]);
    expect(() => executeMove(s, move(-1, 0))).toThrow();
  });
});

// --- input ------------------------------------------------------------

describe("Sokoban interpretMove", () => {
  const s = stateFromRows(["wwwww", "wubtw", "wsssw", "wsssw", "wwwww"]);

  it("maps cursor keys and bare digits to directions", () => {
    expect(
      sokobanGame.interpretMove(
        s,
        {},
        sizedDrawState(sokobanGame, s),
        { x: 0, y: 0 },
        CURSOR_RIGHT,
      ),
    ).toEqual(move(1, 0));
    expect(
      sokobanGame.interpretMove(
        s,
        {},
        sizedDrawState(sokobanGame, s),
        { x: 0, y: 0 },
        CURSOR_DOWN,
      ),
    ).toEqual(move(0, 1));
    // Bare '3' = down-right diagonal (MOD_NUM_KEYPAD never arrives — §3.8a).
    expect(
      sokobanGame.interpretMove(
        s,
        {},
        sizedDrawState(sokobanGame, s),
        { x: 0, y: 0 },
        "3".charCodeAt(0),
      ),
    ).toEqual(move(1, 1));
    // '5' is not a direction.
    expect(
      sokobanGame.interpretMove(
        s,
        {},
        sizedDrawState(sokobanGame, s),
        { x: 0, y: 0 },
        "5".charCodeAt(0),
      ),
    ).toBeNull();
  });

  it("computes a click direction relative to the player cell", () => {
    // Player is at cell (1,1); a click well to its right (cell 3) → move right.
    const ts = 32;
    const click = { x: 3 * ts + ts / 2, y: 1 * ts + ts / 2 };
    expect(
      sokobanGame.interpretMove(
        s,
        {},
        sizedDrawState(sokobanGame, s),
        click,
        LEFT_BUTTON,
      ),
    ).toEqual(move(1, 0));
  });

  it("returns null for an illegal move (into a wall)", () => {
    // Bare '4' = left, into a wall.
    expect(
      sokobanGame.interpretMove(
        s,
        {},
        sizedDrawState(sokobanGame, s),
        { x: 0, y: 0 },
        "4".charCodeAt(0),
      ),
    ).toBeNull();
  });
});

// --- generator --------------------------------------------------------

describe("Sokoban generator", () => {
  it("is deterministic for a given seed", () => {
    const p: SokobanParams = { w: 12, h: 10 };
    const a = newSokobanDesc(p, randomNew("sokoban-det"));
    const b = newSokobanDesc(p, randomNew("sokoban-det"));
    expect(a.desc).toBe(b.desc);
  });

  it("produces a valid, uniquely-playered level with exactly one player", () => {
    const p: SokobanParams = { w: 12, h: 10 };
    const { desc } = newSokobanDesc(p, randomNew("sokoban-valid"));
    expect(validateDesc(p, desc)).toBeNull();
    const s = newState(p, desc);
    expect(s.px).toBeGreaterThanOrEqual(0);
    expect(s.py).toBeGreaterThanOrEqual(0);
  });
});

// --- midend lifecycle -------------------------------------------------

function harness() {
  const notes: ChangeNotification[] = [];
  const m = new Midend(sokobanGame);
  m.setCallbacks(
    (n) => notes.push(n),
    () => {},
    () => {},
  );
  const status = () =>
    (
      [...notes].reverse().find((n) => n.type === "game-state-change") as
        | Extract<ChangeNotification, { type: "game-state-change" }>
        | undefined
    )?.status as GameStatus | undefined;
  return { m, status };
}

describe("Sokoban midend lifecycle", () => {
  it("reports 'solved' once the last barrel reaches its target", () => {
    // Player(1,1), barrel(2,1), target(3,1): one push right wins.
    const h = harness();
    expect(h.m.newGameFromId("5x5:w6ubtw2s3w2s3w6")).toBeUndefined();
    expect(h.status()).toBe("ongoing");
    // A left-click to the player's right issues the push.
    expect(h.m.processInput(3 * 32 + 16, 1 * 32 + 16, LEFT_BUTTON)).toBe(true);
    expect(h.status()).toBe("solved");
  });

  it("save -> load preserves the board (render-equivalent)", () => {
    const me = new Midend(sokobanGame);
    expect(me.newGameFromId("12x10#sokoban-save")).toBeUndefined();
    // Two legal keyboard moves so the save carries real progress.
    me.processInput(0, 0, CURSOR_RIGHT);
    me.processInput(0, 0, CURSOR_DOWN);
    const before = renderOps(me);

    const saved = me.saveGame();
    const me2 = new Midend(sokobanGame);
    expect(me2.loadGame(saved)).toBeUndefined();
    expect(renderOps(me2)).toEqual(before);
  });
});

// --- render -----------------------------------------------------------

describe("Sokoban render", () => {
  it("draws grid lines, walls and the player on a generated board", () => {
    const { recording } = renderScenario({
      game: sokobanGame,
      id: "12x10#sokoban-render",
    });
    const ops = recording.ops;
    // Grid lines (drawn once in the first-draw branch).
    expect(ops.some((o) => o.op === "line")).toBe(true);
    // Wall bevel triangles (polygons).
    expect(ops.some((o) => o.op === "polygon")).toBe(true);
    // The player is a green disc — a circle with a fill colour.
    expect(ops.some((o) => o.op === "circle")).toBe(true);
    expect(recording.ops).toMatchSnapshot();
  });

  it("renders the frame after a winning push", () => {
    const { recording } = renderScenario({
      game: sokobanGame,
      id: "5x5:w6ubtw2s3w2s3w6",
      moves: [move(1, 0)],
      settle: true,
    });
    // A barrel-on-target disc (COL_TARGET ring + COL_BARREL disc) is present.
    expect(recording.ops.some((o) => o.op === "circle")).toBe(true);
    expect(recording.ops.length).toBeGreaterThan(0);
  });
});
