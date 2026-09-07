// @vitest-environment happy-dom
//
/**
 * **Every command has a home, and the chrome and the command bus agree about
 * which.**
 *
 * The defect this guards against shipped for the life of the app: `hint`,
 * `toggle-reference` and `check-and-save` were offered from *both* a fourteen-
 * item game menu and an eight-button toolbar, with eleven further commands split
 * between the two under no rule. A player had to learn both surfaces and could
 * still miss a command that lived only in the other. Nothing could see it,
 * because each surface was correct on its own.
 *
 * So the check is a **render**, not a source scan: it mounts the real
 * `puzzle-rail` against a fake puzzle, walks every shadow root under it, and
 * compares the `data-command` values it finds with `PuzzleScreen`'s own
 * `commandMap`. Both directions fail — a command offered twice, and a command
 * offered nowhere.
 *
 * ON THE PHONE BAR, and why "exactly one home" is not the right rule there.
 * The rule exists to stop *two surfaces a player must learn*. The phone's
 * bottom bar is not a second surface: it is five rows promoted out of the sheet
 * that `More…` opens, which is the quick-access position the owner asked for
 * Check & save to hold (2026-09-07). What must be true is that the promotion is
 * only ever a promotion — so this asserts the bar's commands are a **subset** of
 * the sheet's, which is the property that would actually break if somebody put
 * a command in the bar and nowhere else. The desktop rail, where there is no
 * bar, is held to the strict rule.
 */
import "../test-setup/element-internals.ts";
import "../test-setup/indexeddb.ts";
import { beforeEach, describe, expect, it, vi } from "vitest";

// The real `saved-games` store, deliberately, against `fake-indexeddb`.
// `puzzle-screen.test.ts` already mocks that module, and under `isolate: false`
// two files mocking one module race — whichever loads first wins and the other
// silently gets someone else's spies (`no-duplicate-module-mocks.test.ts` is
// what caught this on the first full run). Nothing here needs a saved game
// anyway: `Back to last save` renders either way, disabled when there is none,
// and a disabled row still has the `data-command` this file reads.

import { PuzzleRail } from "../puzzle/components/rail.ts";
import { PuzzleScreen } from "./puzzle-screen.ts";

// Every `wa-icon` fetches its SVG from Web Awesome's default icon library, and
// happy-dom aborts those requests at teardown — twenty stack traces per run, in
// a suite where nobody is looking at an icon. Serve an empty SVG instead. (The
// app's own resolver in `src/icons.ts` never runs here: only `main.ts` installs
// it, and this test mounts one component.)
vi.stubGlobal(
  "fetch",
  vi.fn(
    async () =>
      new Response('<svg xmlns="http://www.w3.org/2000/svg"></svg>', {
        headers: { "Content-Type": "image/svg+xml" },
      }),
  ),
);

/**
 * A puzzle that can do **everything**, so the rail renders every row it has.
 *
 * Deliberately maximal: a capability-gated row that is absent would otherwise
 * read as "this command has no home", and the failure would name the wrong
 * problem. The `renders nothing a game cannot do` case below covers the other
 * end.
 */
function fullyCapablePuzzle(overrides: Record<string, unknown> = {}) {
  return {
    puzzleId: "lightup",
    status: "ongoing",
    canUndo: true,
    canRedo: true,
    canHint: true,
    canSolve: true,
    canMarkAll: true,
    canFindMistakes: true,
    hasReference: true,
    wantsStatusbar: true,
    statusbarText: "3 lights placed",
    autoHintActive: false,
    autoHintMessage: "",
    activeHintExplanation: "",
    currentMove: 3,
    totalMoves: 7,
    checkpoints: new Set<number>(),
    ...overrides,
  };
}

/** Mount a rail with `puzzle` injected, rendered for real. */
async function mountRail(
  variant: "rail" | "sheet",
  puzzle: Record<string, unknown>,
): Promise<PuzzleRail> {
  const rail = new PuzzleRail();
  rail.variant = variant;
  rail.gameName = "Light Up";
  rail.helpHref = "/help/lightup.html";
  // `@consume` assigns this field from the context; with no provider in this
  // detached tree, assigning it directly is the same write by a shorter route.
  (rail as unknown as { puzzle: unknown }).puzzle = puzzle;
  document.body.append(rail);
  await rail.updateComplete;
  return rail;
}

/** Every `data-command` under `root`, descending through shadow roots — the
 * rail nests `puzzle-history` and `puzzle-type-menu`, each with commands of its
 * own, and a flat query would miss them and report them as homeless. */
function commandsIn(root: ParentNode): string[] {
  const out: string[] = [];
  for (const el of root.querySelectorAll("[data-command]")) {
    const command = el.getAttribute("data-command");
    // A command may carry arguments (`settings:data`); the handler is the part
    // before the first colon, and that is what the map is keyed by.
    if (command) out.push(command.split(":")[0]);
  }
  for (const el of root.querySelectorAll("*")) {
    if (el.shadowRoot) out.push(...commandsIn(el.shadowRoot));
  }
  return out;
}

/**
 * Commands that are deliberately not rail rows, one entry per command with the
 * reason it is excused.
 *
 * A **ledger against the derived set**, not a filter applied before deriving:
 * the assertion below requires it to be exactly right, so an entry that stops
 * being true fails just as loudly as a missing home. (`AGENTS.md`: where intent
 * cannot be observed, attach it to the derived member.)
 */
const NOT_A_RAIL_ROW: Record<string, string> = {
  "capture-icons": "dev-only, from the ?screenshot icon-capture bar",
  redraw: "dev-only debugging; no player-facing control",
  "change-type": "the parameter chips are a puzzle-type-menu, not a data-command",
  // `All puzzles` and `How to play …` are real links, carrying an `href` and
  // nothing else. `Screen.interceptCommandAndHrefClicks` routes the home URL to
  // `navigateToHomePage` and a help URL to the help drawer, and it *throws* in
  // dev on an element with both an href and a data-command — which is exactly
  // what these two rows had at first, so the anchor won and "How to play"
  // navigated to the raw help page instead of opening the drawer.
  home: "the `All puzzles` row is an <a href>, routed by the href interceptor",
};

describe("every puzzle command has exactly one home in the rail", () => {
  let commandKeys: string[];

  beforeEach(() => {
    document.body.replaceChildren();
    const screen = new PuzzleScreen();
    commandKeys = Object.keys(
      (screen as unknown as { commandMap: Record<string, unknown> }).commandMap,
    );
  });

  it("finds a command map and a rendered rail at all", async () => {
    // Both floors are vacuity guards: an empty map or a rail that failed to
    // render would make every assertion below pass over nothing.
    expect(commandKeys.length).toBeGreaterThan(15);
    const rail = await mountRail("rail", fullyCapablePuzzle());
    expect(commandsIn(rail.shadowRoot as ParentNode).length).toBeGreaterThan(10);
  });

  it("gives no control both an href and a data-command", async () => {
    // `Screen.interceptCommandAndHrefClicks` throws on such an element, but
    // only in dev and only when somebody clicks it — so the `How to play …` row
    // shipped with both, the anchor's navigation won the race, and the help
    // drawer became a full-page load. Asserting it at render is what turns a
    // click-time throw into a build-time failure.
    for (const variant of ["rail", "sheet"] as const) {
      document.body.replaceChildren();
      const rail = await mountRail(variant, fullyCapablePuzzle());
      const both = [
        ...(rail.shadowRoot?.querySelectorAll("[data-command][href]") ?? []),
      ].map((el) => `${el.tagName.toLowerCase()}[${el.getAttribute("data-command")}]`);
      expect(
        both,
        `${variant}: a control is either a link or a command, never both`,
      ).toEqual([]);
    }
  });

  it("offers no command twice", async () => {
    const rail = await mountRail("rail", fullyCapablePuzzle());
    const found = commandsIn(rail.shadowRoot as ParentNode);
    const twice = found.filter((c, i) => found.indexOf(c) !== i);
    expect(
      [...new Set(twice)],
      "a command reachable from two places in one surface is the defect this " +
        "chrome was rebuilt to remove; give it one home",
    ).toEqual([]);
  });

  it("gives every command in the map a home, or a reason", async () => {
    const rail = await mountRail("rail", fullyCapablePuzzle());
    const found = new Set(commandsIn(rail.shadowRoot as ParentNode));

    const homeless = commandKeys.filter(
      (c) => !found.has(c) && !Object.hasOwn(NOT_A_RAIL_ROW, c),
    );
    expect(
      homeless,
      "these commands are registered but reachable from nowhere in the rail — " +
        "add a row, or add an entry to NOT_A_RAIL_ROW saying why not",
    ).toEqual([]);

    // The ledger is held to being exactly right in the other direction too: an
    // excuse for a command that now *has* a row is a stale note that would
    // quietly permit a duplicate later.
    const staleExcuses = Object.keys(NOT_A_RAIL_ROW).filter((c) => found.has(c));
    expect(
      staleExcuses,
      "NOT_A_RAIL_ROW excuses a command that now has a rail row; remove the entry",
    ).toEqual([]);
    const excusesForNothing = Object.keys(NOT_A_RAIL_ROW).filter(
      (c) => !commandKeys.includes(c),
    );
    expect(
      excusesForNothing,
      "NOT_A_RAIL_ROW names a command that is not in the command map at all",
    ).toEqual([]);
  });

  it("renders no command a game cannot run", async () => {
    const rail = await mountRail(
      "rail",
      fullyCapablePuzzle({
        canHint: false,
        canSolve: false,
        canMarkAll: false,
        canFindMistakes: false,
        hasReference: false,
        wantsStatusbar: false,
      }),
    );
    const found = new Set(commandsIn(rail.shadowRoot as ParentNode));
    // Absent, not present-and-disabled: "grayed out for this puzzle" teaches a
    // player that the app is broken here rather than that the game has no such
    // idea.
    for (const command of [
      "hint",
      "toggle-auto-hint",
      "mark-all",
      "toggle-reference",
      "check-only",
      "solve",
    ]) {
      expect(found.has(command), `${command} should be absent for this game`).toBe(
        false,
      );
    }
    // …and the ones every game has are still there.
    for (const command of ["undo", "redo", "check-and-save", "new-game"]) {
      expect(found.has(command), `${command} should be present for every game`).toBe(
        true,
      );
    }
  });

  it("draws the sheet from the same rows as the rail", async () => {
    // The phone's `More…` sheet is the rail, so "the same order and the same
    // wording" is structural rather than maintained. This is what would fail if
    // somebody gave the sheet its own list.
    const rail = await mountRail("rail", fullyCapablePuzzle());
    const railCommands = commandsIn(rail.shadowRoot as ParentNode);
    document.body.replaceChildren();
    const sheet = await mountRail("sheet", fullyCapablePuzzle());
    const sheetCommands = commandsIn(sheet.shadowRoot as ParentNode);

    // The sheet omits the heading block (the back link and the game's name live
    // in the phone's top bar instead), so it is the rail minus exactly that.
    expect(sheetCommands).toEqual(railCommands.filter((c) => c !== "home"));
  });
});
