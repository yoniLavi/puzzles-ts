import { describe, expect, it } from "vitest";
import type { ChangeNotification } from "../../puzzle/types.ts";
import { fakeGame, LEFT_BUTTON } from "./fake-game.ts";
import { Midend } from "./midend.ts";
import { decodeSave, encodeSave, type SaveEnvelope } from "./save.ts";

function driven() {
  const notes: ChangeNotification[] = [];
  const m = new Midend(fakeGame);
  m.setCallbacks(
    (n) => notes.push(n),
    () => {},
  );
  const state = () =>
    [...notes].reverse().find((n) => n.type === "game-state-change") as
      | Extract<ChangeNotification, { type: "game-state-change" }>
      | undefined;
  return { m, state };
}

describe("save codec", () => {
  it("encodes a UTF-8 JSON envelope with a version field", () => {
    const env: SaveEnvelope = {
      v: 1,
      puzzleId: "__fake__",
      params: "t3",
      desc: "g3-7",
      moves: ["inc"],
      pos: 1,
      timerElapsed: 0,
      usedSolve: false,
    };
    const round = decodeSave(encodeSave(env));
    expect(round).toEqual(env);
  });

  it("rejects non-JSON (pre-pivot C-format) data", () => {
    const garbage = new Uint8Array([0x53, 0x41, 0x56, 0x45, 0x00, 0xff]);
    expect(() => decodeSave(garbage)).toThrow(/pre-pivot C-format/);
  });

  it("rejects JSON that is not a save envelope", () => {
    expect(() => decodeSave(encodeBytes('{"hello":1}'))).toThrow(
      /not a recognised TS save envelope/,
    );
  });
});

function encodeBytes(s: string): Uint8Array {
  return new TextEncoder().encode(s);
}

describe("Midend save/restore round-trip", () => {
  it("restores identical state, history and redo availability", () => {
    const a = driven();
    a.m.newGame();
    a.m.processInput(0, 0, LEFT_BUTTON); // 1
    a.m.processInput(0, 0, LEFT_BUTTON); // 2
    a.m.processInput(0, 0, LEFT_BUTTON); // 3
    a.m.undo(); // back to 2, redo available
    const saved = a.m.saveGame();
    expect(a.state()).toMatchObject({ currentMove: 2, canRedo: true });

    const b = driven();
    expect(b.m.loadGame(saved)).toBeUndefined();
    expect(b.m.formatAsText()).toBe("count=2");
    expect(b.state()).toMatchObject({
      currentMove: 2,
      totalMoves: 3,
      canUndo: true,
      canRedo: true,
      status: "ongoing",
    });
    // Redo branch survived the round-trip.
    b.m.redo();
    expect(b.m.formatAsText()).toBe("count=3");
    expect(b.state()?.status).toBe("solved");
  });

  it("round-trips the solved-with-help flag", () => {
    const a = driven();
    a.m.newGame();
    a.m.solve();
    const b = driven();
    expect(b.m.loadGame(a.m.saveGame())).toBeUndefined();
    expect(b.state()?.status).toBe("solved-with-help");
  });

  it("refuses a save belonging to a different puzzle", () => {
    const env: SaveEnvelope = {
      v: 1,
      puzzleId: "galaxies",
      params: "t3",
      desc: "g3-1",
      moves: [],
      pos: 0,
      timerElapsed: 0,
      usedSolve: false,
    };
    const m = new Midend(fakeGame);
    m.setCallbacks(
      () => {},
      () => {},
    );
    expect(m.loadGame(encodeSave(env))).toMatch(/not "__fake__"/);
  });
});
