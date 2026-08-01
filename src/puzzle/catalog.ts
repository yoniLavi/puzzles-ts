import { type PuzzleData, puzzleCatalog } from "./catalog-data.ts";

export type { PuzzleData } from "./catalog-data.ts";
export { puzzleIds } from "./catalog-data.ts";

export interface PuzzleDataMap {
  [id: string]: PuzzleData;
}

export const puzzleDataMap: Readonly<PuzzleDataMap> = puzzleCatalog;
