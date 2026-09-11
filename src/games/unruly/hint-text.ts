/**
 * Every sentence Unruly's hint speaks, and the words inside them.
 *
 * The deduction decides which sentence and with what values (`index.ts`'s
 * `narrate`); this file decides only how it reads, so the words match the
 * highlighted evidence.
 */

import { ONE, ZERO } from "./constants.ts";
import type { HintReason } from "./solver.ts";

type R<K extends HintReason["kind"]> = Extract<HintReason, { kind: K }>;

const colorName = (c: number): string => (c === ONE ? "black" : "white");
const oppositeName = (c: number): string => colorName(c === ONE ? ZERO : ONE);
const lineName = (horizontal: boolean): string => (horizontal ? "row" : "column");

export const say = {
  threes: (reason: R<"threes">): string =>
    `Two of these three cells are already ${colorName(reason.color)}, so a third would make three in a row: this cell must be ${oppositeName(reason.color)}.`,

  complete: (reason: R<"complete">): string =>
    `This ${lineName(reason.horizontal)} already holds all of its ${colorName(reason.full)} cells, so every remaining cell in it must be ${colorName(reason.fill)}.`,

  unique: (reason: R<"unique">): string =>
    `This ${lineName(reason.horizontal)}'s ${oppositeName(reason.fill)}s all sit where the ringed ${lineName(reason.horizontal)}'s do, so one more here would make them identical: it must be ${colorName(reason.fill)}.`,

  nearcomplete: (reason: R<"nearcomplete">): string =>
    `The last ${oppositeName(reason.fill)} in this ${lineName(reason.horizontal)} can only go in a ringed cell without forcing three ${colorName(reason.fill)}s, so the rest must be ${colorName(reason.fill)}.`,
};
