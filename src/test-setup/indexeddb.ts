/**
 * In-process IndexedDB for persistence tests (tier 3).
 *
 * Importing this module installs `fake-indexeddb` as the global
 * `indexedDB`, so Dexie (`src/store/db.ts`) opens against an in-memory
 * store with no browser. Import it **before** any value import that
 * touches `db` (type-only imports are erased and don't count), so the
 * global and the maxKey shim below are in place when `db.ts` evaluates:
 *
 *   import { resetDb } from "../test-setup/indexeddb.ts"; // first
 *   import { savedGames } from "../store/saved-games.ts"; // db.ts here
 *
 * `fake-indexeddb/auto` sets the global as a side effect on import.
 */
import "fake-indexeddb/auto";
import Dexie from "dexie";

// fake-indexeddb rejects Dexie's IndexedDB-2 array maxKey (`[[]]`) when it
// appears twice in one compound bound — which every `between(minKey,
// maxKey)` range query in `saved-games.ts` does (`[saveType, idMax,
// tsMax]`) — because its key-conversion cycle check mistakes the repeated
// (non-cyclic) reference for a loop. Browsers allow shared references.
// Force the primitive sentinel Dexie uses when IDB2 array keys aren't
// detected: it orders correctly for our string puzzleIds and number
// timestamps and sidesteps the false positive. This must run before
// `db.ts` reads `Dexie.maxKey` into PUZZLE_ID_MAX/TIMESTAMP_MAX, so `db`
// is imported lazily (a static import here would hoist above this line).
(Dexie as unknown as { maxKey: unknown }).maxKey = "￿";

type Db = typeof import("../store/db.ts")["db"];
let dbPromise: Promise<Db> | undefined;

async function getDb(): Promise<Db> {
  if (!dbPromise) dbPromise = import("../store/db.ts").then((m) => m.db);
  return dbPromise;
}

/** Clear every table so each test starts from an empty database. */
export async function resetDb(): Promise<void> {
  const db = await getDb();
  await Promise.all(db.tables.map((t) => t.clear()));
}
