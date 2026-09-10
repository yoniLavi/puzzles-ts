/**
 * Every sentence Bricks' hint speaks, and the words inside them.
 *
 * The deduction decides which sentence and with what values (`index.ts`'s
 * `narrate`); this file decides only how it reads: premise, contradiction,
 * conclusion in the necessity voice, naming the clue value when a clue is the
 * evidence.
 *
 * **`ringed` counts the cells the frame actually rings** (the reason's cells
 * minus the target), so a sentence is written against what the player can see.
 * Every branch that has a second mark ties "this cell" to it, because with a
 * solid target *and* a ring on screen a bare deictic points at neither
 * (`disambiguate-hint-deixis`; the tie is geometric, never a color name —
 * `docs/games/hints.md` § "Two marks on the board"). The relations asserted
 * below are the ones the solver guarantees, checked against a sweep of ~55k
 * deductions over ~4,800 partial positions of the fixture boards: `shadeRun`
 * never leaves the target's row and is contiguous through it (so the target
 * *does* sit next to the ringed bricks, for runs of 3, 4 and 5 alike);
 * `classify*Trial` only ever names a clue found by walking `BRICKS_STEPS` from
 * the target (so it really is beside this cell); and `below`/`above` are the
 * brick-wall supports one row down/up.
 */

import type { CellColor } from "./state.ts";

export const say = {
  three:
    "Shading this cell, next to the ringed shaded bricks, would make three in a row, so it must stay clear.",

  // A ringed cell below is an unshaded brick *or a clue* — `validateGravity`
  // masks a clue down to no color, so a clue supports nothing (seen live:
  // the opener's ring is a `4`). "Isn't a shaded brick" therefore says it
  // better than "is not shaded", which reads as a mark the player could go
  // and place. An *empty* cell below does not trigger the rule at all, so
  // this branch never claims anything about one. The brick-wall corners can
  // leave a cell with only one support, or — at the padded triangles — none
  // to ring, hence three arms.
  unsupported: (ringed: number): string =>
    ringed === 0
      ? "Shading this cell would leave it with no shaded brick beneath it to rest on, so it must stay clear."
      : ringed === 1
        ? "The ringed cell below this one is all it could rest on, and it isn't a shaded brick, so this cell must stay clear."
        : "The ringed cells below this one are all it could rest on, and neither is a shaded brick, so this cell must stay clear.",

  // docs/games/hints.md § "Sanity-read at the degenerate extremes": "more
  // than its 0 shaded neighbors" came out of the running app on the opener
  // board and is nonsense — a 0 allows none at all.
  /** Shading this cell over-fills the ringed clue `n`. */
  overcount: (n: number): string =>
    n === 0
      ? "The ringed 0 beside this cell allows no shaded neighbors at all, so this cell must stay clear."
      : `Shading this cell would give the ringed ${n} beside it more than its ${n} shaded neighbor${n === 1 ? "" : "s"}, so it must stay clear.`,

  strandSupport:
    "The shaded brick above rests only on this cell, so clearing it would leave that brick unsupported: it must be shaded.",

  /** Clearing this cell leaves the ringed clue `n` unreachable. */
  undercount: (n: number): string =>
    `The ringed ${n} beside this cell can't reach ${n} shaded neighbor${n === 1 ? "" : "s"} without it, so this cell must be shaded.`,

  // The direct rung's *unclassified* case: one color placed, one validator
  // call, the board breaks — but at a cell none of the four named arms
  // above matched. It used to be narrated as "following the forced
  // consequences", which described the recursive rung that no longer feeds
  // this reason and was never true of this one: nothing is followed, the
  // break is right there and is ringed (`audit-guessing-tier-names`).
  //
  // This is the one arm with **no** guaranteed relation — `errorCells`
  // reports wherever the validator flagged the break, which need not be
  // near the target — so the tie is the only thing that always holds:
  // evidence excludes the target, so the cell being decided is the one
  // *without* a ring. (The sweep above never reached this arm at all: the
  // four named reasons classify every single-cell contradiction Bricks'
  // validator can raise. It stays because a classifier's default must.)
  /** The opposite of `forced` breaks the board, where `ringed` cells ring. */
  localBreak: (forced: CellColor, ringed: number): string => {
    const act = forced === "unshade" ? "Shading" : "Clearing";
    const end = forced === "unshade" ? "stay clear" : "be shaded";
    return ringed === 0
      ? `${act} this cell would break the board, so it must ${end}.`
      : `${act} this cell, the unringed one, would break the board where the rings are, so it must ${end}.`;
  },
};
