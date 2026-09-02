/**
 * **A departure from a shared role is stated at the assignment.**
 *
 * The audit found seventeen games with seventeen "deliberately different"
 * cursors and read that as seventeen decisions; it was one decision plus a
 * handful of collisions, and only some of the collisions said so. This guard
 * reads every game's palette source and, for each slot whose *name* says what it
 * means — a cursor, a held or dragged item, a hint mark — requires either the
 * shared role or a reason on the assignment line or the line above it.
 *
 * Keyed on the slot's index name because that is the only shape a palette
 * assignment has: `out[COL_CURSOR] = X` carries its meaning in `COL_CURSOR` and
 * nowhere else. A game that names a cursor slot something without "CURSOR" in it
 * is not seen here — that is a naming question, not a colour one, and the
 * vacuity count below says how many slots the scan actually examined.
 */
import { describe, expect, it } from "vitest";

const sourceModules = import.meta.glob<string>("../../games/**/*.ts", {
  query: "?raw",
  import: "default",
  eager: true,
});

/** Slot-name fragment → the role(s) its meaning is covered by, and the fewest
 * such slots the collection is known to have (the vacuity floor). */
const ROLES: Record<string, { roles: readonly string[]; atLeast: number }> = {
  CURSOR: { roles: ["CURSOR"], atLeast: 25 },
  HELD: { roles: ["HELD"], atLeast: 1 },
  // A drag's origin is the thing picked up, so HELD covers a DRAG slot too.
  DRAG: { roles: ["DRAG_ADD", "DRAG_REMOVE", "HELD"], atLeast: 2 },
  HINT: {
    roles: [
      "HINT_ACTION",
      "HINT_EVIDENCE",
      "HINT_EVIDENCE_WASH",
      "HINT_BLACKREF",
      "HINT_WHITEREF",
    ],
    atLeast: 25,
  },
};

interface Assignment {
  file: string;
  slot: string;
  value: string;
  line: number;
  explained: boolean;
}

/** `out[COL_X] = value;` / `ret[COL_X] = value;` — a palette assignment. */
const ASSIGNMENT =
  /^\s*(?:out|ret|colours|palette)\[(COL_[A-Z0-9_]+)\]\s*=\s*(.+?);\s*(\/\/.*)?$/;

/** `value, // COL_X ...` — the positional form five games use (Bridges,
 * Fifteen, Sixteen, Pegs, Untangle), where the slot is named in the trailing
 * comment. That comment is the *label*, not a reason: only text beyond the
 * label counts as one. */
const POSITIONAL = /^\s*([^/]+?),\s*\/\/\s*(?:\d+\s+)?(COL_[A-Z0-9_]+)(.*)$/;

function assignments(): Assignment[] {
  const found: Assignment[] = [];
  for (const [file, source] of Object.entries(sourceModules)) {
    if (file.endsWith(".test.ts")) continue;
    const lines = source.split("\n");
    lines.forEach((text, i) => {
      const previous = lines[i - 1] ?? "";
      const previousIsComment = /^\s*\/\//.test(previous) || /\*\/\s*$/.test(previous);
      const m = ASSIGNMENT.exec(text);
      if (m) {
        const [, slot, value, trailing] = m;
        const explained =
          trailing !== undefined || previousIsComment || /\/\*/.test(text);
        found.push({ file, slot, value, line: i + 1, explained });
        return;
      }
      const p = POSITIONAL.exec(text);
      if (p) {
        const [, value, slot, rest] = p;
        const explained =
          /\S/.test(rest.replace(/^\s*(\(.*?\))?\s*$/, "")) || previousIsComment;
        found.push({ file, slot, value: value.trim(), line: i + 1, explained });
      }
    });
  }
  return found;
}

describe("a departure from a shared role is stated at the assignment", () => {
  const all = assignments();
  const byRole = Object.entries(ROLES).map(([fragment, { roles, atLeast }]) => ({
    fragment,
    roles,
    atLeast,
    slots: all.filter((a) => a.slot.includes(fragment)),
  }));

  it("finds the game sources and the meaningful slots at all", () => {
    // The vacuity guard: an unmatched glob yields `{}` and every assertion
    // below passes over nothing.
    expect(Object.keys(sourceModules).length).toBeGreaterThan(100);
    expect(all.length).toBeGreaterThan(400);
    // Every game directory contributes at least one assignment — including the
    // five that build their palette positionally, which the first shape alone
    // could not see.
    const games = new Set(all.map((a) => a.file.split("/")[3]));
    expect(games.size).toBe(57);
    for (const { fragment, slots, atLeast } of byRole) {
      expect(slots.length, `${fragment} slots`).toBeGreaterThanOrEqual(atLeast);
    }
  });

  it.each(byRole)("$fragment: the role, or a reason", ({ roles, slots }) => {
    const unexplained = slots.filter(
      (a) => !roles.some((r) => a.value === r) && !a.explained,
    );
    expect(
      unexplained.map(
        (a) => `${a.file.replace("../../games/", "")}:${a.line} ${a.slot} = ${a.value}`,
      ),
    ).toEqual([]);
  });
});
