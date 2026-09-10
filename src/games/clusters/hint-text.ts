/**
 * Every sentence Clusters' hint speaks, and the words inside them.
 *
 * The deduction decides which sentence and with what values (`index.ts`'s
 * `narrate`); this file decides only how it reads. Each is a proof by
 * contradiction: premise, the rule the refuted color breaks, conclusion in the
 * necessity voice (docs/games/hints.md § "Necessity for deductions, imperative
 * for moves", D4).
 *
 * **Where a second mark is on the board, "this cell" is tied to it by geometry**
 * (owner-reported, 2026-08-14: with a solid-filled target *and* a ringed tile on
 * screen, a bare "this cell" points at neither). The fix is deliberately not
 * *"the cell marked purple"* — `hints.md` forbids color as the only cue, and a
 * sentence naming a hue is wrong the moment the scheme flips or the reader is
 * color-blind. It is the relation instead: `contradictionAround` only ever
 * reports the placed cell **or one of its four orthogonal neighbors**, so on
 * every branch below the ringed tile is literally *this cell's neighbor* and
 * the sentence can say so. That identifies both squares at once, and is more
 * informative than the wording it replaces rather than merely longer.
 *
 * The two `at.cell === d.index` branches are left alone on purpose: there is no
 * second mark in those frames, so "this cell" is unambiguous and a
 * disambiguating phrase would be noise.
 */

import type { ClustersDeduction } from "./solver.ts";
import { type ClustersFill, F_COLOR_0 } from "./state.ts";

const colorName = (fill: ClustersFill): string => (fill === F_COLOR_0 ? "red" : "blue");

export const say = {
  /** A lookahead firing: one standing hypothesis plus `n` forced single-cell
   * consequences (never nested), shown statically as the marked cells. */
  chain: (d: ClustersDeduction, n: number): string => {
    const f = colorName(d.fill);
    const t = colorName(d.refuted);
    const at = d.reason.at;
    const end =
      at.kind === "dotOvercount"
        ? "the ringed dot would touch a second tile of its own color"
        : at.cell === d.index
          ? at.kind === "surrounded"
            ? `this very cell would be sealed off from every ${t} tile`
            : `this very cell could no longer touch two ${t} tiles`
          : at.kind === "surrounded"
            ? "the ringed tile would be sealed off from its own color"
            : "the ringed tile could no longer touch two of its own color";
    // The chain's break is adjacent to the *last forced cell*, not to the
    // target, so the neighbor relation above is unavailable here. What ties
    // the three marks together instead is that the chain runs **from** this
    // cell — which is also the one fact a reader needs to follow it.
    //
    // **The sentence names the two ends and lets the numbers carry the
    // middle** (`walk-tactic-hint-chains` D5). It used to say the marked cells
    // "would each be forced in turn", which named no order the player could
    // check — the marks were an unordered set — so the only way to verify it
    // was to redo the deduction, the thing docs/games/hints.md § "The forcing
    // boundary" forbids. The consequences are numbered on the board now, and
    // this cites them by number; reciting the links here would put the chain
    // back in the reader's head, which is what the picture exists to prevent.
    //
    // *"from it"* survives the rewrite deliberately: it is the deixis tie the
    // guard in `clusters-hint.test.ts` checks, and the numbering does not
    // replace it. The digits say which consequence came when; they do not say
    // which of the three marks the opening "this cell" means.
    const run =
      n === 1
        ? "cell 1 is then forced from it, and"
        : `cells 1 to ${n} are then forced from it, and by ${n}`;
    return `Suppose this cell were ${t}: ${run} ${end}, so this cell must be ${f}.`;
  },

  /** A direct firing: the refuted color breaks a rule at once. */
  direct: (d: ClustersDeduction): string => {
    const f = colorName(d.fill);
    const t = colorName(d.refuted);
    const at = d.reason.at;
    if (at.cell === d.index) {
      if (at.kind === "surrounded") {
        return `Every neighbor of this cell is ${f}. A ${t} tile here could never touch another ${t} tile, so it must be ${f}.`;
      }
      // reachTwo at the cell itself (an empty cell is never a dot). Count- and
      // edge-neutral: at a corner the board edge does part of the hemming, and
      // "at most one" stays honest when one open neighbor remains.
      return `If this cell were ${t}, at most one neighbor could ever match it, but it needs to touch two, so it must be ${f}.`;
    }
    if (at.kind === "dotOvercount") {
      // "its one" carries the rule (a dot touches exactly one tile of its color),
      // and the rule itself is the help's to state.
      return `The ringed ${t} dot beside this cell already touches its one ${t} tile, so this cell must be ${f}.`;
    }
    if (at.kind === "surrounded") {
      return `Painting this cell ${t} would seal its ringed ${f} neighbor off from every other ${f} tile, so this cell must be ${f}.`;
    }
    return `If this cell were ${t}, its ringed ${f} neighbor could never touch two ${f} tiles, so this cell must be ${f}.`;
  },
};
