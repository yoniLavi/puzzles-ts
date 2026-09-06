/**
 * Cross-game guarantee: **the Mark-all press only ever adds or removes pencil
 * marks — it never resets them.**
 *
 * This exists because the collection shipped the opposite for months and nothing
 * caught it. Every `pencilAll` implementation filled *every* empty cell with the
 * full candidate set, so pressing Mark-all (or asking for a hint, whose opener
 * reuses the same move) on a board with **some** narrowed cells and **some** blank
 * ones threw away the player's own deductions. It went unnoticed because the
 * usual latch — "does any empty cell lack notes?" — hides it whenever every empty
 * cell already has at least one note, which is the common case; you only see it on
 * the mixed board. Owner-reported on Salad, twice (the hint's opener, then the
 * button), and then fixed across all ten games that offer the press.
 *
 * The properties pinned here are deliberately representation-agnostic — each game
 * only says *where* its notes live — so a new game with a Mark-all press joins by
 * adding one row.
 */
import { beforeAll, describe, expect, it } from "vitest";
import { abcdGame } from "../games/abcd/index.ts";
import { groupGame } from "../games/group/index.ts";
import { registerAllGames } from "../games/index.ts";
import { keenGame } from "../games/keen/index.ts";
import { mathraxGame } from "../games/mathrax/index.ts";
import { saladGame } from "../games/salad/index.ts";
import { seismicGame } from "../games/seismic/index.ts";
import { soloGame } from "../games/solo/index.ts";
import { towersGame } from "../games/towers/index.ts";
import { undeadGame } from "../games/undead/index.ts";
import { unequalGame } from "../games/unequal/index.ts";
import { UI_UPDATE } from "./game.ts";
import { randomNew } from "./random/index.ts";
import { getTsGame, registeredGameIds } from "./registry.ts";
import { type AnyGame, firstLeaf } from "./testing/hint-games.ts";
import { sizedDrawState } from "./testing/sized-draw-state.ts";

// Registers every ported game; `beforeAll` re-runs it in case a sibling file
// reset the shared registry under `isolate: false`.
beforeAll(registerAllGames);

/** Where a game keeps its pencil marks, and how many array slots one cell owns
 * (ABCD's notes are a candidate *cube*: `n` contiguous slots per cell — see its
 * `cuboid(x, y, i, n, w) = i + x*n + y*n*w`). */
interface Row {
  name: string;
  game: AnyGame;
  // biome-ignore lint/suspicious/noExplicitAny: a deliberately game-agnostic probe.
  notes: (state: any) => Int32Array | Uint8Array | Uint16Array;
  // biome-ignore lint/suspicious/noExplicitAny: params shape differs per game.
  slots?: (params: any) => number;
}

/** Every game answering `canMarkAll`. */
const MARK_ALL_GAMES: Row[] = [
  { name: "towers", game: towersGame, notes: (s) => s.pencil },
  { name: "keen", game: keenGame, notes: (s) => s.pencil },
  { name: "unequal", game: unequalGame, notes: (s) => s.pencil },
  { name: "solo", game: soloGame, notes: (s) => s.pencil },
  { name: "group", game: groupGame, notes: (s) => s.pencil },
  { name: "mathrax", game: mathraxGame, notes: (s) => s.marks },
  { name: "seismic", game: seismicGame, notes: (s) => s.marks },
  { name: "salad", game: saladGame, notes: (s) => s.marks },
  { name: "undead", game: undeadGame, notes: (s) => s.pencils },
  { name: "abcd", game: abcdGame, notes: (s) => s.pencil, slots: (p) => p.n },
];

it("every game offering the press is enrolled here", () => {
  /*
   * **Both directions, and both derived from the registry.** The miss worth
   * catching is a game that ships `canMarkAll` with no row here, because that
   * game is silently unguarded by every property below — and it is precisely the
   * game a loop over `MARK_ALL_GAMES` never visits. An enrollment check that
   * reads only the enrollment list is a statement about the list, not about the
   * collection.
   */
  const offering = registeredGameIds()
    .filter((id) => getTsGame(id)?.canMarkAll === true)
    .sort();
  // Vacuity: an empty registry would make both comparisons below trivially true.
  expect(offering.length).toBeGreaterThan(5);

  const enrolled = MARK_ALL_GAMES.map((r) => r.name).sort();
  expect(enrolled, "a game ships Mark-all with no row here — it is unguarded").toEqual(
    offering,
  );
});

it("every game declaring the press answers it, and no other game does", () => {
  /*
   * **The declaration held to the behavior**, which the check above does not do:
   * it compares the roster with the flag, so a flag that lies agrees with a
   * roster that repeats the lie. `canMarkAll` decides whether the toolbar shows
   * a Mark-all button (`components/history.ts`), so a game declaring it without
   * answering `M` ships a dead button, and a game answering `M` without
   * declaring it hides a press it handles.
   *
   * This is `Game.ignoresSecondaryButton`'s pattern — derive the fact, hold the
   * declaration to it (`input-parity.test.ts`) — applied to the last of the
   * contract's three boolean declarations.
   *
   * Probed through `interpretMove` rather than the midend, and that distinction
   * is load-bearing: `Midend.processInput` reports a bare `UI_UPDATE` as
   * consumed, and Ascent returns one for *any* button landing inside its grid,
   * so the midend route names eleven games where ten offer the press.
   */
  const ids = registeredGameIds().sort();
  expect(ids.length, "an empty registry would agree with anything").toBeGreaterThan(50);

  const declared: string[] = [];
  const answers: string[] = [];
  for (const id of ids) {
    const game = getTsGame(id) as AnyGame | undefined;
    if (!game) continue;
    if (game.canMarkAll === true) declared.push(id);
    const params = firstLeaf(game.presets());
    const { desc } = game.newDesc(params, randomNew(`mark-all-${id}`));
    const state = game.newState(params, desc);
    const move = game.interpretMove(
      state,
      game.newUi(state),
      sizedDrawState(game, state),
      { x: 0, y: 0 },
      77, // 'M', exactly what the toolbar button injects.
    );
    if (move !== null && move !== UI_UPDATE) answers.push(id);
  }
  expect(
    answers.length,
    "no game answered M — the probe found nothing",
  ).toBeGreaterThan(5);
  expect(
    answers,
    "canMarkAll disagrees with what the game does with an 'M' press — a " +
      "declared game with no answer ships a dead toolbar button, and an " +
      "undeclared one hides a press it handles",
  ).toEqual(declared);
});

/** Press `M` — ASCII **77**, exactly what the toolbar button injects
 * (`puzzle-history.ts` `handleMarkAll`) — and apply whatever it asks for. Returns
 * the new state, or `null` when the press is a true no-op.
 *
 * Uppercase matters: Group intercepts only `'M'`, because lowercase `'m'` is its
 * element 13 for `w >= 13`. Probing with 109 there enters a value instead. */
function press(
  row: Row,
  // biome-ignore lint/suspicious/noExplicitAny: game-agnostic probe.
  state: any,
  // biome-ignore lint/suspicious/noExplicitAny: game-agnostic probe.
  ui: any,
  // biome-ignore lint/suspicious/noExplicitAny: game-agnostic probe.
): any | null {
  const move = row.game.interpretMove(
    state,
    ui,
    sizedDrawState(row.game, state),
    { x: 0, y: 0 },
    77,
  );
  if (move === null || move === UI_UPDATE) return null;
  return row.game.executeMove(state, move);
}

// biome-ignore lint/suspicious/noExplicitAny: game-agnostic probe.
function board(row: Row, seed: string): { state: any; ui: any; params: any } {
  const params = firstLeaf(row.game.presets());
  const { desc } = row.game.newDesc(params, randomNew(seed));
  const state = row.game.newState(params, desc);
  return { state, ui: row.game.newUi(state), params };
}

describe("the Mark-all press converges", () => {
  for (const row of MARK_ALL_GAMES) {
    it(`${row.name}: repeated presses reach a true no-op`, () => {
      // Fill, then clean, then nothing — a further press must add no undo entry
      // at all rather than re-applying a move that changes nothing.
      const { state, ui } = board(row, `markall-${row.name}`);
      let cur = state;
      let presses = 0;
      for (; presses < 6; presses++) {
        const next = press(row, cur, ui);
        if (next === null) break;
        cur = next;
      }
      expect(presses, `${row.name}: did not converge`).toBeLessThan(6);
      expect(press(row, cur, ui)).toBeNull();
    });
  }
});

/** Remove exactly one candidate from cell `cell`, leaving at least one behind —
 * i.e. *narrow* it, the way a player crossing out a note does. Reports whether
 * the cell had two candidates to narrow between. Handles both note shapes: a
 * bitmask in one slot, or ABCD's one-flag-per-slot cube. */
function narrowOne(
  notes: Int32Array | Uint8Array | Uint16Array,
  cell: number,
  slots: number,
): boolean {
  if (slots === 1) {
    const v = notes[cell];
    if (v === 0 || (v & (v - 1)) === 0) return false; // needs two candidates
    notes[cell] = v & (v - 1); // clear the lowest set bit
    return true;
  }
  const set: number[] = [];
  for (let k = 0; k < slots; k++) if (notes[cell + k]) set.push(k);
  if (set.length < 2) return false;
  notes[cell + set[0]] = 0;
  return true;
}

describe("the Mark-all press never resets a note the player narrowed", () => {
  for (const row of MARK_ALL_GAMES) {
    it(`${row.name}: a fill leaves every already-noted cell bit-for-bit alone`, () => {
      const { state, ui, params } = board(row, `narrow-${row.name}`);

      // Run the press to convergence, so every fillable cell carries notes.
      let cur = state;
      for (let i = 0; i < 6; i++) {
        const next = press(row, cur, ui);
        if (next === null) break;
        cur = next;
      }

      // Reproduce the reported board: one cell **narrowed** by hand, a *different*
      // one blank, so the press has something to fill and something to spare.
      //
      // Poking the arrays directly is deliberate. The point is to build the state
      // shape, not the route to it — the per-cell pencil toggle differs in every
      // game, and `cur` is a fresh clone from `executeMove`, so nothing shared is
      // mutated. Note the *narrowing* is what makes this test bite: with no
      // narrowed cell, a resetting fill writes back exactly what was there and the
      // bug hides (which it did in the first cut of this test — Towers has no
      // givens, so its clean press strikes nothing and every cell keeps its full
      // candidate set).
      const slots = row.slots?.(params) ?? 1;
      const notes = row.notes(cur);
      let narrowed = -1;
      for (let i = 0; i + slots <= notes.length; i += slots) {
        if (narrowOne(notes, i, slots)) {
          narrowed = i;
          break;
        }
      }
      expect(
        narrowed,
        `${row.name}: no cell had two candidates to narrow between`,
      ).toBeGreaterThanOrEqual(0);

      let blank = -1;
      for (let i = 0; i + slots <= notes.length; i += slots) {
        if (i === narrowed) continue;
        let any = false;
        for (let k = 0; k < slots; k++) if (notes[i + k] !== 0) any = true;
        if (any) {
          blank = i;
          break;
        }
      }
      expect(
        blank,
        `${row.name}: no second noted cell to blank`,
      ).toBeGreaterThanOrEqual(0);
      for (let k = 0; k < slots; k++) notes[blank + k] = 0;
      const before = Array.from(notes);

      const after = press(row, cur, ui);
      expect(
        after,
        `${row.name}: the press did not refill the blank cell`,
      ).not.toBeNull();
      const filled = Array.from(row.notes(after));

      // The blank cell is filled again…
      expect(
        filled.slice(blank, blank + slots).some((v) => v !== 0),
        `${row.name}: the note-less cell was not refilled`,
      ).toBe(true);
      // …and every other cell is untouched — in particular the narrowed one keeps
      // the candidate it lost. This is the whole regression: a resetting fill
      // widens every narrowed cell back to its full set.
      for (let i = 0; i < before.length; i++) {
        if (i >= blank && i < blank + slots) continue;
        expect(
          filled[i],
          `${row.name}: the fill changed an already-noted cell at index ${i}`,
        ).toBe(before[i]);
      }
    });
  }
});
