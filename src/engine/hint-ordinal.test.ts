/**
 * Cross-game guarantee: **an ordered chain reaches the canvas with its order on
 * it**.
 *
 * A Tactic-tier deduction is a bounded chain of forced consequences, and
 * `walk-tactic-hint-chains` settled that its hint owes the player the chain
 * *shown* — each link marked in the order it falls — rather than a claim they
 * can only check by redoing the deduction. Seven games ship one; six of them are
 * reachable under this sweep (see {@link ORDERING_GAMES}).
 *
 * The mechanism is shared (`OrderedCell.order` → `OverlaySidecar.setOrder` →
 * `drawHintOrdinal`), but **the wiring is not**: each game's tile painter has to
 * take `ds.hint.order[i]` and pass it on, and a game that forgot would shade its
 * chain, narrate "cell 3 is driven to 4", and draw no numbers at all — a
 * sentence pointing at labels that do not exist. That is one line per game, in
 * seven renderers, so it is guarded once here for all of them.
 *
 * Two assertions, and the second is the one a shared mechanism cannot supply:
 *
 *  - **the data is well-formed** — an area carrying any ordinal carries exactly
 *    `1..n`, each once. A chain that numbered only its first cell, numbered from
 *    zero, or repeated a digit would read as a different chain from the one the
 *    solver found;
 *  - **the ordinals are on the canvas** — the frame's text ops *in the ordinal's
 *    own colour* are exactly the declared numbers. Asserted against the resolved
 *    `rgb`, not against a palette index, because an index is a name for a colour
 *    and not the colour (the lesson `clusters-hint.test.ts` records at length).
 *
 * **The colour clause is load-bearing, and it was proved so.** The first cut
 * asked only whether the text "1" appeared anywhere on the frame, and it passed
 * with Keen's ordinal draw deleted outright — because a Keen cell already prints
 * "1" as a pencil mark. A guard is worth exactly what it fails on, so this one
 * was checked by removing the wiring and watching it stay green.
 *
 * A forcing chain is tier-gated, so the sweep walks every tier — the reason
 * `hint-quality.test.ts` grew its own per-tier block. Games that never produce
 * one are skipped, and the set that *did* produce one is asserted, so this file
 * can never quietly go from guarding six games to guarding none.
 */
import { describe, expect, it } from "vitest";
import { HINT_EVIDENCE } from "./colour/palette.ts";
import type { PresetMenu } from "./game.ts";
import { randomNew } from "./random/index.ts";
import { firstLeaf, HINT_GAMES } from "./testing/hint-games.ts";
import { DEFAULT_BACKGROUND, renderScenario } from "./testing/render-scenario.ts";
import type { Colour } from "./types.ts";

const SEEDS = ["ord-a", "ord-b", "ord-c"];

/**
 * Games **measured** to emit an ordered chain under this sweep. A game leaving
 * the set means a hint stopped numbering its chain — the regression this file
 * exists for — so the set is asserted rather than merely used to skip.
 *
 * It is six, not the seven that ship the code. **Group is absent by
 * measurement, not by oversight**: its forcing rung comes from the same shared
 * `latin.ts` as Keen's and Unequal's, but at its first preset's `w = 6` it fires
 * on 0 of 8 seeds at *every one* of its five tiers — a 6-element Cayley table
 * settles before a two-candidate chain can form. Larger boards were not swept
 * because generating them is minutes per seed. Written down rather than left
 * implicit, so a later reader does not add Group back and spend the afternoon
 * wondering why it fails.
 *
 * The list was an assumption before it was a measurement, and the assumption was
 * wrong twice over — it also had Solo, which needs {@link BIGGER_BOARD} below.
 */
const ORDERING_GAMES = new Set([
  "clusters",
  "keen",
  "salad",
  "solo",
  "towers",
  "unequal",
]);

/**
 * Games whose *first preset* is too small to reach a chain, with the preset to
 * use instead.
 *
 * The tier sweep varies difficulty and keeps the first preset's **size**, which
 * is right for the narration guards it is modelled on — but a forcing chain
 * needs a board big enough for two-candidate cells to line up, and Solo's first
 * preset is a 4x4 (`2x2 Trivial`). At 3x3 Extreme it fires on 8 of 8 seeds.
 * Named by preset title rather than hand-written params so the entry cannot
 * drift out of step with what the game actually offers.
 */
const BIGGER_BOARD: Record<string, string> = { solo: "3x3 Extreme" };

/** A palette colour as the `rgb(r, g, b)` label `RecordingDrawing` records. */
function rgbOf(colour: Colour): string {
  const c = (v: number): number => Math.round(v * 255);
  return `rgb(${c(colour[0])}, ${c(colour[1])}, ${c(colour[2])})`;
}

/** The ordinal's colour as that label — computed once, so a game whose palette
 * index drifted would fail rather than quietly match a neighbour.
 *
 * It is `HINT_EVIDENCE`, and by construction rather than by coincidence: the
 * number is an *index into* the evidence, so it is the same role as the evidence
 * outline it numbers rather than a fourth hint colour. */
const ORDINAL_RGB = rgbOf(HINT_EVIDENCE);

/** The leaf preset with this exact title, or undefined. */
function presetTitled<P>(menu: PresetMenu<P>, title: string): P | undefined {
  if (menu.params !== undefined && menu.title === title) return menu.params;
  for (const sub of menu.submenu ?? []) {
    const p = presetTitled(sub, title);
    if (p !== undefined) return p;
  }
  return undefined;
}

/**
 * The ordinals a step declares, or null when it declares none.
 *
 * Reads **any** array field carrying `order`, not `area` specifically: the six
 * Latin games put their chain in `area` because that is their evidence channel,
 * while Clusters has a `chain` field of its own (its links carry the colour the
 * hypothesis would force them to, which no other game has). The invariant is
 * *where a game declares an order it must draw it* — naming one field would make
 * this guard a check on a spelling rather than on the property, which is the
 * shape this repo has now been bitten by five times.
 */
function declaredOrder(highlights: unknown): number[] | null {
  if (typeof highlights !== "object" || highlights === null) return null;
  const orders: number[] = [];
  for (const value of Object.values(highlights)) {
    if (!Array.isArray(value)) continue;
    for (const entry of value) {
      const k = (entry as { order?: unknown } | null)?.order;
      if (typeof k === "number") orders.push(k);
    }
  }
  return orders.length > 0 ? orders : null;
}

describe("an ordered hint chain carries its order to the canvas", () => {
  const sawOrdinals = new Set<string>();

  for (const [name, game] of HINT_GAMES) {
    it(`${name}: every numbered chain is 1..n, and every number is drawn`, () => {
      const contract = game.difficulty;
      const wanted = BIGGER_BOARD[name];
      const override = wanted ? presetTitled(game.presets(), wanted) : undefined;
      if (wanted) {
        expect(override, `${name}: no preset titled "${wanted}"`).toBeDefined();
      }
      const base = override ?? firstLeaf(game.presets());
      // Every tier, not just the first preset: a chain deduction is the
      // *hardest* rung a game has, so the easiest preset is the one place it can
      // never fire.
      const tiers = contract
        ? contract.tiers.map((_t: string, i: number) => contract.withTier(base, i))
        : [base];

      for (const params of tiers) {
        if (game.validateParams(params, true)) continue; // refused at this size
        for (const seed of SEEDS) {
          let desc: string;
          let aux: string | undefined;
          try {
            ({ desc, aux } = game.newDesc(params, randomNew(`${name}-${seed}`)));
          } catch {
            continue; // ungenerable here; difficulty-contract.test.ts owns that
          }
          const res = game.hint?.(game.newState(params, desc), aux);
          if (!res?.ok) continue;

          for (const step of res.steps) {
            const orders = declaredOrder(step.highlights);
            if (!orders) continue;

            // (a) the chain is 1..n, each exactly once.
            expect(
              [...orders].sort((a, b) => a - b),
              `${name}: chain ordinals are not 1..${orders.length}`,
            ).toEqual(orders.map((_o, i) => i + 1));

            // (b) …and the frame actually draws them. Reached through a real
            // Midend so this is the production render path, not a double.
            const scenario = renderScenario({
              game,
              id: `${game.encodeParams(params, true)}#${name}-${seed}`,
              defaultBackground: DEFAULT_BACKGROUND,
              showHint: true,
              hintUntil: (s) => s.explanation === step.explanation,
            });
            // **In the ordinal's own colour.** The first cut asked only whether
            // the *text* "1" reached the canvas, and passed with Keen's ordinal
            // draw deleted outright — because a Keen cell already prints "1" as
            // a pencil mark. It was proved vacuous by removing the wiring and
            // watching it stay green, which is the only way that class of
            // assertion is ever caught. Matching the resolved `rgb` rather than
            // the palette index keeps it off the other proxy: an index is a
            // name for a colour, not the colour.
            //
            // Compared as **sets**, not as a multiset: Towers repaints each tile
            // up to four times inside one clip rect (its 3D towers spill into
            // their neighbours, so a cache miss redraws a 2x2 block and lets the
            // clip trim it), which draws a chain cell's ordinal four times over.
            // That is the renderer working as designed, and the property here is
            // *which numbers are on the board*, not how many draw calls put them
            // there. Set equality still catches both real failures: none drawn,
            // and a number drawn that the chain never declared.
            const drawn = new Set(
              scenario.recording.ops.flatMap((o) =>
                o.op === "text" && o.rgb === ORDINAL_RGB ? [o.text] : [],
              ),
            );
            expect(
              [...drawn].sort(),
              `${name}: the chain's ordinals are not on the canvas — ` +
                `the renderer is not passing OverlaySidecar.order to its tile painter`,
            ).toEqual([...new Set(orders.map(String))].sort());
            sawOrdinals.add(name);
            return; // one confirmed chain per game is the guarantee
          }
        }
      }
    });
  }

  // The "how many did I actually look at?" guard. Without it, a change that
  // stopped every game numbering its chains would leave this file green with
  // zero assertions run — the silent-shrink shape the probe's test-file floor
  // and `touch-input.test.ts`'s registry count both exist to catch.
  it("the set of games that number a chain has not shrunk", () => {
    for (const name of ORDERING_GAMES) {
      expect(sawOrdinals.has(name), `${name} no longer numbers its forcing chain`).toBe(
        true,
      );
    }
  });
});
