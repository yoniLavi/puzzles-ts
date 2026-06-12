import { beforeEach, describe, expect, it } from "vitest";
import { blackboxGame } from "../games/blackbox/index.ts";
import { flipGame } from "../games/flip/index.ts";
import { galaxiesGame } from "../games/galaxies/index.ts";
import { guessGame } from "../games/guess/index.ts";
import { pegsGame } from "../games/pegs/index.ts";
import { sixteenGame } from "../games/sixteen/index.ts";
import { Midend } from "./midend.ts";
import { _resetRegistry, registerGame } from "./registry.ts";
import { TsWorkerPuzzle } from "./worker-adapter.ts";

describe("TsWorkerPuzzle — decodeCustomParams", () => {
  beforeEach(() => {
    _resetRegistry();
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
