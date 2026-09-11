import { describe, expect, it } from "vitest";
import { fakeGame } from "./fake-game.ts";
import { Midend } from "./midend.ts";
import { LEFT_BUTTON } from "./pointer.ts";
import { decodeSave, encodeSave, type SaveEnvelope } from "./save.ts";
import type { ChangeNotification } from "./types.ts";

function driven(game: typeof fakeGame = fakeGame) {
  const notes: ChangeNotification[] = [];
  const m = new Midend(game);
  m.setCallbacks(
    (n) => notes.push(n),
    () => {},
  );
  const state = () =>
    [...notes].reverse().find((n) => n.type === "game-state-change") as
      | Extract<ChangeNotification, { type: "game-state-change" }>
      | undefined;
  const statusBar = () =>
    (
      [...notes].reverse().find((n) => n.type === "status-bar-change") as
        | Extract<ChangeNotification, { type: "status-bar-change" }>
        | undefined
    )?.statusBarText;
  return { m, state, statusBar };
}

describe("save codec", () => {
  it("encodes a UTF-8 JSON envelope with a version field", () => {
    const env: SaveEnvelope = {
      v: 2,
      puzzleId: "__fake__",
      params: "t3",
      desc: "g3-7",
      moves: ["inc"],
      pos: 1,
      timerElapsed: 0,
      cheated: false,
    };
    const round = decodeSave(encodeSave(env));
    expect(round).toEqual(env);
  });

  it("upgrades a v1 save in flight rather than rejecting it", () => {
    // `v: 1` spelled `cheated` as `usedSolve`. A player's existing save is not
    // ours to throw away for a rename, and the whole migration is one key.
    const legacy = {
      v: 1,
      puzzleId: "__fake__",
      params: "t3",
      desc: "g3-7",
      moves: ["inc"],
      pos: 1,
      timerElapsed: 12,
      usedSolve: true,
    };
    const round = decodeSave(encodeBytes(JSON.stringify(legacy)));
    expect(round.v).toBe(2);
    expect(round.cheated).toBe(true);
    // …and nothing else was disturbed on the way through.
    expect(round).toEqual({
      v: 2,
      puzzleId: "__fake__",
      params: "t3",
      desc: "g3-7",
      moves: ["inc"],
      pos: 1,
      timerElapsed: 12,
      cheated: true,
    });
    // The old key is *gone*, not carried alongside as a second name for one fact.
    expect(Object.hasOwn(round, "usedSolve")).toBe(false);
  });

  it("upgrades a v1 save that also carries the optional fields", () => {
    const legacy = {
      v: 1,
      puzzleId: "__fake__",
      params: "t3",
      desc: "g3-7",
      privDesc: "p3-7",
      moves: [],
      pos: 0,
      timerElapsed: 0,
      usedSolve: false,
      ui: "D2C",
    };
    const round = decodeSave(encodeBytes(JSON.stringify(legacy)));
    expect(round.privDesc).toBe("p3-7");
    expect(round.ui).toBe("D2C");
    expect(round.cheated).toBe(false);
  });

  it("rejects a v1 save whose legacy flag is missing or malformed", () => {
    // The upgrade must not manufacture a `cheated` out of nothing: an absent
    // or non-boolean `usedSolve` still has to fail the envelope check.
    for (const bad of [{}, { usedSolve: "true" }]) {
      const legacy = {
        v: 1,
        puzzleId: "__fake__",
        params: "t3",
        desc: "g3-7",
        moves: [],
        pos: 0,
        timerElapsed: 0,
        ...bad,
      };
      expect(() => decodeSave(encodeBytes(JSON.stringify(legacy)))).toThrow(
        /not a recognized TS save envelope/,
      );
    }
  });

  it("rejects non-JSON (pre-pivot C-format) data", () => {
    const garbage = new Uint8Array([0x53, 0x41, 0x56, 0x45, 0x00, 0xff]);
    expect(() => decodeSave(garbage)).toThrow(/pre-pivot C-format/);
  });

  it("rejects JSON that is not a save envelope", () => {
    expect(() => decodeSave(encodeBytes('{"hello":1}'))).toThrow(
      /not a recognized TS save envelope/,
    );
  });

  // Every field guard, one corruption at a time. `{"hello":1}` above fails on
  // the *first* check and short-circuits, so without these the other guards
  // would run only on the happy path, and each could be replaced by `true` with
  // the suite still green. This guard is what stands between a corrupt or
  // truncated save and a game state rebuilt from nonsense.
  describe("rejects an envelope with any one field wrong", () => {
    const valid: SaveEnvelope = {
      v: 2,
      puzzleId: "__fake__",
      params: "t3",
      desc: "g3-7",
      privDesc: "g3-0",
      moves: ["inc"],
      pos: 1,
      timerElapsed: 0,
      cheated: false,
      ui: "u",
    };

    it("accepts the valid envelope these cases are derived from", () => {
      // Otherwise every case below could pass for the wrong reason.
      expect(decodeSave(encodeSave(valid))).toEqual(valid);
    });

    const cases: [name: string, corrupt: Record<string, unknown>][] = [
      // A *future* version, which we cannot read (`v: 1` is upgraded instead).
      ["v is a version we cannot read", { v: 3 }],
      ["v is a string", { v: "2" }],
      ["v is missing", { v: undefined }],
      ["puzzleId is not a string", { puzzleId: 7 }],
      ["puzzleId is missing", { puzzleId: undefined }],
      ["params is not a string", { params: 3 }],
      ["desc is not a string", { desc: null }],
      ["privDesc is present but not a string", { privDesc: 12 }],
      ["moves is not an array", { moves: "inc" }],
      ["moves is missing", { moves: undefined }],
      ["pos is not a number", { pos: "1" }],
      ["timerElapsed is not a number", { timerElapsed: null }],
      ["cheated is not a boolean", { cheated: "false" }],
      ["ui is present but not a string", { ui: 0 }],
    ];

    for (const [name, corrupt] of cases) {
      it(name, () => {
        const env = { ...valid, ...corrupt };
        for (const [k, v] of Object.entries(corrupt)) {
          if (v === undefined) delete (env as Record<string, unknown>)[k];
        }
        expect(() => decodeSave(encodeBytes(JSON.stringify(env)))).toThrow(
          /not a recognized TS save envelope/,
        );
      });
    }

    it("accepts the two optional fields being absent", () => {
      // `privDesc` and `ui` are additive: a save written before desc
      // supersession existed omits them, and most games still do. Their guards
      // must reject a wrong *type* without rejecting absence.
      const { privDesc: _p, ui: _u, ...without } = valid;
      expect(decodeSave(encodeSave(without as SaveEnvelope))).toEqual(without);
    });

    it("rejects JSON that is not an object at all", () => {
      for (const text of ["null", "42", '"a string"', "[1,2,3]", "true"]) {
        expect(
          () => decodeSave(encodeBytes(text)),
          `${text} should not decode as an envelope`,
        ).toThrow(/not a recognized TS save envelope/);
      }
    });
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

  // `loadGame` has four ways to say no, each returning a sentence the player
  // reads in a dialog. They are not interchangeable: the difference between
  // "this file is not a save" and "this save is for Galaxies" is the difference
  // between a corrupt file and the wrong one, and only one of those is worth the
  // player retrying.
  //
  // The load must also be *refused*, not half-applied — a game rebuilt from a
  // save that was rejected halfway is the worst of both.
  it.each([
    [
      "data that is not JSON at all",
      () => Uint8Array.from([0x53, 0x41, 0x56, 0x45, 0x00, 0xff]),
      /Could not read save: .*pre-pivot C-format/,
    ],
    [
      "JSON that is not a save envelope",
      () => encodeBytes(JSON.stringify({ hello: 1 })),
      /Could not read save: .*not a recognized TS save envelope/,
    ],
    [
      "an envelope whose params no longer decode",
      () =>
        encodeSave({
          v: 2,
          puzzleId: "__fake__",
          params: "not-params",
          desc: "g3-1",
          moves: [],
          pos: 0,
          timerElapsed: 0,
          cheated: false,
        }),
      /Invalid saved parameters: .*bad params/,
    ],
  ])("refuses %s, leaving the running game intact", (_what, bytes, expected) => {
    const a = driven();
    a.m.newGame();
    a.m.processInput(0, 0, LEFT_BUTTON);
    const before = a.m.formatAsText();

    expect(a.m.loadGame(bytes())).toMatch(expected);
    expect(a.m.formatAsText()).toBe(before);
    expect(a.state()).toMatchObject({ currentMove: 1, canUndo: true });
  });

  it("clamps a save's undo position to the history its move log rebuilds", () => {
    // `pos` and `moves` are independent fields of a file that may have been
    // hand-edited, truncated, or written by a future version. Trusting `pos`
    // puts the midend on a history index that does not exist, where `undo`
    // walks backwards through `undefined` states.
    const env: SaveEnvelope = {
      v: 2,
      puzzleId: "__fake__",
      params: "t9",
      desc: "g9-1",
      moves: ["inc", "inc"],
      pos: 99, // two moves replayed, so the real maximum is 2
      timerElapsed: 0,
      cheated: false,
    };
    const b = driven();
    expect(b.m.loadGame(encodeSave(env))).toBeUndefined();
    expect(b.state()).toMatchObject({ currentMove: 2, totalMoves: 2, canRedo: false });
    expect(b.m.formatAsText()).toBe("count=2");
  });

  it("round-trips the elapsed clock of a timed game", () => {
    // `timerElapsed` is the only field of a Mines save that no move can
    // reconstruct: replaying the log rebuilds the board exactly and the clock
    // not at all, so a save that drops it silently gives the player their time
    // back.
    const timed = { ...fakeGame, isTimed: true };
    const a = driven(timed);
    a.m.newGame();
    a.m.timer(83);

    const b = driven(timed);
    expect(b.m.loadGame(a.m.saveGame())).toBeUndefined();
    expect(decodeSave(a.m.saveGame()).timerElapsed).toBe(83);
    expect(b.statusBar()).toMatch(/^\[1:23\]/);
  });

  it("refuses a save belonging to a different puzzle", () => {
    const env: SaveEnvelope = {
      v: 2,
      puzzleId: "galaxies",
      params: "t3",
      desc: "g3-1",
      moves: [],
      pos: 0,
      timerElapsed: 0,
      cheated: false,
    };
    const m = new Midend(fakeGame);
    m.setCallbacks(
      () => {},
      () => {},
    );
    expect(m.loadGame(encodeSave(env))).toMatch(/not "__fake__"/);
  });
});
