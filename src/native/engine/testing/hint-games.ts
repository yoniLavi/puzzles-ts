/**
 * The enrollment list for every cross-game hint guard.
 *
 * One list, many guards: `hint-resume.test.ts` (plan convergence, purity,
 * no-op-free plans), `hint-overlay.test.ts` (overlay reaches the render
 * cache) and `hint-quality.test.ts` (narration form) all iterate this
 * list, so a newly ported game with a `hint()` enrolls in *all* of them
 * by adding one line here — and the guards' coverage cannot silently
 * drift apart.
 *
 * Dev/test-only; never imported by production code.
 */
import { dominosaGame } from "../../games/dominosa/index.ts";
import { fifteenGame } from "../../games/fifteen/index.ts";
import { fillingGame } from "../../games/filling/index.ts";
import { floodGame } from "../../games/flood/index.ts";
import { inertiaGame } from "../../games/inertia/index.ts";
import { keenGame } from "../../games/keen/index.ts";
import { lightupGame } from "../../games/lightup/index.ts";
import { netslideGame } from "../../games/netslide/index.ts";
import { palisadeGame } from "../../games/palisade/index.ts";
import { patternGame } from "../../games/pattern/index.ts";
import { rangeGame } from "../../games/range/index.ts";
import { singlesGame } from "../../games/singles/index.ts";
import { sixteenGame } from "../../games/sixteen/index.ts";
import { slantGame } from "../../games/slant/index.ts";
import { soloGame } from "../../games/solo/index.ts";
import { towersGame } from "../../games/towers/index.ts";
import { undeadGame } from "../../games/undead/index.ts";
import { unequalGame } from "../../games/unequal/index.ts";
import { unrulyGame } from "../../games/unruly/index.ts";
import { untangleGame } from "../../games/untangle/index.ts";
import type { Game, PresetMenu } from "../game.ts";

// biome-ignore lint/suspicious/noExplicitAny: a deliberately game-agnostic probe.
export type AnyGame = Game<any, any, any, any, any, any>;

/** Every game that ships a `hint()`, by puzzle id. */
export const HINT_GAMES: [string, AnyGame][] = [
  ["dominosa", dominosaGame],
  ["filling", fillingGame],
  ["fifteen", fifteenGame],
  ["flood", floodGame],
  ["inertia", inertiaGame],
  ["keen", keenGame],
  ["lightup", lightupGame],
  ["netslide", netslideGame],
  ["palisade", palisadeGame],
  ["pattern", patternGame],
  ["range", rangeGame],
  ["singles", singlesGame],
  ["sixteen", sixteenGame],
  ["slant", slantGame],
  ["solo", soloGame],
  ["towers", towersGame],
  ["undead", undeadGame],
  ["unequal", unequalGame],
  ["unruly", unrulyGame],
  ["untangle", untangleGame],
];

/** First leaf preset's params — a small, valid board for each game. */
export function firstLeaf<P>(menu: PresetMenu<P>): P {
  if (menu.params !== undefined) return menu.params;
  for (const sub of menu.submenu ?? []) {
    const p = firstLeaf(sub);
    if (p !== undefined) return p;
  }
  throw new Error("no leaf preset");
}
