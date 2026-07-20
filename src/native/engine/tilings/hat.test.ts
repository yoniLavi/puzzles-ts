/**
 * Behavioural tests for the hat aperiodic monotile.
 *
 * The heavy lifting is done by `grid-aperiodic-differential.test.ts`, which
 * byte-matches both the generated desc and the resulting grid against the C.
 * What is left for here is what a differential *cannot* see: that the generated
 * tables really contain what the C survey said they do, that malformed descs
 * are rejected with the right reason, and that the deterministic short-desc
 * replay path is actually deterministic.
 */

import { describe, expect, it } from "vitest";
import { randomNew } from "../../random/index.ts";
import { metatileCharToType } from "./hat.ts";
import { gridNewHats, hatsNewDesc, hatsValidateDesc } from "./hat-grid.ts";
import { children, hatsInMetatile, kitemap, metamap, nchildren } from "./hat-tables.ts";

const LETTERS = ["H", "T", "P", "F"];

describe("hat-tables.ts extraction", () => {
  // These figures were read off the C independently of the extraction script,
  // so they catch a formatting drift in `hat-tables.h` that silently truncated
  // a table — which would otherwise surface only as a wrong tiling deep in a
  // patch. Kept as literals on purpose: deriving them from the arrays under
  // test would make the check vacuous.
  it("has the expected shape per metatile type", () => {
    expect([...hatsInMetatile]).toEqual([4, 1, 2, 2]);
    expect([...nchildren]).toEqual([13, 7, 11, 11]);
    expect(children.map((c) => c.length)).toEqual([13, 7, 11, 11]);
  });

  it("has the expected number of kitemap and metamap entries", () => {
    // Stride 3 for kitemap (kite, hat, meta), 2 for metamap (meta, meta2).
    expect(kitemap.map((t) => t.length / 3)).toEqual([1664, 896, 1408, 1408]);
    expect(metamap.map((t) => t.length / 2)).toEqual([169, 91, 143, 143]);
  });

  it("has the expected number of impossible-step sentinels", () => {
    const kiteSentinels = kitemap.map((t) => {
      let n = 0;
      for (let i = 0; i < t.length; i += 3) {
        if (t[i] === -1 && t[i + 1] === -1 && t[i + 2] === -1) n++;
      }
      return n;
    });
    expect(kiteSentinels).toEqual([768, 456, 664, 662]);
    expect(kiteSentinels.reduce((a, b) => a + b, 0)).toBe(2550);

    const metaSentinels = metamap.map((t) => {
      let n = 0;
      for (let i = 0; i < t.length; i += 2) if (t[i] === -1) n++;
      return n;
    });
    expect(metaSentinels).toEqual([24, 12, 18, 18]);
    expect(metaSentinels.reduce((a, b) => a + b, 0)).toBe(72);
  });

  it("holds only values in [-1, 12]", () => {
    // Int8Array would accept anything up to 127, so a parse slip that read a
    // stray number would not be caught by the type alone.
    for (const table of [...kitemap, ...metamap, ...children]) {
      for (const v of table) expect(v).toBeGreaterThanOrEqual(-1);
      for (const v of table) expect(v).toBeLessThanOrEqual(12);
    }
  });

  it("names only real metatile types in every child list", () => {
    for (const list of children) {
      for (const t of list) expect(LETTERS[t]).toBeDefined();
    }
  });
});

describe("hat desc round-trip", () => {
  it("generates descs that validate and build", () => {
    for (let seed = 0; seed < 12; seed++) {
      const desc = hatsNewDesc(6, 6, randomNew(String(seed)));
      expect(hatsValidateDesc(6, 6, desc)).toBeNull();
      expect(desc).toMatch(/^(\d{1,2},)+[HTPF]$/);

      const g = gridNewHats(6, 6, desc);
      expect(g.faces.length).toBeGreaterThan(0);
      expect(g.dots.length).toBeGreaterThan(0);
      // Trimming keeps only the landlocked core, so every face is a whole hat.
      for (const f of g.faces) expect(f.order).toBe(14);
    }
  });

  it("builds the same grid twice from one desc", () => {
    const desc = hatsNewDesc(6, 6, randomNew("determinism"));
    const dump = (): string =>
      JSON.stringify(gridNewHats(6, 6, desc).dots.map((d) => [d.x, d.y]));
    expect(dump()).toBe(dump());
  });

  it("replays a short desc deterministically at a larger size", () => {
    // A desc records exactly the coordinate depth its own region demanded, so
    // replaying it at a *larger* size runs off the end of what it stored. The
    // C then invents nothing at random — it takes each type's first legal
    // parent — and this is the only path that exercises that branch, since no
    // ordinary fixture is ever replayed bigger than it was generated.
    const desc = hatsNewDesc(6, 6, randomNew("short"));
    const dump = (): string =>
      JSON.stringify(gridNewHats(12, 12, desc).dots.map((d) => [d.x, d.y]));
    const first = dump();
    expect(dump()).toBe(first);
    // And it must actually be a bigger patch than the desc was made for.
    expect(gridNewHats(12, 12, desc).faces.length).toBeGreaterThan(
      gridNewHats(6, 6, desc).faces.length,
    );
  });

  it("emits no negative-zero dot coordinate", () => {
    // -0 survives `===`, the dot-dedup key and `Map` lookup, so a grid carrying
    // it is structurally perfect and only `Object.is` disagrees.
    const g = gridNewHats(6, 6, hatsNewDesc(6, 6, randomNew("zero")));
    for (const d of g.dots) {
      expect(Object.is(d.x, -0)).toBe(false);
      expect(Object.is(d.y, -0)).toBe(false);
    }
  });
});

describe("hat desc validation", () => {
  it("rejects a missing desc", () => {
    expect(hatsValidateDesc(6, 6, null)).toBe("Missing grid description string.");
  });

  it.each([
    ["", "invalid character in grid description"],
    ["X", "invalid character in grid description"],
    ["0", "expected ',' in grid description"],
    ["0,3,0", "expected ',' in grid description"],
    ["0,3,0,0,6,Z", "invalid character in grid description"],
    ["000,3,0,0,6,F", "too-large coordinate in grid description"],
    ["0,3,F", "Grid parameters require at least three coordinates"],
    ["9,3,0,0,6,F", "Grid parameters contain an invalid kite index"],
    ["0,3,0,0,12,F", "Grid parameters contain an invalid metatile index"],
    ["0,4,0,0,6,F", "Grid parameters contain an invalid hat index"],
  ])("rejects %o", (desc, error) => {
    expect(hatsValidateDesc(6, 6, desc)).toBe(error);
  });

  it("accepts trailing junk after the metatile letter, as the C does", () => {
    // Upstream stops reading at the letter and never checks for a terminator.
    // Recorded rather than tightened: a stricter TS validator would reject
    // descs the C build happily accepts.
    expect(hatsValidateDesc(6, 6, "0,3,0,0,6,Fjunk")).toBeNull();
  });
});

describe("metatileCharToType", () => {
  it("maps the four letters and nothing else", () => {
    expect(LETTERS.map(metatileCharToType)).toEqual([0, 1, 2, 3]);
    // "" is the interesting one: `"HTPF".indexOf("")` is 0, so an unguarded
    // lookup would read a missing letter as H.
    for (const c of ["", "G", "h", "HH"]) expect(metatileCharToType(c)).toBe(-1);
  });
});
