/*
 * The run-length grammar's own tests — and, for the encoder, an **equivalence
 * check against the code it replaced**.
 *
 * That check matters more here than the unit tests do. A desc is a player
 * promise: a `params:desc` game ID must decode to the same board for ever. Most
 * games in this family carry a frozen differential that would catch a byte
 * moving, but Palisade — the first game converted — does not, so nothing else
 * in the suite would have noticed the encoder rounding a 27-blank run
 * differently. The old nested-`while` encoder is reproduced below verbatim and
 * fuzzed against the new one, biased hard toward blanks so runs past 26 and 52
 * occur constantly.
 */

import { describe, expect, it } from "vitest";
import { encodeRunLength, scanRunLength } from "./run-length.ts";

const A = "a".charCodeAt(0);
const EMPTY = -1;

/** Palisade's encoder as it stood before the extraction, kept as the oracle. */
function priorEncoder(clues: Int8Array, wh: number): string {
  let out = "";
  let run = 0;
  for (let i = 0; i < wh; i++) {
    if (clues[i] !== EMPTY) {
      while (run) {
        while (run > 26) {
          out += "z";
          run -= 26;
        }
        out += String.fromCharCode(A - 1 + run);
        run = 0;
      }
      out += String(clues[i]);
    } else run++;
  }
  return out;
}

describe("scanRunLength", () => {
  it("reads letters as blank runs and everything else as a value", () => {
    expect([...scanRunLength("a3z0")]).toEqual([
      { blanks: 1 },
      { value: "3" },
      { blanks: 26 },
      { value: "0" },
    ]);
  });

  it("hands back characters a game will reject, rather than judging them", () => {
    // The scanner reports what it read and never what is legal — which value
    // characters are allowed is the game's rule, and its error message is too.
    expect([...scanRunLength("!")]).toEqual([{ value: "!" }]);
    expect([...scanRunLength("")]).toEqual([]);
  });
});

describe("encodeRunLength", () => {
  it("drops a trailing run of blanks", () => {
    expect(encodeRunLength(5, (i) => (i === 0 ? "1" : null))).toBe("1");
  });

  it("splits a run longer than 26 into whole-alphabet chunks", () => {
    expect(encodeRunLength(28, (i) => (i === 27 ? "1" : null))).toBe("z" + "a" + "1");
  });

  it("round-trips through the scanner", () => {
    const values = ["1", null, null, "4", null, "0"];
    const desc = encodeRunLength(values.length, (i) => values[i]);
    const read: (string | null)[] = [];
    for (const tok of scanRunLength(desc)) {
      if ("blanks" in tok) for (let k = 0; k < tok.blanks; k++) read.push(null);
      else read.push(tok.value);
    }
    // The trailing blank is dropped by design, so compare the prefix.
    expect(read).toEqual(values.slice(0, read.length));
  });

  it("reproduces the encoder it replaced, byte for byte", () => {
    let seed = 12345;
    const rnd = (): number => {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      return seed / 0x7fffffff;
    };
    for (let trial = 0; trial < 4000; trial++) {
      const wh = 1 + Math.floor(rnd() * 200);
      const clues = new Int8Array(wh);
      // Biased hard toward blanks, so runs past 26 and 52 occur constantly.
      for (let i = 0; i < wh; i++) {
        clues[i] = rnd() < 0.9 ? EMPTY : Math.floor(rnd() * 5);
      }
      const next = encodeRunLength(wh, (i) =>
        clues[i] === EMPTY ? null : String(clues[i]),
      );
      expect(next).toBe(priorEncoder(clues, wh));
    }
  });
});
