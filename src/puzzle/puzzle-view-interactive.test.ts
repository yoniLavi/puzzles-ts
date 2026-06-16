// @vitest-environment happy-dom
//
// Cmd/Ctrl+C is a deliberate "copy the board as an image" shortcut. It must
// step aside when the user has a real text selection (e.g. the hint banner),
// so the browser's native text copy can run instead. `wantsKeyEvent` is the
// guard that decides whether the puzzle claims the keystroke.
import { afterEach, describe, expect, it, vi } from "vitest";
// The component's import chain opens a Dexie database at module load; give it a
// fake IndexedDB so happy-dom doesn't reject on the missing API.
import "../test-setup/indexeddb.ts";
import "./puzzle-view-interactive.ts";
import type { PuzzleViewInteractive } from "./puzzle-view-interactive.ts";

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
    expect(view.wantsKeyEvent(new KeyboardEvent("keydown", { key: "c", ctrlKey: true }))).toBe(
      false,
    );
    expect(view.wantsKeyEvent(new KeyboardEvent("keydown", { key: "Copy" }))).toBe(false);
  });

  it("claims Ctrl/Cmd+C (copy-as-image) when there is no selection", () => {
    const view = makeView();
    stubSelection("");
    expect(view.wantsKeyEvent(new KeyboardEvent("keydown", { key: "c", ctrlKey: true }))).toBe(
      true,
    );
    expect(view.wantsKeyEvent(new KeyboardEvent("keydown", { key: "Copy" }))).toBe(true);
  });

  it("treats a whitespace-only selection as no selection", () => {
    const view = makeView();
    stubSelection("   \n  ");
    expect(view.wantsKeyEvent(new KeyboardEvent("keydown", { key: "c", ctrlKey: true }))).toBe(
      true,
    );
  });

  it("still claims non-copy puzzle keys regardless of selection", () => {
    const view = makeView();
    stubSelection("some selected hint text");
    // Arrow keys drive the puzzle cursor and are unaffected by the copy guard.
    expect(view.wantsKeyEvent(new KeyboardEvent("keydown", { key: "ArrowLeft" }))).toBe(true);
  });
});
