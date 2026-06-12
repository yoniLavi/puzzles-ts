import { describe, expect, it } from "vitest";
import { shaBytes, shaCopy, shaFinal, shaInit } from "./sha1.ts";

const enc = (s: string): Uint8Array => new TextEncoder().encode(s);
const hex = (b: Uint8Array): string =>
  Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");

describe("shaCopy", () => {
  it("forks a partially-hashed state that finalises independently", () => {
    // The `final = base` pattern from misc.c's obfuscate_bitmap: hash a
    // common prefix once, then finalise two independent continuations.
    const base = shaInit();
    shaBytes(base, enc("prefix"));

    const a = shaCopy(base);
    shaBytes(a, enc("0"));
    const da = new Uint8Array(20);
    shaFinal(a, da);

    const b = shaCopy(base);
    shaBytes(b, enc("1"));
    const db = new Uint8Array(20);
    shaFinal(b, db);

    // Different continuations → different digests.
    expect(hex(da)).not.toBe(hex(db));

    // base is untouched by the forks: "prefix"+"0" via base equals a.
    shaBytes(base, enc("0"));
    const dbase = new Uint8Array(20);
    shaFinal(base, dbase);
    expect(hex(dbase)).toBe(hex(da));
  });

  it("deep-copies the typed-array fields (no aliasing)", () => {
    const s = shaInit();
    shaBytes(s, enc("abc"));
    const c = shaCopy(s);
    shaBytes(c, enc("more bytes here, changing block state"));
    // Mutating the copy must not perturb the original's digest.
    const d1 = new Uint8Array(20);
    shaFinal(s, d1);
    expect(hex(d1)).toBe("a9993e364706816aba3e25717850c26c9cd0d89d"); // SHA1("abc")
  });
});
