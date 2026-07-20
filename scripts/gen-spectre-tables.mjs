#!/usr/bin/env node
/**
 * Generate `src/native/engine/tilings/spectre-tables.ts` from the C reference.
 *
 * The tables are *compiled*, not scraped: `puzzles/auxiliary/spectre-tables-dump.c`
 * includes upstream's headers, walks the same X-macro that names them, and
 * prints JSON. That side-steps the preprocessor entirely (the table names are
 * `HEX_LETTERS(Z)` expansions, the entries reference `HEX_*` enum values and the
 * probabilities are `PROB_*` macros), and it recovers the array lengths, which
 * upstream stores nowhere at runtime.
 *
 * Usage:
 *   cmake -B build/native -S puzzles -DUSE_TS_RANDOM=0
 *   cmake --build build/native --target spectre-tables-dump
 *   node scripts/gen-spectre-tables.mjs
 *
 * The script also re-checks the structural invariants that a bad extraction
 * would violate, so a silently-wrong table cannot be written out.
 */

import { execFileSync } from "node:child_process";
import { existsSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const dumper = join(repoRoot, "build/native/auxiliary/spectre-tables-dump");
const output = join(repoRoot, "src/native/engine/tilings/spectre-tables.ts");

if (!existsSync(dumper)) {
  console.error(
    `missing ${dumper}\n` +
      "build it first:\n" +
      "  cmake -B build/native -S puzzles -DUSE_TS_RANDOM=0\n" +
      "  cmake --build build/native --target spectre-tables-dump",
  );
  process.exit(1);
}

const data = JSON.parse(execFileSync(dumper, { encoding: "utf8" }));

// ---------------------------------------------------------------------------
// Structural checks. Each of these would otherwise fail deep inside the tiling
// engine, or (worse) not fail at all and just produce a different tiling.
// ---------------------------------------------------------------------------

const fail = (message) => {
  console.error(`spectre table extraction: ${message}`);
  process.exit(1);
};

if (data.letters !== "GDJLXPSFY") {
  fail(`hex ordinal order is ${data.letters}, expected GDJLXPSFY`);
}
if (data.spectreAngles.length !== 14) fail("spectre_angles is not length 14");
if (data.spectreAngles.reduce((a, b) => a + b, 0) !== -12) {
  // 14 turns totalling -360 degrees in 1/12 turns: the outline must close.
  fail("spectre_angles do not sum to a full turn");
}

for (const h of data.hexes) {
  const isG = h.letter === "G";
  const want = (name, got, expected) => {
    if (got !== expected)
      fail(`${name}_${h.letter} has ${got} entries, expected ${expected}`);
  };

  want("subhexes", h.subhexes.length, isG ? 7 : 8);
  want("numSubhexes", h.numSubhexes, isG ? 7 : 8);
  want("numSpectres", h.numSpectres, isG ? 2 : 1);
  // Every subhex has 6 edges; every spectre has 14.
  want("hexmap", h.hexmap.length, 6 * h.numSubhexes);
  want("specmap", h.specmap.length, 14 * h.numSpectres);
  want("hexedges", h.hexedges.length, 6);
  want("specedges", h.specedges.length, 6);

  // The `*edges` tables partition the corresponding `*in` table into six
  // contiguous runs covering it exactly. `spectrectx_step*` indexes
  // `in[startindex + len - 1 - lo]`, so a gap or overlap silently reads a
  // neighbouring edge's entry.
  const partition = (edges, inTable, name) => {
    let next = 0;
    for (const [startIndex, len] of edges) {
      if (startIndex !== next) {
        fail(
          `${name}_${h.letter} is not contiguous at ${startIndex} (expected ${next})`,
        );
      }
      next += len;
    }
    if (next !== inTable.length) {
      fail(`${name}_${h.letter} covers ${next} of ${inTable.length} entries`);
    }
  };
  partition(h.hexedges, h.hexin, "hexedges");
  partition(h.specedges, h.specin, "specedges");

  // `spectrectx_step_hex` resolves an external hex edge with a single `if`,
  // asserting the entry it lands on is internal. That is only sound because
  // *every* hexin entry is internal.
  if (h.hexin.some(([internal]) => !internal)) {
    fail(`hexin_${h.letter} contains a non-internal entry`);
  }
  // `spectrectx_step`'s loop, by contrast, is a `while` — and S is the only hex
  // that needs it. If this count ever changes, the `while` in spectre.ts is
  // load-bearing for a different set of hexes than its comment claims.
  const specinExternal = h.specin.filter(([internal]) => !internal).length;
  const expectedExternal = h.letter === "S" ? 4 : 0;
  if (specinExternal !== expectedExternal) {
    fail(
      `specin_${h.letter} has ${specinExternal} non-internal entries, expected ${expectedExternal}`,
    );
  }

  if (h.poss.length === 0) fail(`poss_${h.letter} is empty`);
}

if (data.possSpectre.length !== 10) fail("poss_spectre is not length 10");

// ---------------------------------------------------------------------------
// Emit.
// ---------------------------------------------------------------------------

// Indentation is passed in rather than fixed, because these tables appear at
// two different nesting depths and the output has to come out already
// biome-formatted — otherwise the gate reformats a generated file and the next
// regeneration reverts it, for ever.
const entries = (rows, pad) =>
  rows
    .map(
      ([internal, hi, lo]) => `${pad}{ internal: ${internal}, hi: ${hi}, lo: ${lo} },`,
    )
    .join("\n");

const edges = (rows, pad) =>
  rows
    .map(([startIndex, len]) => `${pad}{ startIndex: ${startIndex}, len: ${len} },`)
    .join("\n");

const possibilities = (rows, pad) =>
  rows
    .map(([hi, lo, prob]) => `${pad}{ hi: ${hi}, lo: ${lo}, prob: ${prob} },`)
    .join("\n");

const entries6 = (rows) => entries(rows, "      ");
const edges6 = (rows) => edges(rows, "      ");
const possibilities6 = (rows) => possibilities(rows, "      ");

const hexBlocks = data.hexes
  .map(
    (h) => `  // ---- ${h.letter} ${"-".repeat(66 - h.letter.length)}
  {
    letter: "${h.letter}",
    subhexes: [${h.subhexes.join(", ")}],
    hexmap: [
${entries6(h.hexmap)}
    ],
    hexedges: [
${edges6(h.hexedges)}
    ],
    hexin: [
${entries6(h.hexin)}
    ],
    specmap: [
${entries6(h.specmap)}
    ],
    specedges: [
${edges6(h.specedges)}
    ],
    specin: [
${entries6(h.specin)}
    ],
    poss: [
${possibilities6(h.poss)}
    ],
  },`,
  )
  .join("\n");

const source = `/**
 * Lookup tables for the spectre aperiodic tiling.
 *
 * GENERATED FILE — do not edit by hand. Regenerate with:
 *
 *     cmake -B build/native -S puzzles -DUSE_TS_RANDOM=0
 *     cmake --build build/native --target spectre-tables-dump
 *     node scripts/gen-spectre-tables.mjs
 *
 * Source of truth: upstream's \`spectre-tables-manual.h\` (hand-written) and
 * \`spectre-tables-auto.h\` (itself generated by \`auxiliary/spectre-gen.c\`),
 * read by \`puzzles/auxiliary/spectre-tables-dump.c\`.
 *
 * The extraction compiles against those headers rather than scraping them: the
 * table *names* are X-macro expansions, the entries reference enum values, and
 * the probabilities are macros, so nothing textual can read them correctly. The
 * generator also re-asserts the structural invariants the tiling engine relies
 * on (contiguous edge partitions, all \`hexin\` entries internal, \`specin_S\` the
 * only table with external entries) before writing this file.
 *
 * Consumed by \`spectre.ts\`. Entries are plain objects rather than the packed
 * \`Int8Array\` form the hat tiling uses: there are only ~900 of them here
 * (against hat's 5,376 kitemap entries), so the readability of \`m.internal\` /
 * \`m.hi\` / \`m.lo\` at every use site is worth more than the allocation.
 */

/**
 * A hexagon type, as an index into {@link HEX_DATA}. **The ordinal order
 * \`G D J L X P S F Y\` is load-bearing** — it is upstream's \`HEX_LETTERS\` order,
 * and it indexes \`HEX_DATA\` and every \`subhexes\` entry.
 */
export type Hex = number;

/** The hex letters in ordinal order; a desc's final character is one of these. */
export const HEX_LETTERS = "${data.letters}";

export function numSubhexes(h: Hex): number {
  return h === 0 ? 7 : 8; // only G expands to seven children
}

export function numSpectres(h: Hex): number {
  return h === 0 ? 2 : 1; // only G contains two spectres
}

/**
 * One transition-table row: where you arrive when you leave a tile by an edge.
 * \`internal\` means the destination is a sibling within the same parent, so
 * \`hi\`/\`lo\` are the destination's index and arrival edge directly; otherwise
 * the step escapes the parent and \`hi\`/\`lo\` name the parent edge to recurse
 * through and the sub-edge along it.
 */
export interface MapEntry {
  readonly internal: boolean;
  readonly hi: number;
  readonly lo: number;
}

/** One parent edge's contiguous run within the matching \`hexin\`/\`specin\` table. */
export interface MapEdge {
  readonly startIndex: number;
  readonly len: number;
}

/**
 * A legal parent for a hex: this hex may appear as child \`lo\` of a hex of type
 * \`hi\`, chosen with relative weight \`prob\`.
 *
 * The weights are **exact integer approximations to algebraic numbers** (the
 * limiting eigenvector of the substitution matrix, so functions of √15).
 * Transcribe them; never recompute them from a square root — and note that the
 * X and P weight sums differ by 1, which is a genuine asymmetry in upstream's
 * rounding, not a typo to tidy.
 */
export interface Possibility {
  readonly hi: number;
  readonly lo: number;
  readonly prob: number;
}

/** Everything the stepping algorithm needs about one hex type. */
export interface HexData {
  readonly letter: string;
  /** Child hex types by index, in upstream's fixed 0..7 layout. */
  readonly subhexes: readonly Hex[];
  /** Hex-to-hex steps, indexed \`6 * childIndex + edge\`. */
  readonly hexmap: readonly MapEntry[];
  /** Partition of \`hexin\` by the parent's own six edges. */
  readonly hexedges: readonly MapEdge[];
  /** Arrivals into this hex from outside, indexed through \`hexedges\`. */
  readonly hexin: readonly MapEntry[];
  /** Spectre-to-spectre steps, indexed \`14 * spectreIndex + edge\`. */
  readonly specmap: readonly MapEntry[];
  /** Partition of \`specin\` by the parent hex's six edges. */
  readonly specedges: readonly MapEdge[];
  /** Arrivals into this hex's spectres from outside. */
  readonly specin: readonly MapEntry[];
  /** Which hexes this one can be a child of, with their relative weights. */
  readonly poss: readonly Possibility[];
}

/**
 * How far to turn at each vertex of a spectre, in 1/12 turns, starting from the
 * top of its "head". Index 10 is a **0** — a straight, deliberately collinear
 * vertex splitting the spectre's "double edge" into two. It is how adjacent
 * spectres come to share vertices correctly, so it must not be simplified away.
 */
export const SPECTRE_ANGLES: readonly number[] = [
  ${data.spectreAngles.join(", ")},
];

/**
 * The limiting distribution of hex types across the plane, used to pick the
 * starting spectre's coordinates as though drawn from an infinite tiling.
 */
export const POSS_SPECTRE: readonly Possibility[] = [
${possibilities(data.possSpectre, "  ")}
];

/** Per-hex-type tables, indexed by {@link Hex} in \`HEX_LETTERS\` order. */
export const HEX_DATA: readonly HexData[] = [
${hexBlocks}
];
`;

writeFileSync(output, source);

// Hand the result to the formatter rather than trying to match it by hand. The
// emitted indentation is already close, but biome collapses a single-element
// array onto one line (which `poss_J` and `poss_L` are), and a generated file
// the gate would reformat is a file that flips back and forth for ever.
execFileSync("npx", ["biome", "format", "--write", output], { stdio: "inherit" });

console.log(`wrote ${output}`);
