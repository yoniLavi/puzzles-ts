/**
 * A **declared** params codec: a game states the shape of its encoded params
 * once, and `encodeParams` and `decodeParams` are both derived from that one
 * statement.
 *
 * ## Why this exists
 *
 * Every game used to hand-write both halves of its codec and hold them to be
 * mutual inverses by discipline. Read together, the 57 pairs turned out to
 * spell one grammar with very little variation:
 *
 * ```
 *   <dimensions>     <tagged segments…>          <bare flag letters…>
 *   ────────────     ──────────────────          ───────────────────
 *   12x10            d<char>  difficulty         S  symmetrical
 *   9    (square)    n<int>   count / regions    L  no loops
 *                    m<int>   move target        a  non-unique
 *                    c<int>   colors             o  orientable
 * ```
 *
 * `d<char>` alone appeared in about twenty games, written out twenty times,
 * alongside five different local idioms for "read a digit run" (`eatNum`,
 * `readInt`, `digits`, `parseLeadingInt`, `parseInt(slice)` + a `while`). None
 * of that is about the puzzle, which is the test AGENTS.md § "Convention over
 * configuration" sets: *would two games ever legitimately answer this
 * differently?* What tag letter a field takes, yes — that is fixed by upstream
 * compatibility and belongs to the game. How a digit run is consumed, no.
 *
 * ## Segments name a `paramConfig` field, they do not restate it
 *
 * A segment refers to a field by its **`kw`** and reuses that item's `get` and
 * `set`. That is the point rather than a convenience: the params form and the
 * codec stop being two hand-synced copies of one field list, so a field cannot
 * appear in the Custom dialog and be dropped from the game ID, or the reverse.
 * It also means a field's representation stays the game's own business — Spokes
 * stores its difficulty as a string union and Loopy as an object lookup, and
 * neither has to change to be encodable, because the codec only ever moves
 * values through the accessors the game already wrote.
 *
 * A field the Custom dialog does not offer (Mines' first-click coordinates) can
 * still be encoded by supplying `get`/`set` on the segment directly.
 *
 * ## What it does not do
 *
 * Float-valued params (Rectangles' expansion factor, Net's barrier
 * probability), a leading letter before the dimensions (Cube), and a field
 * whose encoding is a `switch` over multi-character strings (Solo's symmetry)
 * are **not** expressible here, and those games keep hand-written codecs as
 * first-class citizens. A grammar that swallowed them would have to grow an
 * escape hatch per game, which is two ways plus a seam rather than one obvious
 * way.
 *
 * Byte-stability is not assumed, it is asserted: `params-stability.test.ts`
 * holds every game's encodings against a recorded table, so replacing a
 * hand-written codec with a declared one is only correct if it produces the
 * identical string for all 612 corpus cases.
 */

import type { ParamConfigItem } from "./game.ts";
import { parseLeadingInt } from "./params.ts";

/** One piece of an encoded params string. Built by the factories below. */
export interface ParamsSegment<P> {
  /** Append this segment's text, or nothing when it is omitted. */
  encode(p: P, full: boolean): string;
  /** Consume this segment from `s` at `i`, writing onto `p`. Returns the index
   * to continue from — unchanged when the segment is absent. */
  decode(s: string, i: number, p: P): number;
}

/** Options common to every optional segment. */
interface SegmentOptions {
  /** Written only in the `full` encoding (upstream's generator-only params).
   * The brief form is what a shared game ID carries. */
  full?: boolean;
}

type Config<P> = readonly ParamConfigItem<P>[];

function item<P>(config: Config<P>, kw: string): ParamConfigItem<P> {
  const found = config.find((i) => i.kw === kw);
  if (!found) {
    // Loud rather than lenient: a segment naming a field the form does not
    // declare is the exact desync this module exists to make impossible, and a
    // silently skipped segment would drop the field from every game ID.
    throw new Error(`params codec: no paramConfig item with kw "${kw}"`);
  }
  return found;
}

function stringItem<P>(config: Config<P>, kw: string) {
  const found = item(config, kw);
  if (found.type !== "string") {
    throw new Error(`params codec: "${kw}" is a ${found.type} item, want string`);
  }
  return found;
}

function choicesItem<P>(config: Config<P>, kw: string) {
  const found = item(config, kw);
  if (found.type !== "choices") {
    throw new Error(`params codec: "${kw}" is a ${found.type} item, want choices`);
  }
  return found;
}

function booleanItem<P>(config: Config<P>, kw: string) {
  const found = item(config, kw);
  if (found.type !== "boolean") {
    throw new Error(`params codec: "${kw}" is a ${found.type} item, want boolean`);
  }
  return found;
}

/** Consume a digit run, leaving `i` untouched when there is none. */
function eatInt(s: string, i: number): { value: number; next: number } {
  return parseLeadingInt(s, i);
}

/**
 * The `WxH` dimension prefix virtually every grid game leads with, with
 * upstream's **square fallback** on decode: a bare `9` means 9×9.
 *
 * Encoding always writes both, because that is what every hand-written encoder
 * did and a game ID that dropped `xH` for a square board would not be the same
 * string.
 */
export function dims<P>(
  config: Config<P>,
  wKw = "width",
  hKw = "height",
): ParamsSegment<P> {
  const w = stringItem(config, wKw);
  const h = stringItem(config, hKw);
  return {
    encode: (p) => `${w.get(p)}x${h.get(p)}`,
    decode: (s, i, p) => {
      const wParse = eatInt(s, i);
      w.set(p, String(wParse.value));
      if (s[wParse.next] === "x") {
        const hParse = eatInt(s, wParse.next + 1);
        h.set(p, String(hParse.value));
        return hParse.next;
      }
      h.set(p, String(wParse.value));
      return wParse.next;
    },
  };
}

/**
 * A single untagged leading integer — the form used by the games whose board is
 * described by one number (Dominosa's highest domino, Keen's and Towers' order,
 * Unequal's order, Mathrax's order, Group's order).
 */
export function size<P>(config: Config<P>, kw: string): ParamsSegment<P> {
  const field = stringItem(config, kw);
  return {
    encode: (p) => String(field.get(p)),
    decode: (s, i, p) => {
      const parsed = eatInt(s, i);
      field.set(p, String(parsed.value));
      return parsed.next;
    },
  };
}

/**
 * A tagged integer: `n12`, `m30`. Absent from the string leaves the field at
 * whatever `defaultParams()` gave it, which is what every hand-written decoder
 * did.
 */
export function num<P>(
  config: Config<P>,
  tag: string,
  kw: string,
  opts: SegmentOptions & {
    /** Omit the segment when this holds — an upstream encoder that writes a
     * field only when it is non-zero (Sixteen's and Twiddle's move target). */
    omitWhen?: (p: P) => boolean;
    /**
     * What the field means when the tag is **absent**, for the games whose
     * default is computed from the params already decoded rather than fixed.
     *
     * Palisade and Separate read a bare `9` as a 9×9 board in regions of 9, so
     * their region count defaults to the width; Map's default region count is
     * `w × h / 8`. Without this the field would fall back to `defaultParams()`,
     * which is a different board — so the hook exists because three games need
     * it, not to be general.
     */
    whenAbsent?: (p: P) => void;
  } = {},
): ParamsSegment<P> {
  const field = stringItem(config, kw);
  return {
    encode: (p, full) => {
      if (opts.full && !full) return "";
      if (opts.omitWhen?.(p)) return "";
      return `${tag}${field.get(p)}`;
    },
    decode: (s, i, p) => {
      if (s[i] !== tag) {
        opts.whenAbsent?.(p);
        return i;
      }
      const parsed = eatInt(s, i + tag.length);
      field.set(p, String(parsed.value));
      return parsed.next;
    },
  };
}

/**
 * A tagged single letter drawn from a table — in practice always a difficulty,
 * `d` + one of `DIFF_CHARS`.
 *
 * **Leniency is upstream's and is preserved exactly.** An unrecognized letter
 * does not throw: it leaves the field at its default, or — when the game passes
 * `invalid` — at an out-of-range value that its own `validateParams` rejects
 * with a real message. Both behaviors exist in the collection today and the
 * difference is deliberate, so it is declared rather than chosen here.
 */
export function choice<P>(
  config: Config<P>,
  tag: string,
  kw: string,
  chars: string,
  opts: SegmentOptions & {
    /** Value to write when the tag is present but the letter is missing or
     * unrecognized. Omit to leave the default in place. */
    invalid?: number;
  } = {},
): ParamsSegment<P> {
  const field = choicesItem(config, kw);
  return {
    encode: (p, full) => {
      if (opts.full && !full) return "";
      return `${tag}${chars[field.get(p)] ?? "?"}`;
    },
    decode: (s, i, p) => {
      if (s[i] !== tag) return i;
      let next = i + tag.length;
      if (opts.invalid !== undefined) field.set(p, opts.invalid);
      if (next < s.length) {
        const found = chars.indexOf(s[next]);
        if (found >= 0) field.set(p, found);
        next++;
      }
      return next;
    },
  };
}

/**
 * A bare boolean letter: present means the field takes `means`, absent means
 * the opposite.
 *
 * `means` is explicit because the collection uses it both ways — Magnets writes
 * `S` when `stripclues` is on, Bridges writes `L` when `allowloops` is *off* —
 * and reading which way round a letter goes off `defaultParams()` would be a
 * guess that happened to be right.
 */
export function flag<P>(
  config: Config<P>,
  letter: string,
  kw: string,
  opts: SegmentOptions & { means?: boolean } = {},
): ParamsSegment<P> {
  const field = booleanItem(config, kw);
  const means = opts.means ?? true;
  return {
    encode: (p, full) => {
      if (opts.full && !full) return "";
      return field.get(p) === means ? letter : "";
    },
    decode: (s, i, p) => {
      if (s[i] !== letter) {
        field.set(p, !means);
        return i;
      }
      field.set(p, means);
      return i + letter.length;
    },
  };
}

/**
 * Build a game's `encodeParams` / `decodeParams` pair from an ordered segment
 * list.
 *
 * Decoding walks the segments in order, each consuming its piece or declining;
 * anything left over is ignored, which is upstream's leniency and what lets an
 * old or hand-typed game ID still resolve.
 */
export function paramsCodec<P>(
  defaults: () => P,
  segments: readonly ParamsSegment<P>[],
): {
  encodeParams(p: P, full: boolean): string;
  decodeParams(s: string): P;
} {
  return {
    encodeParams: (p, full) => segments.map((seg) => seg.encode(p, full)).join(""),
    decodeParams: (s) => {
      const p = defaults();
      let i = 0;
      for (const seg of segments) i = seg.decode(s, i, p);
      return p;
    },
  };
}
