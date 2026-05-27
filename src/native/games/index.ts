/**
 * Side-effect registry of native-TS game ports. Importing this module
 * runs each game's `registerGame(...)`, so the worker's dispatch seam
 * (`createTsEngine`) can find them. Each game port adds one line here.
 *
 * Until a game is registered the registry is empty and production is
 * the unchanged all-WASM path (see `ts-engine` spec).
 */

import "./flip/index.ts";
import "./galaxies/index.ts";
import "./pegs/index.ts";
import "./sixteen/index.ts";
