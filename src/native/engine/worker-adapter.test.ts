import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { blackboxGame } from "../games/blackbox/index.ts";
import { flipGame } from "../games/flip/index.ts";
import { floodGame } from "../games/flood/index.ts";
import { galaxiesGame } from "../games/galaxies/index.ts";
import { guessGame } from "../games/guess/index.ts";
import { registerAllGames } from "../games/index.ts";
import { mosaicGame } from "../games/mosaic/index.ts";
import { pegsGame } from "../games/pegs/index.ts";
import { samegameGame } from "../games/samegame/index.ts";
import { sixteenGame } from "../games/sixteen/index.ts";
import { type EngineCore, Midend } from "./midend.ts";
import { _resetRegistry, registerGame } from "./registry.ts";
import { TsWorkerPuzzle } from "./worker-adapter.ts";

describe("TsWorkerPuzzle — decodeCustomParams", () => {
  beforeEach(() => {
    _resetRegistry();
  });

  // This file is the only one that mutates the shared registry. Under
  // `isolate: false` the registry is module state shared across every file
  // in the worker, so leaving it half-populated would fail a sibling that
  // depends on the full set (e.g. ts-ported-ids). Restore it once at the end.
  afterAll(() => {
    _resetRegistry();
    registerAllGames();
  });

  it("decodes pegs custom params correctly", () => {
    registerGame(pegsGame);
    const midend = new Midend(pegsGame);
    const worker = new TsWorkerPuzzle("pegs", midend);

    const result = worker.decodeCustomParams("7x7random");
    expect(result).toEqual({
      width: "7",
      height: "7",
      "board-type": "2",
    });
  });

  it("decodes flip custom params correctly", () => {
    registerGame(flipGame);
    const midend = new Midend(flipGame);
    const worker = new TsWorkerPuzzle("flip", midend);

    const result = worker.decodeCustomParams("5x5random");
    expect(result).toEqual({
      width: "5",
      height: "5",
      "shape-type": "1",
    });
  });

  it("decodes sixteen custom params correctly", () => {
    registerGame(sixteenGame);
    const midend = new Midend(sixteenGame);
    const worker = new TsWorkerPuzzle("sixteen", midend);

    const result = worker.decodeCustomParams("4x4m10");
    expect(result).toEqual({
      width: "4",
      height: "4",
      "number-of-shuffling-moves": "10",
    });
  });

  it("decodes blackbox custom params with a ball range summary", () => {
    registerGame(blackboxGame);
    const midend = new Midend(blackboxGame);
    const worker = new TsWorkerPuzzle("blackbox", midend);

    expect(worker.decodeCustomParams("w8h8m3M6")).toEqual({
      width: "8",
      height: "8",
      "no-of-balls": "3-6",
    });
    expect(worker.decodeCustomParams("w8h8m5M5")).toEqual({
      width: "8",
      height: "8",
      "no-of-balls": "5",
    });
  });

  it("decodes flood custom params (width/height base + extras)", () => {
    registerGame(floodGame);
    const worker = new TsWorkerPuzzle("flood", new Midend(floodGame));
    expect(worker.decodeCustomParams("12x12c6m5")).toEqual({
      width: "12",
      height: "12",
      colours: "6",
      "extra-moves-permitted": "5",
    });
  });

  it("decodes mosaic custom params (own width/height keys + real boolean)", () => {
    registerGame(mosaicGame);
    const worker = new TsWorkerPuzzle("mosaic", new Midend(mosaicGame));
    expect(worker.decodeCustomParams("10x10h1")).toEqual({
      width: "10",
      height: "10",
      "aggressive-generation": true,
    });
  });

  it("decodes samegame custom params (numeric choice index, real boolean)", () => {
    registerGame(samegameGame);
    const worker = new TsWorkerPuzzle("samegame", new Midend(samegameGame));
    expect(worker.decodeCustomParams("5x5c3s2r")).toEqual({
      width: "5",
      height: "5",
      "no-of-colours": "3",
      "scoring-system": 1,
      "ensure-solubility": false,
    });
  });

  it("decodes guess custom params with real booleans", () => {
    registerGame(guessGame);
    const midend = new Midend(guessGame);
    const worker = new TsWorkerPuzzle("guess", midend);

    // Booleans must be real booleans, not "true"/"false" strings — the
    // type-summary formatter indexes options via Number(value), and
    // Number("true") is NaN (the annotation silently renders empty).
    expect(worker.decodeCustomParams("c6p4g10bM")).toEqual({
      colours: "6",
      "pegs-per-guess": "4",
      guesses: "10",
      "allow-blanks": true,
      "allow-duplicates": false,
    });
  });

  it("decodes galaxies custom params correctly", () => {
    registerGame(galaxiesGame);
    const midend = new Midend(galaxiesGame);
    const worker = new TsWorkerPuzzle("galaxies", midend);

    const result = worker.decodeCustomParams("7x7du");
    expect(result).toEqual({
      width: "7",
      height: "7",
      difficulty: "1",
    });
  });
});

describe("TsWorkerPuzzle — the first palette install must repaint", () => {
  /**
   * Regression guard for a bug that shipped and stayed hidden for months.
   *
   * `redraw()` is gated on `paletteReady` because the canvas `Drawing` throws
   * if asked to paint before a palette exists — so every repaint requested
   * before then is **silently dropped**. The midend requests one on the initial
   * game transition, which is a race the game loses whenever generation is
   * fast, and nothing re-issued it: `setDrawingPalette` only repainted when it
   * *replaced* an existing palette, never on the first install.
   *
   * The user-visible symptom was a board that never appeared — deep-linking to
   * a non-default type left the canvas blank indefinitely, while the same
   * params chosen from the in-app menu painted at once (by then the palette was
   * long installed). It affected every TS-ported game and no C/WASM one.
   *
   * The test drives the adapter's real ordering — a repaint arriving *before*
   * the palette — through a fake engine that counts paints.
   */
  function fakeEngine(): { engine: EngineCore; paints: () => number } {
    let paints = 0;
    const engine = {
      redraw: () => {
        paints++;
      },
      forceRedraw: () => {
        paints++;
      },
      canvasCleared: () => {},
    } as unknown as EngineCore;
    return { engine, paints: () => paints };
  }

  /** Minimal stand-in for the canvas `Drawing`: `setPalette` reports `true`
   * only when it *replaces* a palette, exactly as the real one does. */
  function fakeDrawing(): { setPalette(colors: string[]): boolean } {
    let installed = false;
    return {
      setPalette(colors: string[]): boolean {
        const replaced = installed && colors.length > 0;
        if (colors.length > 0) installed = true;
        return replaced;
      },
    };
  }

  function attach(worker: TsWorkerPuzzle, drawing: unknown): void {
    // The real `createDrawing` needs an OffscreenCanvas; reach past it, since
    // what is under test is the palette/redraw ordering, not canvas creation.
    (worker as unknown as { drawing: unknown }).drawing = drawing;
  }

  it("paints once the palette arrives, even though the earlier repaint was dropped", () => {
    const { engine, paints } = fakeEngine();
    const worker = new TsWorkerPuzzle("fake", engine);
    attach(worker, fakeDrawing());

    // The midend's initial-transition repaint, arriving before the palette.
    worker.redraw();
    expect(paints(), "a pre-palette repaint must not reach the canvas").toBe(0);

    // Installing the palette must flush that dropped repaint.
    worker.setDrawingPalette(["#000000", "#ffffff"]);
    expect(paints(), "the first palette install must repaint").toBe(1);
  });

  it("still repaints when a palette is later replaced (light/dark toggle)", () => {
    const { engine, paints } = fakeEngine();
    const worker = new TsWorkerPuzzle("fake", engine);
    attach(worker, fakeDrawing());

    worker.setDrawingPalette(["#000000"]);
    expect(paints()).toBe(1);
    // A replacement invalidates any per-tile cache keyed to the old colours.
    worker.setDrawingPalette(["#ffffff"]);
    expect(paints()).toBe(2);
  });
});
