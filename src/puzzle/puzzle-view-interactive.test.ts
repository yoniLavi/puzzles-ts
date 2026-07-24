// @vitest-environment happy-dom
//
// Tier-3 component tests for the input layer above the C-vs-TS engine seam.
//
// 1. Cmd/Ctrl+C is a deliberate "copy the board as an image" shortcut. It must
//    step aside when the user has a real text selection (e.g. the hint banner),
//    so the browser's native text copy can run instead. `wantsKeyEvent` is the
//    guard that decides whether the puzzle claims the keystroke.
// 2. Every press delivered to a puzzle is followed by exactly one release, even
//    when the release beats the press's round-trip to the engine. That ordering
//    lives entirely in this component, so a tier-1 engine test cannot see it.
import { afterEach, describe, expect, it, vi } from "vitest";
// The component's import chain opens a Dexie database at module load; give it a
// fake IndexedDB so happy-dom doesn't reject on the missing API.
import "../test-setup/indexeddb.ts";
import "./puzzle-view-interactive.ts";
import type { PuzzleViewInteractive } from "./puzzle-view-interactive.ts";
import { PuzzleButton } from "./types.ts";

function makeView(): PuzzleViewInteractive {
  return document.createElement("puzzle-view-interactive") as PuzzleViewInteractive;
}

function stubSelection(text: string): void {
  vi.spyOn(window, "getSelection").mockReturnValue({
    isCollapsed: text.length === 0,
    toString: () => text,
  } as unknown as Selection);
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("wantsKeyEvent copy handling", () => {
  // `hasCtrlKey` resolves the platform copy modifier (Cmd on Apple, Ctrl
  // elsewhere); the test environment is non-Apple, so assert with `ctrlKey`.
  it("does NOT claim Ctrl/Cmd+C while text is selected", () => {
    const view = makeView();
    stubSelection("Clue 7 can only reach its 7 cells...");
    expect(
      view.wantsKeyEvent(new KeyboardEvent("keydown", { key: "c", ctrlKey: true })),
    ).toBe(false);
    expect(view.wantsKeyEvent(new KeyboardEvent("keydown", { key: "Copy" }))).toBe(
      false,
    );
  });

  it("claims Ctrl/Cmd+C (copy-as-image) when there is no selection", () => {
    const view = makeView();
    stubSelection("");
    expect(
      view.wantsKeyEvent(new KeyboardEvent("keydown", { key: "c", ctrlKey: true })),
    ).toBe(true);
    expect(view.wantsKeyEvent(new KeyboardEvent("keydown", { key: "Copy" }))).toBe(
      true,
    );
  });

  it("treats a whitespace-only selection as no selection", () => {
    const view = makeView();
    stubSelection("   \n  ");
    expect(
      view.wantsKeyEvent(new KeyboardEvent("keydown", { key: "c", ctrlKey: true })),
    ).toBe(true);
  });

  it("still claims non-copy puzzle keys regardless of selection", () => {
    const view = makeView();
    stubSelection("some selected hint text");
    // Arrow keys drive the puzzle cursor and are unaffected by the copy guard.
    expect(view.wantsKeyEvent(new KeyboardEvent("keydown", { key: "ArrowLeft" }))).toBe(
      true,
    );
  });
});

// --- press/release delivery -------------------------------------------------

/** The private pointer handlers, reached without going through Lit's render. */
interface PointerHost {
  handlePointerDown(event: PointerEvent): Promise<void>;
  handlePointerUp(event: PointerEvent): Promise<void>;
  handlePointerCancel(event: PointerEvent): Promise<void>;
}

/** A mouse `PointerEvent`, minus everything these handlers never read. */
function pointerEvent(type: string, overrides: Record<string, unknown> = {}) {
  return {
    type,
    pointerId: 1,
    pointerType: "mouse",
    isPrimary: true,
    button: 0,
    buttons: type === "pointerdown" ? 1 : 0,
    clientX: 40,
    clientY: 40,
    ctrlKey: false,
    metaKey: false,
    shiftKey: false,
    ...overrides,
  } as unknown as PointerEvent;
}

/**
 * A view wired to a fake puzzle whose press round-trip resolves only when the
 * test says so — that pending window is exactly where the release used to be
 * dropped. Returns the buttons the puzzle actually received, in order.
 */
function makePointerView(consumed = true) {
  const received: number[] = [];
  let releasePress: (() => void) | undefined;
  const pressLanded = new Promise<void>((resolve) => {
    releasePress = resolve;
  });

  const puzzle = {
    processMouse: vi.fn(async (_location: unknown, button: number) => {
      received.push(button);
      if (button === PuzzleButton.LEFT_BUTTON) await pressLanded;
      return consumed;
    }),
  };
  const canvas = {
    getBoundingClientRect: () => ({ left: 0, top: 0 }),
    setPointerCapture: vi.fn(),
    hasPointerCapture: () => false,
    releasePointerCapture: vi.fn(),
  };

  const view = makeView();
  Object.defineProperty(view, "puzzle", { value: puzzle, writable: true });
  Object.defineProperty(view, "canvas", { value: canvas, writable: true });

  return {
    host: view as unknown as PointerHost,
    received,
    // Let the press reach `processMouse` and park there.
    inFlight: async () => {
      await Promise.resolve();
      await Promise.resolve();
    },
    answerPress: () => releasePress?.(),
  };
}

describe("press/release delivery", () => {
  it("delivers the release of a click that beat the press round-trip", async () => {
    // The regression: `pointerup` used to arrive before `pointerTracking` was
    // installed, find nothing to match, and be dropped — so the puzzle kept
    // showing press-only state (Spokes' green hub rim) until the next input.
    const { host, received, inFlight, answerPress } = makePointerView();

    const down = host.handlePointerDown(pointerEvent("pointerdown"));
    await inFlight();
    expect(received).toEqual([PuzzleButton.LEFT_BUTTON]);

    await host.handlePointerUp(pointerEvent("pointerup"));
    answerPress();
    await down;

    expect(received).toEqual([PuzzleButton.LEFT_BUTTON, PuzzleButton.LEFT_RELEASE]);
  });

  it("delivers a cancel that beat the press round-trip", async () => {
    const { host, received, inFlight, answerPress } = makePointerView();

    const down = host.handlePointerDown(pointerEvent("pointerdown"));
    await inFlight();
    await host.handlePointerCancel(pointerEvent("pointercancel"));
    answerPress();
    await down;

    // `cancelPointerTracking` sends the drag out of bounds, then the release.
    expect(received).toEqual([
      PuzzleButton.LEFT_BUTTON,
      PuzzleButton.LEFT_DRAG,
      PuzzleButton.LEFT_RELEASE,
    ]);
  });

  it("delivers exactly one release for an ordinary press-then-release", async () => {
    const { host, received, answerPress } = makePointerView();

    answerPress(); // press round-trip completes immediately
    await host.handlePointerDown(pointerEvent("pointerdown"));
    await host.handlePointerUp(pointerEvent("pointerup"));
    // A stray second release (e.g. a replayed one) must not reach the puzzle.
    await host.handlePointerUp(pointerEvent("pointerup"));

    expect(received).toEqual([PuzzleButton.LEFT_BUTTON, PuzzleButton.LEFT_RELEASE]);
  });

  it("still releases immediately when the puzzle declines the press", async () => {
    const { host, received, inFlight, answerPress } = makePointerView(false);

    const down = host.handlePointerDown(pointerEvent("pointerdown"));
    await inFlight();
    await host.handlePointerUp(pointerEvent("pointerup"));
    answerPress();
    await down;

    // The declined path's own release is the one and only one.
    expect(received).toEqual([PuzzleButton.LEFT_BUTTON, PuzzleButton.LEFT_RELEASE]);
  });

  it("ignores a release from an unrelated pointer during the round-trip", async () => {
    const { host, received, inFlight, answerPress } = makePointerView();

    const down = host.handlePointerDown(pointerEvent("pointerdown"));
    await inFlight();
    await host.handlePointerUp(pointerEvent("pointerup", { pointerId: 7 }));
    answerPress();
    await down;

    expect(received).toEqual([PuzzleButton.LEFT_BUTTON]);
  });
});
