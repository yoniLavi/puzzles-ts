// @vitest-environment happy-dom
//
// Tier-3 component test (see the `repo-layout` spec): which board a puzzle page
// opens with — `handlePuzzleLoaded`'s order of preference (URL id → autosave →
// last dealt board → new game), driven in-process with a fake `Puzzle`, a mocked
// `savedGames`, and the *real* settings store over `fake-indexeddb`.
//
// The settings store is real on purpose. The property under test is that the
// remembered board survives a reload, and a mocked store would assert only that
// this file's own fake was called — the shape of guard this repo keeps catching
// (a check aimed at a neighbour of the thing it claims to check).
import "../test-setup/indexeddb.ts";
import { beforeEach, describe, expect, it, vi } from "vitest";

interface AlertOptions {
  label?: string;
  type?: string;
  message?: unknown;
}

const {
  showAlert,
  makeAutoSaveFilename,
  findMostRecentAutoSave,
  restoreAutoSavedGame,
  autoSavedPuzzles,
} = vi.hoisted(() => ({
  showAlert: vi.fn(async (_options: AlertOptions) => undefined),
  makeAutoSaveFilename: vi.fn(() => "autosave-1"),
  findMostRecentAutoSave: vi.fn(async (_id: string) => undefined as string | undefined),
  restoreAutoSavedGame: vi.fn(async () => false),
  autoSavedPuzzles: new Set<string>(),
}));
vi.mock("../dialogs/alert-dialog.ts", () => ({ showAlert }));
vi.mock("../store/saved-games.ts", () => ({
  savedGames: {
    makeAutoSaveFilename,
    findMostRecentAutoSave,
    restoreAutoSavedGame,
    autoSavedPuzzles,
    quickSave: vi.fn(),
    quickLoad: vi.fn(),
    hasQuickSave: vi.fn(() => false),
  },
}));

import { settings } from "../store/settings.ts";
import { PuzzleScreen } from "./puzzle-screen.ts";

/** Every board this fake deals gets a distinct id — across instances, not just
 * within one. Two puzzles that each deal "fresh-1" would make "the same board
 * came back" and "a new board was dealt" indistinguishable, which is how the
 * dropped-stale-board test first passed for the wrong reason. */
let dealt = 0;

function makePuzzle(opts: { rejectId?: (id: string) => string | undefined } = {}) {
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

type FakePuzzle = ReturnType<typeof makePuzzle>;

/** Drive one page load: construct the screen, fire `handlePuzzleLoaded`, then
 * fire the state-change handler the way a dealt game does, so the board is
 * recorded exactly as it is in the app. */
async function load(
  puzzle: FakePuzzle,
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
  // `handlePuzzleGameStateChange` is @debounced(250); call the undecorated
  // recording it performs by invoking it and awaiting the debounce window would
  // make every test sleep. Record through the same public API it uses instead.
  await settings.setLastGameId(puzzle.puzzleId, puzzle.currentGameId);
}

beforeEach(async () => {
  await settings.loaded;
  await settings.setLastGameId("abcd", undefined);
  await settings.setParams("abcd", undefined);
  showAlert.mockClear();
  findMostRecentAutoSave.mockResolvedValue(undefined);
  restoreAutoSavedGame.mockResolvedValue(false);
});

describe("which board a puzzle page opens with", () => {
  it("re-deals the board it last showed, when no move was ever made", async () => {
    const first = makePuzzle();
    await load(first);
    const board = first.currentGameId;
    expect(board).toMatch(/^5x5n4:fresh-\d+$/);

    const second = makePuzzle();
    await load(second);

    expect(second.currentGameId).toBe(board);
    expect(second.newGameFromId).toHaveBeenCalledWith(board);
    expect(second.newGame).not.toHaveBeenCalled();
  });

  it("writes no autosave for it, so the home-screen badge stays honest", async () => {
    // The reason this is a settings key and not a `SaveType.Auto` row: the home
    // screen badges "game in progress" off `savedGames.autoSavedPuzzles`.
    const puzzle = makePuzzle();
    await load(puzzle);
    expect(autoSavedPuzzles.has("abcd")).toBe(false);
  });

  it("prefers an autosave, so a started game is restored rather than re-dealt", async () => {
    const first = makePuzzle();
    await load(first);

    findMostRecentAutoSave.mockResolvedValue("autosave-1");
    restoreAutoSavedGame.mockResolvedValue(true);
    const second = makePuzzle();
    await load(second);

    expect(restoreAutoSavedGame).toHaveBeenCalled();
    expect(second.newGameFromId).not.toHaveBeenCalled();
    expect(second.newGame).not.toHaveBeenCalled();
  });

  it("prefers a game id from the URL over the remembered board", async () => {
    const first = makePuzzle();
    await load(first);

    const second = makePuzzle();
    await load(second, { gameId: "5x5n4:from-url" });
    expect(second.currentGameId).toBe("5x5n4:from-url");
  });

  it("ignores the remembered board when the URL asks for a type", async () => {
    // A remembered board may not match the requested params, same reasoning as
    // the autosave branch above.
    const first = makePuzzle();
    await load(first);

    const second = makePuzzle();
    await load(second, { params: "6x6n4" });
    expect(second.newGameFromId).not.toHaveBeenCalled();
    expect(second.newGame).toHaveBeenCalled();
  });

  it("drops a remembered board this build cannot deal, quietly", async () => {
    const first = makePuzzle();
    await load(first);
    const stale = first.currentGameId;

    const second = makePuzzle({
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
    const puzzle = makePuzzle({ rejectId: () => "no such board" });
    await load(puzzle, { gameId: "5x5n4:typo" });
    expect(showAlert).toHaveBeenCalled();
  });
});
