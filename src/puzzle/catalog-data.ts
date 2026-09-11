/**
 * The game catalog: every puzzle the app serves, with the metadata the home
 * screen, the puzzle pages and the help system render.
 *
 * Committed source, deliberately: `vite.config.ts` imports it at config-load
 * time, so it has to exist in a clean checkout. The metadata came from
 * upstream's `puzzle()` calls in its CMake files, verified field for field
 * against the last catalog generated from them (57 games, zero differences).
 *
 * Adding a game means adding it here AND registering it in
 * `src/games/index.ts`; `catalog-registry.test.ts` holds the two lists to each
 * other.
 */

export interface PuzzleData {
  name: string;
  /**
   * Other names this puzzle is widely known by, for search to match on.
   *
   * A player hunts for the word they know a puzzle by, and this collection
   * renames most of them: Sudoku is Solo, Nonogram is Pattern, Minesweeper is
   * Mines. Without this the home screen's search box answers "no puzzle
   * matches" to the single most likely first query anyone types.
   *
   * **A declaration a mechanism consumes, not a manifest** — search reads it,
   * nothing asserts a game's membership from it, and a game with no other name
   * simply has none. Where a game's own help page states one ("known as
   * *Hakyuu*"), `catalog-aliases.test.ts` requires it to appear here, so the
   * two cannot disagree; the rest are the standard names the puzzle is
   * documented under everywhere. A name nobody could verify is left out, since
   * a wrong alias sends a player to the wrong game.
   */
  aliases?: readonly string[];
  description: string;
  objective: string;
  collection: "original" | "unreleased";
  // No `unfinished` flag: every game ships finished, and a new one is
  // implemented in one go.
}

export const puzzleCatalog = {
  abcd: {
    name: "ABCD",
    description: "Letter placement puzzle",
    objective:
      "Place letters according to the numbers. Identical letters cannot touch.",
    collection: "unreleased",
  },
  ascent: {
    name: "Ascent",
    aliases: ["Hidato", "Hidoku", "1to25"],
    description: "Path-finding puzzle",
    objective: "Place each number once to create a path.",
    collection: "unreleased",
  },
  blackbox: {
    name: "Black Box",
    description: "Ball-finding puzzle",
    objective: "Find the hidden balls in the box by bouncing laser beams off them.",
    collection: "original",
  },
  boats: {
    name: "Boats",
    aliases: ["Battleships"],
    description: "Boat-placing puzzle",
    objective: "Find the fleet in the grid.",
    collection: "unreleased",
  },
  bricks: {
    name: "Bricks",
    description: "Hexagonal shading puzzle",
    objective: "Shade cells in the hexagonal grid, each one supported from below.",
    collection: "unreleased",
  },
  bridges: {
    name: "Bridges",
    aliases: ["Hashiwokakero", "Hashi"],
    description: "Bridge-placing puzzle",
    objective: "Connect all the islands with a network of bridges.",
    collection: "original",
  },
  clusters: {
    name: "Clusters",
    description: "Red and blue grid puzzle",
    objective: "Fill in the grid with red and blue clusters, with all dead ends given.",
    collection: "unreleased",
  },
  crossing: {
    name: "Crossing",
    aliases: ["Nansuke", "Number Skeleton"],
    description: "Number crossword puzzle",
    objective: "Place each number from the list into the crossword.",
    collection: "unreleased",
  },
  cube: {
    name: "Cube",
    description: "Rolling cube puzzle",
    objective: "Pick up all the blue squares by rolling the cube over them.",
    collection: "original",
  },
  dominosa: {
    name: "Dominosa",
    aliases: ["Dominoes"],
    description: "Domino tiling puzzle",
    objective: "Tile the rectangle with a full set of dominoes.",
    collection: "original",
  },
  fifteen: {
    name: "Fifteen",
    aliases: ["15 Puzzle", "Sliding puzzle"],
    description: "Sliding block puzzle",
    objective: "Slide the tiles around to arrange them into order.",
    collection: "original",
  },
  filling: {
    name: "Filling",
    aliases: ["Fillomino"],
    description: "Polyomino puzzle",
    objective: "Mark every square with the area of its containing region.",
    collection: "original",
  },
  flip: {
    name: "Flip",
    description: "Tile inversion puzzle",
    objective: "Flip groups of squares to light them all up at once.",
    collection: "original",
  },
  flood: {
    name: "Flood",
    aliases: ["Flood It"],
    description: "Flood-filling puzzle",
    objective: "Turn the grid the same color in as few flood fills as possible.",
    collection: "original",
  },
  galaxies: {
    name: "Galaxies",
    aliases: ["Spiral Galaxies", "Tentai Show"],
    description: "Symmetric polyomino puzzle",
    objective: "Divide the grid into rotationally symmetric regions around dots.",
    collection: "original",
  },
  group: {
    name: "Group",
    description: "Group theory puzzle",
    objective: "Complete the unfinished Cayley table of a group.",
    collection: "original",
  },
  guess: {
    name: "Guess",
    aliases: ["Mastermind", "Bulls and Cows"],
    description: "Combination-guessing puzzle",
    objective: "Guess the hidden combination of colors.",
    collection: "original",
  },
  inertia: {
    name: "Inertia",
    description: "Gem-collecting puzzle",
    objective: "Collect all the gems without running into any of the mines.",
    collection: "original",
  },
  keen: {
    name: "Keen",
    aliases: ["KenKen", "Mathdoku", "Calcudoku"],
    description: "Arithmetic Latin square puzzle",
    objective: "Complete the latin square in accordance with the arithmetic clues.",
    collection: "original",
  },
  lightup: {
    name: "Light Up",
    aliases: ["Akari"],
    description: "Light-bulb placing puzzle",
    objective: "Place bulbs to light up all the squares.",
    collection: "original",
  },
  loopy: {
    name: "Loopy",
    aliases: ["Slitherlink"],
    description: "Loop-drawing puzzle",
    objective: "Draw a single closed loop, given clues about number of adjacent edges.",
    collection: "original",
  },
  magnets: {
    name: "Magnets",
    description: "Magnet-placing puzzle",
    objective: "Place magnets to satisfy the clues and avoid like poles touching.",
    collection: "original",
  },
  map: {
    name: "Map",
    description: "Map-coloring puzzle",
    objective: "Color the map so that adjacent regions are never the same color.",
    collection: "original",
  },
  mathrax: {
    name: "Mathrax",
    description: "Latin square puzzle",
    objective: "Place each number according to the arithmetic clues.",
    collection: "unreleased",
  },
  mines: {
    name: "Mines",
    aliases: ["Minesweeper"],
    description: "Mine-finding puzzle",
    objective: "Find all the mines without treading on any of them.",
    collection: "original",
  },
  mosaic: {
    name: "Mosaic",
    aliases: ["Fill-a-Pix"],
    description: "Grid-filling puzzle",
    objective: "Fill in the grid given clues about number of nearby black squares.",
    collection: "original",
  },
  net: {
    name: "Net",
    aliases: ["NetWalk"],
    description: "Network jigsaw puzzle",
    objective: "Rotate each tile to reassemble the network.",
    collection: "original",
  },
  netslide: {
    name: "Netslide",
    description: "Toroidal sliding network puzzle",
    objective: "Slide a row at a time to reassemble the network.",
    collection: "original",
  },
  palisade: {
    name: "Palisade",
    aliases: ["Five Cells"],
    description: "Grid-division puzzle",
    objective: "Divide the grid into equal-sized areas in accordance with the clues.",
    collection: "original",
  },
  pattern: {
    name: "Pattern",
    aliases: ["Nonogram", "Picross", "Griddlers", "Paint by Numbers"],
    description: "Pattern puzzle",
    objective:
      "Fill in the pattern in the grid, given only the lengths of runs of black squares.",
    collection: "original",
  },
  pearl: {
    name: "Pearl",
    aliases: ["Masyu"],
    description: "Loop-drawing puzzle",
    objective:
      "Draw a single closed loop, given clues about corner and straight squares.",
    collection: "original",
  },
  pegs: {
    name: "Pegs",
    aliases: ["Peg Solitaire"],
    description: "Peg solitaire puzzle",
    objective: "Jump pegs over each other to remove all but one.",
    collection: "original",
  },
  range: {
    name: "Range",
    aliases: ["Kurodoko"],
    description: "Visible-distance puzzle",
    objective:
      "Place black squares to limit the visible distance from each numbered cell.",
    collection: "original",
  },
  rect: {
    name: "Rectangles",
    aliases: ["Shikaku"],
    description: "Rectangles puzzle",
    objective: "Divide the grid into rectangles with areas equal to the numbers.",
    collection: "original",
  },
  rome: {
    name: "Rome",
    description: "Arrow-placing puzzle",
    objective: "Fill the grid with arrows leading to a goal.",
    collection: "unreleased",
  },
  salad: {
    name: "Salad",
    description: "Pseudo-Latin square puzzle",
    objective: "Place each character once per row and column, leaving some empty.",
    collection: "unreleased",
  },
  samegame: {
    name: "Same Game",
    aliases: ["Chain Shot"],
    description: "Block-clearing puzzle",
    objective: "Clear the grid by removing touching groups of the same color squares.",
    collection: "original",
  },
  seismic: {
    name: "Seismic",
    aliases: ["Hakyuu", "Ripple Effect"],
    description: "Number placement puzzle",
    objective: "Place numbers in each area, spacing equal numbers far enough apart.",
    collection: "unreleased",
  },
  separate: {
    name: "Separate",
    description: "Rectangle-dividing puzzle",
    objective: "Partition the grid into regions containing one of each letter.",
    collection: "original",
  },
  signpost: {
    name: "Signpost",
    description: "Square-connecting puzzle",
    objective: "Connect the squares into a path following the arrows.",
    collection: "original",
  },
  singles: {
    name: "Singles",
    aliases: ["Hitori"],
    description: "Number-removing puzzle",
    objective: "Black out the right set of duplicate numbers.",
    collection: "original",
  },
  sixteen: {
    name: "Sixteen",
    description: "Toroidal sliding block puzzle",
    objective: "Slide a row at a time to arrange the tiles into order.",
    collection: "original",
  },
  slant: {
    name: "Slant",
    description: "Maze-drawing puzzle",
    objective: "Draw a maze of slanting lines that matches the clues.",
    collection: "original",
  },
  slide: {
    name: "Slide",
    description: "Sliding block puzzle",
    objective: "Slide the blocks to let the key block out.",
    collection: "original",
  },
  sokoban: {
    name: "Sokoban",
    description: "Barrel-pushing puzzle",
    objective: "Push all the barrels into the target squares.",
    collection: "original",
  },
  solo: {
    name: "Solo",
    aliases: ["Sudoku", "Number Place"],
    description: "Number placement puzzle",
    objective: "Fill the grid so every row, column and block has one of each digit.",
    collection: "original",
  },
  spokes: {
    name: "Spokes",
    description: "Wheel-connecting puzzle",
    objective: "Connect all hubs using horizontal, vertical and diagonal lines.",
    collection: "unreleased",
  },
  sticks: {
    name: "Sticks",
    aliases: ["Tatebo-Yokobo"],
    description: "Line-drawing puzzle",
    objective: "Fill in the grid with horizontal and vertical line segments.",
    collection: "unreleased",
  },
  subsets: {
    name: "Subsets",
    description: "Set-defining puzzle",
    objective: "Place each set once, in accordance with the subset clues.",
    collection: "unreleased",
  },
  tents: {
    name: "Tents",
    aliases: ["Tents and Trees"],
    description: "Tent-placing puzzle",
    objective: "Place a tent next to each tree.",
    collection: "original",
  },
  towers: {
    name: "Towers",
    aliases: ["Skyscrapers"],
    description: "Tower-placing Latin square puzzle",
    objective: "Complete the latin square of towers in accordance with the clues.",
    collection: "original",
  },
  tracks: {
    name: "Tracks",
    aliases: ["Train Tracks"],
    description: "Path-finding railway track puzzle",
    objective: "Fill in the railway track according to the clues.",
    collection: "original",
  },
  twiddle: {
    name: "Twiddle",
    description: "Rotational sliding block puzzle",
    objective: "Rotate the tiles around themselves to arrange them into order.",
    collection: "original",
  },
  undead: {
    name: "Undead",
    aliases: ["Haunted Mirror Maze"],
    description: "Monster-placing puzzle",
    objective: "Place ghosts, vampires and zombies to match what the mirrors see.",
    collection: "original",
  },
  unequal: {
    name: "Unequal",
    aliases: ["Futoshiki"],
    description: "Latin square puzzle",
    objective: "Complete the latin square in accordance with the > signs.",
    collection: "original",
  },
  unruly: {
    name: "Unruly",
    description: "Black and white grid puzzle",
    objective: "Fill in the black and white grid to avoid runs of three.",
    collection: "original",
  },
  untangle: {
    name: "Untangle",
    aliases: ["Planarity"],
    description: "Planar graph layout puzzle",
    objective: "Reposition the points so that the lines do not cross.",
    collection: "original",
  },
} as const satisfies Record<string, PuzzleData>;

/** Catalog ids, sorted — the display order the home screen and menus use. */
export const puzzleIds: readonly string[] = Object.keys(puzzleCatalog);
