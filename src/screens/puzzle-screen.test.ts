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
}

/** Build a screen with a fake puzzle injected, without scheduling a Lit
 * render (shadow the reactive accessors with own properties so no update
 * is requested — there is no render root in this detached element). */
function makeScreen(opts: { canFindMistakes: boolean; mistakeCount: number }) {
  const findMistakes = vi.fn(async () => opts.mistakeCount);
  const selectReference = vi.fn(async () => undefined);
  const fakePuzzle = {
    puzzleId: "galaxies",
    canFindMistakes: opts.canFindMistakes,
    findMistakes,
    selectReference,
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
  };
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
