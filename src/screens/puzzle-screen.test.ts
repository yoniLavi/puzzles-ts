// @vitest-environment happy-dom
//
// Tier-3 component test (see the `repo-layout` spec): the Check-&-Save
// command path — the seam whose symptom path (save-when-it-should-not)
// the wall-mistake bug travelled. Driven in-process under happy-dom with
// a fake `Puzzle` and mocked dialog/persistence; no worker, no canvas, no
// full render (we invoke the command handler directly rather than mount
// Web Awesome). Visual/label rendering stays a Playwright smoke-check.
// Provides a fake `indexedDB` global (and the Dexie maxKey shim) so the
// transitive Dexie users in puzzle-screen's import graph (e.g.
// `settings.ts`) open cleanly instead of throwing under happy-dom.
import "../test-setup/indexeddb.ts";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

interface AlertOptions {
  label?: string;
  type?: string;
  message?: unknown;
}

// vi.mock factories are hoisted; share the spies via vi.hoisted.
const { showAlert, showToast, quickSave, quickLoad, hasQuickSave } = vi.hoisted(() => ({
  showAlert: vi.fn(async (_options: AlertOptions) => undefined),
  showToast: vi.fn((_options: AlertOptions) => undefined),
  quickSave: vi.fn(async () => undefined),
  quickLoad: vi.fn(async () => ({ found: true as boolean, error: undefined })),
  hasQuickSave: vi.fn(() => true),
}));
vi.mock("../dialogs/alert-dialog.ts", () => ({ showAlert }));
vi.mock("../dialogs/toast.ts", () => ({ showToast }));
vi.mock("../store/saved-games.ts", () => ({
  savedGames: { quickSave, quickLoad, hasQuickSave },
}));

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
