/**
 * The cross-game guard on how a hint marks the board: **beside the content,
 * never behind it**.
 *
 * One sweep over the `hint-games.ts` enrollment, so a newly ported game with a
 * `hint()` is covered by adding the one line it already has to add. Each game's
 * own `COL_HINT` / `COL_HINT_CELL` indices are read out of its `render.ts`
 * exports rather than listed here, so nothing to maintain and nothing to drift.
 *
 * **Shape, not color.** "Some rect carries the hint color" is satisfied by
 * exactly the thing this forbids — a solid fill over the digits a hint is
 * talking about. What is asserted is that no rect in a hint color is
 * *cell-sized and thick in both directions*.
 *
 * The measurement behind the rule is in `hint-mark.ts`; the per-game calls are
 * in `docs/games/hints.md` § "Shade vs ring".
 */
import { describe, expect, it } from "vitest";
import { Midend } from "./index.ts";
import { firstLeaf, HINT_GAMES } from "./testing/hint-games.ts";
import { RecordingDrawing } from "./testing/recording-drawing.ts";
import { DEFAULT_BACKGROUND } from "./testing/render-scenario.ts";

const RENDERERS = import.meta.glob<Record<string, unknown>>("../games/*/render.ts", {
  eager: true,
});

/**
 * The games whose **evidence** is a wash rather than an outline, with the claim
 * each is making: *nothing is drawn on these cells*.
 *
 * Asserted as an exact set rather than used to skip, so a fourth game quietly
 * washing its evidence fails here until somebody writes down why it may. The
 * target has no such list: it is ringed in every game, no exceptions (owner,
 * 2026-08-22).
 */
const EVIDENCE_WASH_GAMES = new Set([
  // The journey's still-*empty* siblings.
  "unruly",
  // The reasoned line's still-undecided squares.
  "pattern",
  // Dark squares, where the premise is that the square is *not lit* — which a
  // teal shade preserves, because it is not yellow.
  "lightup",
]);

interface Op {
  op: string;
  color?: number;
  w?: number;
  h?: number;
}

/** A rect that is thick in both directions and at least half a cell across —
 * i.e. a fill, not a mark. */
function solidFills(ops: readonly Op[], color: number, cell: number): Op[] {
  return ops.filter((o) => {
    if (o.op !== "rect" || o.color !== color) return false;
    const w = o.w ?? 0;
    const h = o.h ?? 0;
    return Math.min(w, h) * 4 >= Math.max(w, h) && Math.min(w, h) >= cell / 2;
  });
}

/** Every `render.ts` in the games tree, by puzzle id. */
function renderersById(): Map<string, Record<string, unknown>> {
  const byId = new Map<string, Record<string, unknown>>();
  for (const [path, mod] of Object.entries(RENDERERS)) {
    const m = path.match(/\/games\/([^/]+)\//);
    // Throwing rather than skipping: a path shape this does not recognize is a
    // module silently dropped from the sweep, which is how a guard goes quiet.
    if (!m) throw new Error(`unexpected renderer path ${path}`);
    byId.set(m[1], mod);
  }
  return byId;
}

/**
 * Walk a game's hint plan and hand back every frame it paints.
 *
 * Several seeds and several steps, because a fill can hide in a tier the opener
 * never reaches — the earlier survey of this found Clusters' chain frames only
 * past the third step of a Tricky board.
 */
function hintFrames(
  game: (typeof HINT_GAMES)[number][1],
): { ops: Op[]; cell: number }[] {
  const params = firstLeaf(game.presets());
  const palette = game.colors(DEFAULT_BACKGROUND);
  const frames: { ops: Op[]; cell: number }[] = [];
  for (let s = 0; s < 6; s++) {
    const midend = new Midend(game);
    if (midend.newGameFromId(`${game.encodeParams(params, true)}#mark-${s}`)) continue;
    const size = midend.size({ w: 700, h: 700 });
    const cell = Math.min(size.w, size.h) / 20;
    if (midend.hint()) continue;
    for (let step = 0; step < 6; step++) {
      const frame = new RecordingDrawing(palette);
      midend.redraw(frame);
      if (!midend.activeHintStep()) break;
      frames.push({ ops: frame.ops as unknown as Op[], cell });
      midend.executeHint();
    }
  }
  return frames;
}

describe("a hint marks beside the content, never behind it", () => {
  const byId = renderersById();
  /** Games that declare a cell-level target color, i.e. the ones this sweep can
   * say anything about. The grid-move games (Fifteen, Flood, Sixteen, Netslide's
   * arrows, Untangle, Inertia) mark something other than a cell and are absent
   * (Fifteen and Sixteen by keeping `COL_HINT` unexported). */
  const CHECKED = HINT_GAMES.filter(
    ([id]) => typeof byId.get(id)?.["COL_HINT"] === "number",
  );

  it("looks at every game's renderer", () => {
    // The "how many things did I look at?" guard. An `import.meta.glob` that
    // matches nothing yields `{}` and every assertion below then passes
    // vacuously — this repo has been bitten by that exact silence before.
    expect(byId.size).toBeGreaterThanOrEqual(50);
    // **Every hinting game's renderer is findable**, so the list is empty —
    // and an empty list still asserts something, because a game that hides its
    // renderer shows up here.
    expect(HINT_GAMES.filter(([id]) => !byId.has(id)).map(([id]) => id)).toEqual([]);
    // …and the sweep itself cannot quietly shrink: a game whose `COL_HINT`
    // export is renamed away drops out of `CHECKED` in silence otherwise.
    expect(CHECKED.length).toBe(28);
    // And the wash list names real games, so a rename cannot leave a dead
    // exemption behind that silently stops guarding anything.
    for (const id of EVIDENCE_WASH_GAMES)
      expect(
        HINT_GAMES.some(([g]) => g === id),
        `${id} is not a hint game`,
      ).toBe(true);
  });

  for (const [id, game] of CHECKED) {
    const mod = byId.get(id);
    const target = mod?.["COL_HINT"] as number;
    const evidence = mod?.["COL_HINT_CELL"];

    it(`${id}: the acted-on cell is ringed, not filled`, () => {
      const frames = hintFrames(game);
      expect(frames.length, `${id} produced no hint frame to check`).toBeGreaterThan(0);
      for (const { ops, cell } of frames) {
        const fills = solidFills(ops, target, cell);
        expect(
          fills,
          `${id} fills a cell with its hint-target color: ${JSON.stringify(fills[0])}`,
        ).toHaveLength(0);
        if (typeof evidence === "number" && !EVIDENCE_WASH_GAMES.has(id)) {
          const washes = solidFills(ops, evidence, cell);
          expect(
            washes,
            `${id} washes a cell with its evidence color, and is not on the wash list: ${JSON.stringify(washes[0])}`,
          ).toHaveLength(0);
        }
      }
    });
  }
});
