/**
 * **What a puzzle search matches on** — one definition, used by the home
 * screen's search box and by the `Ctrl/Cmd+K` quick-switch.
 *
 * The two had their own inline expressions and had already drifted: the home
 * box read name + objective + description, the switcher read name + objective.
 * A player who finds a game from one and not the other has met a bug, and the
 * only way two search boxes agree about what they search is for there to be one
 * answer.
 *
 * The haystack is deliberately wide — a **name, its other names, its one-line
 * category and its objective** — because a puzzle search is a recall aid, not a
 * filter over structured data. Someone typing "sudoku" wants Solo, someone
 * typing "loop" wants Loopy and Pearl and Tracks, and someone typing "letters"
 * wants ABCD. Missing the game they meant costs far more than surfacing one
 * they did not.
 */
import { puzzleDataMap } from "./catalog.ts";

/** Everything a query is matched against for `puzzleId`, lowercased. Built per
 * call: the catalog is 57 entries and a keystroke is not a hot loop. */
export function searchHaystack(puzzleId: string): string {
  const data = puzzleDataMap[puzzleId];
  if (!data) return "";
  const { name, aliases, description, objective } = data;
  return [name, ...(aliases ?? []), description, objective].join(" ").toLowerCase();
}

/** Whether `puzzleId` matches `query`. An empty query matches everything —
 * "show me nothing until you type" is not what an empty box means. */
export function matchesQuery(puzzleId: string, query: string): boolean {
  const needle = query.trim().toLowerCase();
  if (!needle) return true;
  return searchHaystack(puzzleId).includes(needle);
}
