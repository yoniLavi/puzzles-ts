/**
 * Every sentence Subsets' hint speaks, and the words inside them.
 *
 * The deduction decides which sentence and with what values (`index.ts`'s
 * `stepsForFiring`); this file decides only how it reads. Each leg of a firing
 * is one letter with its own string, *attention → deduction → action* (owner
 * redesign 2026-07-21), and a collapse's lead leg gains a "why not X" clause.
 */

import type {
  CollapseExclusion,
  SubsetsDeduction,
  SubsetsDeductionSet,
} from "./solver.ts";

const LETTER = (bit: number): string => String.fromCharCode(65 + bit);
const capitalize = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1);

/** Oxford-comma join: "A", "A and C", "A, C and D". */
function joinAnd(parts: string[]): string {
  if (parts.length <= 1) return parts[0] ?? "";
  if (parts.length === 2) return `${parts[0]} and ${parts[1]}`;
  return `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`;
}

/** A set-value as "{A, C}", or "the empty set" for `{}`. */
function setLabel(value: number, n: number): string {
  const letters: string[] = [];
  for (let b = 0; b < n; b++) if (value & (1 << b)) letters.push(LETTER(b));
  return letters.length ? `{${letters.join(",")}}` : "the empty set";
}

const lettersOf = (mask: number, n: number): string => {
  const out: string[] = [];
  for (let b = 0; b < n; b++) if (mask & (1 << b)) out.push(LETTER(b));
  return joinAnd(out);
};

/** The action a leg makes, lowercase: "mark A present" / "clear B". */
function legAction(set: SubsetsDeductionSet): string {
  return set.type === "known"
    ? `mark ${LETTER(set.bit)} present`
    : `clear ${LETTER(set.bit)}`;
}

export const say = {
  /**
   * The per-slot narration of leg `k` of a firing — one letter, its own string,
   * *attention → deduction → action* (owner redesign 2026-07-21). The lead leg
   * (`k === 0`) states the sub-goal (why this set/cell); continuation legs are
   * terser but still specific to their own slot toward that sub-goal.
   */
  leg: (d: SubsetsDeduction, k: number): string => {
    const set = d.sets[k];
    const first = k === 0;
    const L = LETTER(set.bit);
    const act = legAction(set);
    const r = d.reason;

    if (r.kind === "arrowKnown") {
      // Every leg is a letter confirmed in the subset cell. Continuation legs
      // name the highlighted cell explicitly, so the referent is never a bare
      // pronoun (owner 2026-07-21).
      return first
        ? `The highlighted cell's set lies inside this one, and its ${L} is marked, so ${L} must be here too. ${capitalize(act)}.`
        : `Still filling this cell: the highlighted cell's ${L} is marked too, so ${act} here.`;
    }
    if (r.kind === "arrowMask") {
      return first
        ? `This cell's set lies inside the highlighted cell's, which has no ${L}, so ${L} can't be here either. ${capitalize(act)}.`
        : `Still filling this cell: the highlighted cell has no ${L} either, so ${act} here.`;
    }

    // Placement reasons — the referent is the highlighted set(s), named in full
    // on every leg (never "it"/"them").
    const plural = r.kind === "collapse" && r.survivors.length > 1;
    const ref = plural ? "the highlighted sets" : "the highlighted set";

    if (!first) {
      const cont =
        set.type === "known"
          ? plural
            ? `${ref} all contain ${L} too`
            : `${ref} also contains ${L}`
          : plural
            ? `none of ${ref} has ${L}`
            : `${ref} has no ${L} either`;
      return `Still filling this cell: ${cont}, so ${act} here.`;
    }

    const hasClause =
      set.type === "known"
        ? plural
          ? `they all contain ${L}`
          : `it contains ${L}`
        : plural
          ? `none of them has ${L}`
          : `it has no ${L}`;
    const attn =
      r.kind === "hiddenSingle"
        ? "The highlighted set can go nowhere but this cell."
        : r.kind === "collapse"
          ? plural
            ? "Only the highlighted sets can still go in this cell."
            : "Only the highlighted set can still go in this cell."
          : // singlePosition (deep cube fallback)
            "The highlighted set's other cells are all taken or blocked, so it must go here.";
    return `${attn} ${capitalize(hasClause)}, so ${act}.`;
  },

  /** The "why not X" clause a collapse appends (owner enhancement 2026-07-21):
   * name a competitor set and the visible rule that blocks it. */
  exclusion: (ex: CollapseExclusion, n: number): string => {
    const label = setLabel(ex.value, n);
    const b = ex.block;
    if (b.kind === "placed")
      return ` For instance, ${label} is already placed on the board (highlighted).`;
    if (b.kind === "arrow") {
      return b.mustContain
        ? ` For instance, ${label} can't go here: the horseshoe to the highlighted cell needs ${lettersOf(b.letters, n)} present.`
        : ` For instance, ${label} can't go here: the horseshoe to the highlighted cell won't allow ${lettersOf(b.letters, n)}.`;
    }
    return ` For instance, ${label} can't go here: with no horseshoe to the highlighted neighbor, neither set may contain the other, but ${label} would.`;
  },
};
