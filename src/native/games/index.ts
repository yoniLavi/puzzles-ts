/**
 * Registry of native-TS game ports. Importing this module registers every
 * ported game (via the module-load side effect below), so the worker's
 * dispatch seam (`createTsEngine`) can find them. Each game port adds one
 * entry to `ALL_GAMES`.
 *
 * `registerAllGames()` is exported and **idempotent** (re-registering the
 * same `Game` instance is a no-op — see `registry.ts`). It exists so a test
 * that shares a worker's module state under `isolate: false` can guarantee
 * the registry is fully populated even after a sibling test called
 * `_resetRegistry()`: the game modules self-register only once per worker
 * (ES-module side effects don't re-run), so a reset is otherwise
 * unrecoverable. Production still gets the unchanged "import populates the
 * registry" behaviour from the module-load call at the bottom.
 *
 * Until a game is registered the registry is empty and production is the
 * unchanged all-WASM path (see `ts-engine` spec).
 */

import { registerGame } from "../engine/registry.ts";
import { blackboxGame } from "./blackbox/index.ts";
import { bridgesGame } from "./bridges/index.ts";
import { cubeGame } from "./cube/index.ts";
import { dominosaGame } from "./dominosa/index.ts";
import { fifteenGame } from "./fifteen/index.ts";
import { fillingGame } from "./filling/index.ts";
import { flipGame } from "./flip/index.ts";
import { floodGame } from "./flood/index.ts";
import { galaxiesGame } from "./galaxies/index.ts";
import { guessGame } from "./guess/index.ts";
import { inertiaGame } from "./inertia/index.ts";
import { keenGame } from "./keen/index.ts";
import { lightupGame } from "./lightup/index.ts";
import { magnetsGame } from "./magnets/index.ts";
import { mapGame } from "./map/index.ts";
import { minesGame } from "./mines/index.ts";
import { mosaicGame } from "./mosaic/index.ts";
import { netGame } from "./net/index.ts";
import { netslideGame } from "./netslide/index.ts";
import { palisadeGame } from "./palisade/index.ts";
import { patternGame } from "./pattern/index.ts";
import { pearlGame } from "./pearl/index.ts";
import { pegsGame } from "./pegs/index.ts";
import { rangeGame } from "./range/index.ts";
import { rectGame } from "./rect/index.ts";
import { samegameGame } from "./samegame/index.ts";
import { separateGame } from "./separate/index.ts";
import { signpostGame } from "./signpost/index.ts";
import { singlesGame } from "./singles/index.ts";
import { sixteenGame } from "./sixteen/index.ts";
import { slantGame } from "./slant/index.ts";
import { soloGame } from "./solo/index.ts";
import { tentsGame } from "./tents/index.ts";
import { towersGame } from "./towers/index.ts";
import { tracksGame } from "./tracks/index.ts";
import { twiddleGame } from "./twiddle/index.ts";
import { undeadGame } from "./undead/index.ts";
import { unequalGame } from "./unequal/index.ts";
import { unrulyGame } from "./unruly/index.ts";
import { untangleGame } from "./untangle/index.ts";

/**
 * Register every ported game. Idempotent: safe to call repeatedly, and
 * safe to call after `_resetRegistry()` to restore a fully-populated
 * registry (the reason it exists — see the module header). Each call
 * infers its own concrete generics, so no `any`/`as` escapes (the same
 * shape as each game module's own top-level `registerGame`). Add one line
 * per port.
 */
export function registerAllGames(): void {
  registerGame(blackboxGame);
  registerGame(bridgesGame);
  registerGame(cubeGame);
  registerGame(dominosaGame);
  registerGame(fifteenGame);
  registerGame(fillingGame);
  registerGame(flipGame);
  registerGame(floodGame);
  registerGame(galaxiesGame);
  registerGame(guessGame);
  registerGame(inertiaGame);
  registerGame(keenGame);
  registerGame(lightupGame);
  registerGame(magnetsGame);
  registerGame(mapGame);
  registerGame(minesGame);
  registerGame(mosaicGame);
  registerGame(netGame);
  registerGame(netslideGame);
  registerGame(palisadeGame);
  registerGame(patternGame);
  registerGame(pearlGame);
  registerGame(pegsGame);
  registerGame(rangeGame);
  registerGame(rectGame);
  registerGame(samegameGame);
  registerGame(separateGame);
  registerGame(signpostGame);
  registerGame(singlesGame);
  registerGame(sixteenGame);
  registerGame(slantGame);
  registerGame(soloGame);
  registerGame(tentsGame);
  registerGame(towersGame);
  registerGame(tracksGame);
  registerGame(twiddleGame);
  registerGame(undeadGame);
  registerGame(unequalGame);
  registerGame(unrulyGame);
  registerGame(untangleGame);
}

// Module-load side effect: importing this barrel populates the registry,
// exactly as before. (Each game's own module also self-registers on import;
// `registerGame` is idempotent, so this second pass is a no-op there.)
registerAllGames();
