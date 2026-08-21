// @vitest-environment happy-dom
//
// Tier-3 component tests for `PuzzleScreen` (see the `repo-layout` spec): the
// Check-&-Save command path — the seam whose symptom path
// (save-when-it-should-not) the wall-mistake bug travelled — the reference-panel
// toggle, focus return, and which board a page opens with. Driven in-process
// under happy-dom with a fake `Puzzle` and mocked dialog/persistence; no worker,
// no canvas, no full render (we invoke the command handlers directly rather than
// mount Web Awesome). Visual/label rendering stays a Playwright smoke-check.
// Provides a fake `indexedDB` global (and the Dexie maxKey shim) so the
// transitive Dexie users in puzzle-screen's import graph (e.g. `settings.ts`)
// open cleanly instead of throwing under happy-dom.
//
// ONE FILE ON PURPOSE. The board-choice tests lived in their own
// `puzzle-screen-load.test.ts` and mocked **the same two modules** —
// `store/saved-games.ts` and `dialogs/alert-dialog.ts` — with *different*
// factories. Under `isolate: false` the module registry is shared per worker, so
// whichever file loaded first won and the other silently got someone else's
// spies: all four Check-&-Save assertions failed with "expected to be called
// once, got 0 times" whenever the pair landed in one worker, which is a green
// commit rejected for where its files happened to be scheduled. Merging is what
// removes the collision; `no-duplicate-module-mocks.test.ts` is what stops the
// next one.
import "../test-setup/indexeddb.ts";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

interface AlertOptions {
  label?: string;
  type?: string;
  message?: unknown;
}

// vi.mock factories are hoisted; share the spies via vi.hoisted.
const {
  showAlert,
  showToast,
  quickSave,
  quickLoad,
  hasQuickSave,
  makeAutoSaveFilename,
  findMostRecentAutoSave,
  restoreAutoSavedGame,
  autoSavedPuzzles,
} = vi.hoisted(() => ({
  showAlert: vi.fn(async (_options: AlertOptions) => undefined),
  showToast: vi.fn((_options: AlertOptions) => undefined),
  quickSave: vi.fn(async () => undefined),
  quickLoad: vi.fn(async () => ({ found: true as boolean, error: undefined })),
  hasQuickSave: vi.fn(() => true),
  makeAutoSaveFilename: vi.fn(() => "autosave-1"),
  findMostRecentAutoSave: vi.fn(async (_id: string) => undefined as string | undefined),
  restoreAutoSavedGame: vi.fn(async () => false),
  autoSavedPuzzles: new Set<string>(),
}));
vi.mock("../dialogs/alert-dialog.ts", () => ({ showAlert }));
vi.mock("../dialogs/toast.ts", () => ({ showToast }));
vi.mock("../store/saved-games.ts", () => ({
  savedGames: {
    quickSave,
    quickLoad,
    hasQuickSave,
    makeAutoSaveFilename,
    findMostRecentAutoSave,
    restoreAutoSavedGame,
    autoSavedPuzzles,
  },
}));

// The settings store is deliberately NOT mocked: the board-choice tests assert
// that a remembered board survives a reload, and a mocked store would assert
// only that this file's own fake was called — the shape of guard this repo keeps
// catching (a check aimed at a neighbour of the thing it claims to check).
import { settings } from "../store/settings.ts";
import { PuzzleScreen } from "./puzzle-screen.ts";

interface CommandHost {
  commandMap: Record<string, (...args: unknown[]) => unknown>;
  handleBubbledKeyDown: (event: KeyboardEvent) => Promise<void> | void;
  handleCommand: (command: string) => boolean;
  handleToolbarClick: (event: MouseEvent) => void;
}

/** Build a screen with a fake puzzle injected, without scheduling a Lit
 * render (shadow the reactive accessors with own properties so no update
 * is requested — there is no render root in this detached element). */
function makeScreen(opts: { canFindMistakes: boolean; mistakeCount: number }) {
  const findMistakes = vi.fn(async () => opts.mistakeCount);
  const selectReference = vi.fn(async () => undefined);
  const solve = vi.fn(async () => undefined);
  const fakePuzzle = {
    puzzleId: "galaxies",
    canFindMistakes: opts.canFindMistakes,
    findMistakes,
    selectReference,
    solve,
  };
  const screen = new PuzzleScreen();
  Object.defineProperty(screen, "puzzle", {
    configurable: true,
    get: () => fakePuzzle,
  });
  Object.defineProperty(screen, "puzzleId", {
    configurable: true,
    writable: true,
    value: "galaxies",
  });
  return {
    screen,
    host: screen as unknown as CommandHost,
    findMistakes,
    selectReference,
    solve,
  };
}

/** Stand a fake board in the screen's shadow root, so we can watch whether a
 * command hands focus back to it. */
function stubBoard(screen: PuzzleScreen) {
  const focus = vi.fn();
  Object.defineProperty(screen, "shadowRoot", {
    configurable: true,
    get: () => ({
      querySelector: (selector: string) =>
        selector === "puzzle-view-interactive" ? { focus } : null,
    }),
  });
  return focus;
}

describe("puzzle-screen: Check-&-Save command", () => {
  beforeEach(() => {
    showAlert.mockClear();
    showToast.mockClear();
    quickSave.mockClear();
    quickLoad.mockClear();
    hasQuickSave.mockClear();
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("saves a clean board (0 mistakes) and confirms with a non-blocking toast", async () => {
    const { host, findMistakes } = makeScreen({
      canFindMistakes: true,
      mistakeCount: 0,
    });
    await host.commandMap["check-and-save"].call(host);
    expect(findMistakes).toHaveBeenCalledOnce();
    expect(quickSave).toHaveBeenCalledOnce();
    // Success is a transient toast, not a modal alert.
    expect(showToast).toHaveBeenCalledOnce();
    expect(showToast.mock.calls[0]?.[0]).toMatchObject({ label: "Checkpoint saved" });
    expect(showAlert).not.toHaveBeenCalled();
  });

  it("refuses to save when mistakes are present, and reports them in a modal", async () => {
    const { host, findMistakes } = makeScreen({
      canFindMistakes: true,
      mistakeCount: 3,
    });
    await host.commandMap["check-and-save"].call(host);
    expect(findMistakes).toHaveBeenCalledOnce();
    expect(quickSave).not.toHaveBeenCalled();
    // A refused save must interrupt — modal, not toast.
    expect(showToast).not.toHaveBeenCalled();
    expect(showAlert).toHaveBeenCalledOnce();
    expect(showAlert.mock.calls[0]?.[0]).toMatchObject({
      label: "Not saved",
      type: "warning",
    });
    // The count and pluralisation reach the message.
    expect(String(showAlert.mock.calls[0]?.[0]?.message)).toContain("3 mistakes found");
  });

  it("on a game without mistake-checking, Check-&-Save is a plain quick-save", async () => {
    const { host, findMistakes } = makeScreen({
      canFindMistakes: false,
      mistakeCount: 99, // ignored — findMistakes must not be consulted
    });
    await host.commandMap["check-and-save"].call(host);
    expect(findMistakes).not.toHaveBeenCalled();
    expect(quickSave).toHaveBeenCalledOnce();
  });

  it("Cmd/Ctrl+S routes to Check-&-Save and suppresses the browser default", async () => {
    const { host } = makeScreen({ canFindMistakes: true, mistakeCount: 0 });
    const event = new KeyboardEvent("keydown", {
      key: "s",
      metaKey: true,
      cancelable: true,
    });
    const prevent = vi.spyOn(event, "preventDefault");
    await host.handleBubbledKeyDown(event);
    expect(prevent).toHaveBeenCalled();
    expect(quickSave).toHaveBeenCalledOnce();
  });
});

describe("puzzle-screen: reference panel toggle command", () => {
  it("toggle-reference flips the panel and keeps the spotlight on close", () => {
    const { screen, host, selectReference } = makeScreen({
      canFindMistakes: false,
      mistakeCount: 0,
    });
    // Shadow the reactive `referenceOpen` with a plain own property so toggling
    // it doesn't schedule a Lit render on this detached element (the same
    // technique makeScreen uses for `puzzle`/`puzzleId`).
    Object.defineProperty(screen, "referenceOpen", {
      configurable: true,
      writable: true,
      value: false,
    });
    const open = () => (screen as unknown as { referenceOpen: boolean }).referenceOpen;

    host.commandMap["toggle-reference"].call(host);
    expect(open()).toBe(true);
    host.commandMap["toggle-reference"].call(host);
    expect(open()).toBe(false);
    // Closing must NOT clear the board spotlight — the mark→close→place flow
    // relies on it persisting (Escape / re-clicking the chip is the clear path).
    expect(selectReference).not.toHaveBeenCalled();
  });
});

describe("puzzle-screen: focus returns to the board after a command", () => {
  // The bug this pins: a command run from the game menu left focus on the menu's
  // trigger button (wa-dropdown puts it back there as it closes), and a command
  // run from the toolbar left focus on its button — so the next keystroke went
  // to the button, not the puzzle. Enter reopened the menu instead of playing.
  // Worst on Inertia, whose route-following aid *is* "Solve, then press Enter",
  // but it swallowed the cursor keys in every keyboard-playable game.

  it("hands focus to the board once the command has run", async () => {
    const { screen, host, solve } = makeScreen({
      canFindMistakes: false,
      mistakeCount: 0,
    });
    const focus = stubBoard(screen);

    expect(host.handleCommand("solve")).toBe(true);
    expect(solve).toHaveBeenCalledOnce();

    // Deferred by a microtask on purpose: wa-dropdown focuses its own trigger
    // the moment our wa-select handler returns, so focusing the board inline
    // would just be overwritten.
    expect(focus).not.toHaveBeenCalled();
    await Promise.resolve();
    expect(focus).toHaveBeenCalledWith({ preventScroll: true });
  });

  it("leaves focus alone when the command isn't one of ours", async () => {
    const { screen, host } = makeScreen({ canFindMistakes: false, mistakeCount: 0 });
    const focus = stubBoard(screen);

    // An unhandled command falls through to the browser (an ordinary link, say),
    // and stealing focus from whatever it does would be wrong.
    expect(host.handleCommand("not-a-command")).toBe(false);
    await Promise.resolve();
    expect(focus).not.toHaveBeenCalled();
  });

  it("hands focus to the board after a toolbar button is clicked", async () => {
    // The toolbar's buttons (undo/redo/hint/mark-all/check-&-save) are wired to
    // their own handlers, not the command bus, so they need their own path.
    const { screen, host } = makeScreen({ canFindMistakes: false, mistakeCount: 0 });
    const focus = stubBoard(screen);

    host.handleToolbarClick(new MouseEvent("click", { detail: 1 }));
    await Promise.resolve();
    expect(focus).toHaveBeenCalledWith({ preventScroll: true });
  });

  it("leaves focus alone when a button was activated from the keyboard", async () => {
    // Tab to the button, press Enter: that arrives as a click with detail 0. The
    // player is walking the tab order on purpose; throwing them out of it onto
    // the board would lose their place.
    const { screen, host } = makeScreen({ canFindMistakes: false, mistakeCount: 0 });
    const focus = stubBoard(screen);

    host.handleToolbarClick(new MouseEvent("click", { detail: 0 }));
    await Promise.resolve();
    expect(focus).not.toHaveBeenCalled();
  });
});

// --- which board a puzzle page opens with -----------------------------------

/** Every board this fake deals gets a distinct id — across instances, not just
 * within one. Two puzzles that each deal "fresh-1" would make "the same board
 * came back" and "a new board was dealt" indistinguishable, which is how the
 * dropped-stale-board test first passed for the wrong reason. */
let dealt = 0;

function makeLoadPuzzle(opts: { rejectId?: (id: string) => string | undefined } = {}) {
  const puzzle = {
    puzzleId: "abcd",
    params: "5x5n4",
    currentGameId: "",
    setPreferences: vi.fn(async () => undefined),
    setParams: vi.fn(async () => undefined),
    newGame: vi.fn(async () => {
      dealt += 1;
      puzzle.currentGameId = `5x5n4:fresh-${dealt}`;
    }),
    newGameFromId: vi.fn(async (id: string) => {
      const error = opts.rejectId?.(id);
      if (error) return error;
      puzzle.currentGameId = id;
      return undefined;
    }),
  };
  return puzzle;
}

type FakeLoadPuzzle = ReturnType<typeof makeLoadPuzzle>;

/** Drive one page load: construct the screen, fire `handlePuzzleLoaded`, then
 * fire the state-change handler the way a dealt game does, so the board is
 * recorded exactly as it is in the app. */
async function load(
  puzzle: FakeLoadPuzzle,
  opts: { gameId?: string; params?: string } = {},
): Promise<void> {
  const screen = new PuzzleScreen() as unknown as {
    gameId?: string;
    params?: string;
    handlePuzzleLoaded: (e: unknown) => Promise<void>;
    handlePuzzleGameStateChange: (e: unknown) => Promise<void>;
  };
  screen.gameId = opts.gameId;
  screen.params = opts.params;
  const event = { detail: { puzzle }, preventDefault: vi.fn() };
  await screen.handlePuzzleLoaded(event);
  // `handlePuzzleGameStateChange` is @debounced(250); awaiting the debounce
  // window would make every test sleep. Record through the same public API it
  // uses instead.
  await settings.setLastGameId(puzzle.puzzleId, puzzle.currentGameId);
}

describe("which board a puzzle page opens with", () => {
  // Scoped to this describe, not the file: the command tests above neither read
  // the settings store nor these spies, and a top-level hook would make each of
  // them pay for a fake-indexeddb round trip.
  beforeEach(async () => {
    await settings.loaded;
    await settings.setLastGameId("abcd", undefined);
    await settings.setParams("abcd", undefined);
    showAlert.mockClear();
    autoSavedPuzzles.clear();
    findMostRecentAutoSave.mockResolvedValue(undefined);
    restoreAutoSavedGame.mockResolvedValue(false);
  });

  it("re-deals the board it last showed, when no move was ever made", async () => {
    const first = makeLoadPuzzle();
    await load(first);
    const board = first.currentGameId;
    expect(board).toMatch(/^5x5n4:fresh-\d+$/);

    const second = makeLoadPuzzle();
    await load(second);

    expect(second.currentGameId).toBe(board);
    expect(second.newGameFromId).toHaveBeenCalledWith(board);
    expect(second.newGame).not.toHaveBeenCalled();
  });

  it("writes no autosave for it, so the home-screen badge stays honest", async () => {
    // The reason this is a settings key and not a `SaveType.Auto` row: the home
    // screen badges "game in progress" off `savedGames.autoSavedPuzzles`.
    const puzzle = makeLoadPuzzle();
    await load(puzzle);
    expect(autoSavedPuzzles.has("abcd")).toBe(false);
  });

  it("prefers an autosave, so a started game is restored rather than re-dealt", async () => {
    const first = makeLoadPuzzle();
    await load(first);

    findMostRecentAutoSave.mockResolvedValue("autosave-1");
    restoreAutoSavedGame.mockResolvedValue(true);
    const second = makeLoadPuzzle();
    await load(second);

    expect(restoreAutoSavedGame).toHaveBeenCalled();
    expect(second.newGameFromId).not.toHaveBeenCalled();
    expect(second.newGame).not.toHaveBeenCalled();
  });

  it("prefers a game id from the URL over the remembered board", async () => {
    const first = makeLoadPuzzle();
    await load(first);

    const second = makeLoadPuzzle();
    await load(second, { gameId: "5x5n4:from-url" });
    expect(second.currentGameId).toBe("5x5n4:from-url");
  });

  it("ignores the remembered board when the URL asks for a type", async () => {
    // A remembered board may not match the requested params, same reasoning as
    // the autosave branch above.
    const first = makeLoadPuzzle();
    await load(first);

    const second = makeLoadPuzzle();
    await load(second, { params: "6x6n4" });
    expect(second.newGameFromId).not.toHaveBeenCalled();
    expect(second.newGame).toHaveBeenCalled();
  });

  it("drops a remembered board this build cannot deal, quietly", async () => {
    const first = makeLoadPuzzle();
    await load(first);
    const stale = first.currentGameId;

    const second = makeLoadPuzzle({
      rejectId: (id) => (id === stale ? "Board size no longer supported" : undefined),
    });
    await load(second);

    // It was tried — without this the rest of the assertions below all hold
    // just as well when the lookup is not performed at all.
    expect(second.newGameFromId).toHaveBeenCalledWith(stale);
    // Dealt a new game rather than refusing to open the puzzle...
    expect(second.newGame).toHaveBeenCalled();
    // ...said nothing about it, because the player never asked for that board...
    expect(showAlert).not.toHaveBeenCalled();
    // ...and forgot it, so the next load does not retry the same failure.
    expect(await settings.getLastGameId("abcd")).not.toBe(stale);
  });

  it("still alerts for a bad game id in the URL, which the player did ask for", async () => {
    const puzzle = makeLoadPuzzle({ rejectId: () => "no such board" });
    await load(puzzle, { gameId: "5x5n4:typo" });
    expect(showAlert).toHaveBeenCalled();
  });
});
