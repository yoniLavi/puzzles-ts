/**
 * Side-effect registry of native-TS game ports. Importing this module
 * runs each game's `registerGame(...)`, so the worker's dispatch seam
 * (`createTsEngine`) can find them. Each game port adds one line here.
 *
 * Until a game is registered the registry is empty and production is
 * the unchanged all-WASM path (see `ts-engine` spec).
 */

import "./blackbox/index.ts";
import "./cube/index.ts";
import "./fifteen/index.ts";
import "./filling/index.ts";
import "./flip/index.ts";
import "./flood/index.ts";
import "./galaxies/index.ts";
import "./guess/index.ts";
import "./keen/index.ts";
import "./lightup/index.ts";
import "./mosaic/index.ts";
import "./palisade/index.ts";
import "./pattern/index.ts";
import "./pegs/index.ts";
import "./range/index.ts";
import "./samegame/index.ts";
import "./separate/index.ts";
import "./signpost/index.ts";
import "./singles/index.ts";
import "./sixteen/index.ts";
import "./slant/index.ts";
import "./solo/index.ts";
import "./tents/index.ts";
import "./towers/index.ts";
import "./twiddle/index.ts";
import "./undead/index.ts";
import "./unequal/index.ts";
import "./unruly/index.ts";
import "./untangle/index.ts";
