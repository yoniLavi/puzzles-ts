/**
 * Side-effect registry of native-TS game ports. Importing this module
 * runs each game's `registerGame(...)`, so the worker's dispatch seam
 * (`createTsEngine`) can find them. Each game port adds one line here.
 *
 * Until a game is registered the registry is empty and production is
 * the unchanged all-WASM path (see `ts-engine` spec).
 */

import "./cube/index.ts";
import "./fifteen/index.ts";
import "./flip/index.ts";
import "./flood/index.ts";
import "./galaxies/index.ts";
import "./pegs/index.ts";
import "./sixteen/index.ts";
import "./twiddle/index.ts";
