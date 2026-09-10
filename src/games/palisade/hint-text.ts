/**
 * Every sentence Palisade's hint speaks, and the words inside them. Palisade
 * is the collection's exemplar hint (AGENTS.md § "Hint quality bar"), so these
 * are the sentences other games' are measured against.
 *
 * The deduction decides which sentence and with what values (`index.ts`'s
 * `explain`); this file decides only how it reads. Every sentence is phrased as
 * advice, because the move has *not* been applied yet: "must be a wall" /
 * "can't be a wall", never "is a wall" / "has none". The cells and edges a
 * sentence refers to are highlighted alongside, so "both highlighted edges" and
 * "the same region" have a visible referent.
 */

type EdgeKind = "wall" | "nowall";

export const say = {
  /** A later leg of a multi-edge firing: short and kind-specific, because the
   * first leg already gave the full reason and is still on screen. */
  continuation: (kind: EdgeKind): string =>
    kind === "wall"
      ? "…and this edge must be a wall too."
      : "…and this edge can't be a wall either.",

  // Upstream's `solver_connected_clues_versus_region_size`, whose bound the
  // narration has to *show* rather than assert: if the shared edge were open,
  // each clue's walls would all sit on its other three sides, leaving
  // `3 - clue` sides leading further into the same region. Two orthogonally
  // adjacent cells share no common orthogonal neighbor, so those two sets are
  // disjoint and the region holds at least `2 + (3 - c) + (3 - d) = 8 - c - d`
  // cells.
  /** Clues `c` and `d` either side of the edge, in regions of `k`. */
  cluesVersusRegionSize: (c: number, d: number, k: number): string => {
    // Two 3s are the case where the bound is *exact* rather than a
    // minimum: each keeps one side open and it has to be the shared one,
    // so the region would be those two cells and nothing else. `8-3-3`
    // never exceeds `k`, so the general arm below cannot reach this.
    if (c === 3 && d === 3) {
      return `Two 3s each keep just one side open, and it has to be the one they share, so their region would be exactly 2 cells. Regions here hold ${k}, so the edge between them must be a wall.`;
    }
    // The side-counting behind the bound is left to the outlined clues: the
    // owner chose the shorter sentence (2026-09-10) for an arm that fires only
    // on small-region boards. The two-3s arm above keeps its count, because
    // there the bound is exact and the count is the whole argument.
    return `These clues would need a shared region of at least ${8 - c - d} cells, but regions here hold ${k}, so the edge between them must be a wall.`;
  },

  /** Clue `c` is met, or can only be met, by its remaining edges; `multi`
   * when the firing sets several. */
  numberExhausted: (c: number, kind: EdgeKind, multi: boolean): string => {
    // A 0 has no walls to have "all" of: say what it allows instead.
    if (c === 0) {
      return multi
        ? "Clue 0 allows no walls, so none of its remaining edges can be walls. Clear them."
        : "Clue 0 allows no walls, so this edge can't be one.";
    }
    if (multi) {
      return kind === "wall"
        ? `Clue ${c} reaches its count only if every remaining edge is a wall, so draw them all.`
        : `Clue ${c} already has all its walls, so its remaining edges can't be walls. Clear them.`;
    }
    return kind === "wall"
      ? `Clue ${c} needs all its remaining edges to be walls, so this one must be a wall.`
      : `Clue ${c} already has all its walls, so this edge can't be one.`;
  },

  // Both region-size rules carry their evidence cells, so the narration
  // states the sizes it is comparing rather than "the target size".
  /** Joining two regions would make `joined` cells (unknown when the rule
   * carried none), against regions of `k`. */
  notTooBig: (joined: number | undefined, k: number): string =>
    joined === undefined
      ? `Joining these two regions would leave more than the ${k} cells a region holds, so this edge must be a wall.`
      : `Joining these two regions would make ${joined} cells, but a region here holds ${k}, so this edge must be a wall.`,

  /** A region of `size` cells (unknown when the rule carried none), short of
   * `k`, with one way left to grow. */
  notTooSmall: (size: number | undefined, k: number): string =>
    size === undefined
      ? `This region is short of its ${k} cells and has just one way left to grow, so this edge can't be a wall.`
      : `This region has ${size} of its ${k} cells and just one way left to grow, so this edge can't be a wall.`,

  noDanglingEdges:
    "A wall can't stop in mid-air at this corner, so this edge must be a wall.",

  /** Both edges border one region, so clue `c` forces them alike. */
  equivalentEdges: (c: number, kind: EdgeKind, multi: boolean): string => {
    // The crux: both highlighted edges border the same connected region,
    // so the clue cell is either inside all of it (both edges open) or
    // walled off from all of it (both walled), and it can't do one of
    // each. That coupling is what makes the clue's count force the
    // edges; an earlier narration omitted it and read as a non-sequitur.
    if (multi) {
      return kind === "wall"
        ? `Both edges border the same region, so they share a fate: both walls or both open. Leaving both open would leave clue ${c} short of walls, so both must be walls.`
        : `Both edges border the same region, so they share a fate: both walls or both open. Walling both would exceed clue ${c}, so neither can be a wall.`;
    }
    // Rare post-dedup singleton (the partner edge was already shown).
    return kind === "wall"
      ? `This edge borders a region clue ${c} can't fully open, so it must be a wall.`
      : `This edge borders a region clue ${c} can't wall off, so it can't be a wall.`;
  },
};
