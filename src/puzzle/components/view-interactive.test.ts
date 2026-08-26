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
import "../../test-setup/indexeddb.ts";
import "./view-interactive.ts";
import { PuzzleButton } from "../../engine/types.ts";
import type { PuzzleViewInteractive } from "./view-interactive.ts";

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
  handlePointerMove(event: PointerEvent): Promise<void>;
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
function makePointerView(consumed = true, canvasOrigin = { left: 0, top: 0 }) {
  const received: number[] = [];
  const locations: { x: number; y: number }[] = [];
  let releasePress: (() => void) | undefined;
  const pressLanded = new Promise<void>((resolve) => {
    releasePress = resolve;
  });

  const puzzle = {
    processMouse: vi.fn(async (location: { x: number; y: number }, button: number) => {
      received.push(button);
      locations.push(location);
      if (button === PuzzleButton.LEFT_BUTTON) await pressLanded;
      return consumed;
    }),
  };
  const canvas = {
    getBoundingClientRect: () => canvasOrigin,
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
    locations,
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

// --- Escape delivery --------------------------------------------------------

/**
 * Escape is the collection's "put it back down" key, and it used to be a **dead
 * key**: `handleKeyEvent` swallowed it whether or not there was a gesture to
 * cancel, so Pearl's and Rectangles' `button === 27` arms — both shipped, both
 * intended to abandon a keyboard drag — could never run.
 *
 * The two arms are asserted separately because they are genuinely different
 * jobs, and collapsing them is how the bug came back: with a pointer down,
 * Escape abandons *that gesture* and the puzzle hears a release, so it must not
 * also arrive as a keypress.
 */
describe("Escape delivery", () => {
  function makeKeyView() {
    const keys: number[] = [];
    const mouse: number[] = [];
    const puzzle = {
      processKey: vi.fn(async (button: number) => {
        keys.push(button);
        return true;
      }),
      processMouse: vi.fn(async (_l: { x: number; y: number }, button: number) => {
        mouse.push(button);
        return true;
      }),
    };
    const view = makeView();
    Object.defineProperty(view, "puzzle", { value: puzzle, writable: true });
    Object.defineProperty(view, "canvas", {
      value: {
        getBoundingClientRect: () => ({ left: 0, top: 0 }),
        setPointerCapture: vi.fn(),
        hasPointerCapture: () => false,
        releasePointerCapture: vi.fn(),
      },
      writable: true,
    });
    return { view, keys, mouse };
  }

  it("sends Escape to the puzzle as button 27 when no gesture is in flight", async () => {
    const { view, keys } = makeKeyView();
    await view.handleKeyEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    expect(keys).toEqual([27]);
  });

  it("cancels the gesture instead, when a pointer is down", async () => {
    const { view, keys, mouse } = makeKeyView();
    const host = view as unknown as PointerHost;
    await host.handlePointerDown(pointerEvent("pointerdown"));
    mouse.length = 0;

    await view.handleKeyEvent(new KeyboardEvent("keydown", { key: "Escape" }));

    // The gesture ends as a drag out of bounds then a release — and Escape does
    // *not* also arrive as a keypress.
    expect(mouse).toEqual([PuzzleButton.LEFT_DRAG, PuzzleButton.LEFT_RELEASE]);
    expect(keys).toEqual([]);
  });

  it("keeps claiming Escape at the document level", () => {
    // The bubbled path only forwards keys `wantsKeyEvent` claims, so the fix
    // above reaches a puzzle that is not focused only if this stays true.
    expect(
      makeView().wantsKeyEvent(new KeyboardEvent("keydown", { key: "Escape" })),
    ).toBe(true);
  });
});

describe("pointer coordinates", () => {
  // Both terms of the canvas-relative subtraction are fractional in general: a
  // pointer reports a sub-pixel position, and a centred canvas routinely lands
  // on a half-pixel edge. Games draw with whole-pixel arithmetic that has no
  // slack for the difference -- Map's drag blob saves a TILESIZE+3 blitter that
  // is exactly flush with the circle it covers at even tile sizes, so a
  // fractional origin (truncated by getImageData) left the circle's rightmost
  // column and bottom row unerased: a trail of scratch marks along the drag.
  // The C/WASM engine never saw a fraction, because Embind truncated to `int`.
  const HALF_PIXEL_CANVAS = { left: 263.5, top: 109.5 };

  it("delivers whole-pixel coordinates from a sub-pixel pointer", async () => {
    const { host, locations, answerPress } = makePointerView(true, HALF_PIXEL_CANVAS);

    answerPress(); // press round-trip completes immediately
    await host.handlePointerDown(
      pointerEvent("pointerdown", { clientX: 522.1099853, clientY: 312.4400024 }),
    );
    await host.handlePointerMove(
      pointerEvent("pointermove", { clientX: 529.4799805, clientY: 315.5499878 }),
    );

    // Floor, not round: the second point's .98 must not carry to 266. Games
    // locate a cell by `Math.floor(x / tileSize)`, and flooring first leaves
    // that unchanged -- rounding would shift every cell boundary by half a
    // pixel.
    expect(locations).toEqual([
      { x: 258, y: 202 },
      { x: 265, y: 206 },
    ]);
  });
});
