/**
 * **A drag does not survive the board changing under it** — swept through the
 * real registry, so a game is covered the day it carries a `GridDrag`.
 *
 * This is the cross-game half of `name-the-drag`. The engine ends every drag a
 * `Ui` carries when it replaces the state, and membership is **derived**: the
 * midend finds one by its type, never by a declaration a game makes about
 * itself. So the population here is read off the games rather than listed, and
 * a new game with a drag joins by having one.
 *
 * Why it matters concretely: `fix-stale-ui-and-cache-state` fixed Pegs throwing
 * at the player because an armed gesture outlived the undo that invalidated it.
 * The audit in that change found Pegs alone — but only because the other games
 * wrote their drags as loose fields the engine could not see at all.
 */

import { beforeAll, describe, expect, it } from "vitest";
import { registerAllGames } from "../games/index.ts";
import { Midend } from "./midend.ts";
import { GridDrag, LEFT_BUTTON, LEFT_RELEASE, startDrag } from "./pointer.ts";
import { type AnyGame, builtGames } from "./testing/enrollment.ts";
import { probePoints } from "./testing/input-probe.ts";
import { RecordingDrawing } from "./testing/recording-drawing.ts";
import { DEFAULT_BACKGROUND } from "./testing/render-scenario.ts";
import type { Point } from "./types.ts";

beforeAll(registerAllGames);

/** Every `GridDrag` on a `Ui`, one level deep — the same reach the engine has. */
function dragsOf(ui: unknown): GridDrag[] {
  if (typeof ui !== "object" || ui === null) return [];
  return Object.values(ui).filter((v): v is GridDrag => v instanceof GridDrag);
}

/**
 * A midend over `game`, plus the `Ui` it is actually holding.
 *
 * The `Ui` is private to the midend, and rather than open it up for a test,
 * this reads it where the engine already hands it out: `redraw` receives it.
 * The wrapper delegates to the real game, so the midend is driving the real
 * thing throughout.
 */
function midendAndUi(game: AnyGame) {
  let ui: unknown;
  const spy: AnyGame = {
    ...game,
    redraw: (dr, ds, prev, s, dir, seen, ...rest) => {
      ui = seen;
      return game.redraw(dr, ds, prev, s, dir, seen, ...rest);
    },
  };
  const m = new Midend(spy);
  let moveCount = 0;
  m.setCallbacks(
    (n) => {
      if (n.type === "game-state-change") moveCount = n.currentMove;
    },
    () => {},
    () => {},
  );
  m.newGame();
  const read = () => {
    m.redraw(new RecordingDrawing(m.getColorPalette(DEFAULT_BACKGROUND)));
    return ui;
  };
  return { m, read, moves: () => moveCount };
}

/** The games whose `newUi` actually returns a `GridDrag`. Derived, not listed:
 * nothing here reads a name or a declaration. */
function dragGames() {
  return builtGames().filter((g) => dragsOf(g.ui).length > 0);
}

describe("a drag does not survive a state replacement", () => {
  it("finds a non-trivial population, derived from what the games carry", () => {
    // The vacuity guard. An empty sweep would make every assertion below pass
    // over nothing and report health — the shape this repo has hit repeatedly.
    // Six games carry one today; the floor is deliberately lower than that so
    // the guard fails on a broken probe rather than on a game being converted.
    expect(builtGames().length).toBeGreaterThanOrEqual(57);
    expect(dragGames().length).toBeGreaterThanOrEqual(4);
  });

  it("ends every drag on the Ui when the midend replaces the state", () => {
    const checked: string[] = [];
    for (const { id, game } of dragGames()) {
      const { m, read } = midendAndUi(game);

      // Arm every drag the game carries, by hand: this asks about the engine's
      // cancel, not about any game's gesture vocabulary, so it must not depend
      // on knowing how a given game starts one.
      const drags = dragsOf(read());
      expect(drags.length, `${id} kept its drag through newGame`).toBeGreaterThan(0);
      for (const d of drags) startDrag(d, 1, 1);

      // Any state replacement will do; restart is the one every game has.
      m.restartGame();

      for (const d of drags) {
        expect(d.live, `${id}: a drag survived the board being replaced`).toBe(false);
      }
      checked.push(id);
    }
    // Say what was actually covered, so a shrinking population is visible in
    // the failure rather than silently reducing the sweep to nothing.
    expect(checked.length).toBe(dragGames().length);
  });

  it("a release after the cancel commits nothing", () => {
    // The assertion that matters, and the one an earlier version of this file
    // missed. Ending `drag.live` only protects a game that *asks* `drag.live`:
    // Tents gated its drag branch on `dragButton >= 0`, Tracks on `painting`
    // and Bridges on `aiming`, and all three would have committed a move from
    // an anchor the undo invalidated — the same defect `changedState` was added
    // to Pegs for. So this drives a real press, replaces the state under it,
    // and releases.
    let exercised = 0;
    for (const { id, game } of dragGames()) {
      const { m, read, moves } = midendAndUi(game);
      const size = m.preferredSize();

      // Find a press that actually arms this game's drag. Derived by trying —
      // a table of "where each game's drag starts" would be a manifest.
      let armed: Point | null = null;
      for (const p of probePoints(size)) {
        m.restartGame();
        m.processInput(p.x, p.y, LEFT_BUTTON);
        if (dragsOf(read()).some((d) => d.live)) {
          armed = p;
          break;
        }
      }
      if (!armed) continue; // this game's drag needs a gesture this sweep can't make
      exercised++;

      // Replace the state under the live drag, then release where the drag is.
      m.restartGame();
      const before = moves();
      m.processInput(armed.x, armed.y, LEFT_RELEASE);
      expect(
        moves(),
        `${id}: a release after the board changed still committed a move`,
      ).toBe(before);
    }
    // Not every game's drag is reachable by a bare press at a probe point, but
    // if *none* is the sweep proved nothing.
    expect(exercised).toBeGreaterThan(0);
  });

  it("a game with no Ui at all is not a crash", () => {
    // `newUi` is optional and two games genuinely have nothing to remember, so
    // the sweep has to treat "no object" as "nothing to cancel".
    const empty = builtGames().filter((g) => Object.keys(g.ui).length === 0);
    expect(empty.length).toBeGreaterThan(0);
    for (const { game } of empty) {
      const m = new Midend(game);
      m.setCallbacks(
        () => {},
        () => {},
        () => {},
      );
      expect(() => {
        m.newGame();
        m.restartGame();
        m.undo();
      }).not.toThrow();
    }
  });
});
