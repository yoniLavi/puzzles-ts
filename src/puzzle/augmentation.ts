import type { ConfigValues, PuzzleId } from "../engine/types.ts";

/**
 * The declared option names for a config's `choices` fields, keyed by field id —
 * the `choicenames` of the `ConfigDescription` the midend builds from a game's
 * `paramConfig`, which is the same array `difficultyTiers(game)` reads.
 *
 * Passing it in is what lets a bare `{difficulty}` token render the tier the
 * game actually declares instead of a word typed out here. Optional so a caller
 * with nothing to offer still renders everything else.
 */
export type ChoiceNames = Record<string, readonly string[] | undefined>;

/**
 * Per-puzzle presentation metadata: how a custom configuration reads in the
 * type header, and how the palette behaves in dark mode.
 */
export interface PuzzleAugmentations {
  /**
   * Construct a human-readable description of the given puzzle configuration.
   *
   * The implementations here try to follow the style of the existing preset
   * titles for the same puzzle. (Capitalization and punctuation vary quite a
   * bit between puzzles.) American spelling, per AGENTS.md § "Code
   * conventions".
   *
   * **A tier list is never spelled out here.** Write a bare `{difficulty}` and
   * pass `names`, so the header and the Custom dialog beside it name a tier from
   * one source; a token that spells its own options is for presentation shaping
   * (punctuation, leading spaces, an empty branch), which has no other source.
   */
  describeConfig?: (config: ConfigValues, names?: ChoiceNames) => string;

  /**
   * Index of palette color used as background. (Default 0.)
   */
  paletteBgIndex?: number;

  darkMode?: {
    /**
     * Palette indexes that need special handling in automatic dark mode
     * generation. Set to:
     * - `false` to leave the puzzle's light-mode palette color unchanged
     *   in dark mode (e.g., for semantic "black" or "white")
     * - a number to scale the lightness of the calculated dark mode color
     * - an OKLCH color tuple to specify a fixed color
     */
    paletteOverrides?: Record<number, false | number | [number, number, number]>;

    /**
     * Pairs of palette index to swap after automatic dark mode generation.
     * Applied after any paletteOverrides.
     *
     * This is useful for puzzles that use game_mkhighlight to create a 3D
     * effect, where the inverted dark mode lightness results in swapping
     * embossed and inset appearances. (Not all uses of game_mkhighlight
     * should be swapped. E.g., cursor and selection indicators are usually
     * better left as is.)
     */
    paletteSwaps?: [number, number][];
  };
}

export const puzzleAugmentations: Record<PuzzleId, PuzzleAugmentations> = {
  abcd: {
    describeConfig: configFormatter(
      "{width}x{height}, {letters} letters {remove-clues:Easy|Hard}{allow-diagonal-touching:, no diagonal|}",
    ),
  },
  ascent: {
    describeConfig: configFormatter(
      "{width}x{height}{grid-type} {difficulty}{always-show-start-and-end-points}{symmetrical-clues}",
      {
        "grid-type": [" (no diagonals)", "", " Hexagon", " Honeycomb", " Edges"],
        "always-show-start-and-end-points": [", hidden ends", ""], // boolean, on by default
        "symmetrical-clues": ["", ", symmetric"], // boolean, off by default
      },
    ),
  },
  blackbox: {
    describeConfig: configFormatter("{width}x{height}, {no-of-balls}", {
      "no-of-balls": (value) => (String(value) === "1" ? "1 ball" : `${value} balls`),
    }),
    darkMode: {
      paletteSwaps: [[5, 6]], // 3D
    },
  },
  boats: {
    describeConfig: configFormatter(
      "{width}x{height}, size {fleet-size} {difficulty}{remove-numbers}{fleet-configuration}",
      {
        "remove-numbers": ["", ", hidden clues"], // boolean, default off
        // fleet is a comma-separated list of numbers (boats.c removes spaces), default ""
        "fleet-configuration": (value) => (value ? `, fleet ${value}` : ""),
      },
    ),
  },
  bricks: {
    describeConfig: configFormatter("{width}x{height} {difficulty}"),
  },
  bridges: {
    describeConfig: configFormatter(
      "{width}x{height} {difficulty}{allow-loops}{max-bridges-per-direction}{percentage-of-island-squares}{expansion-factor}",
      {
        // Don't include default values in description
        "allow-loops": (value) => (value ? "" : ", no loops"),
        "max-bridges-per-direction": (value) =>
          value === 0
            ? ", max 1 bridge"
            : value === 1
              ? "" // default max 2 bridges
              : `, max ${Number(value) + 1} bridges`,
        "percentage-of-island-squares": (value) =>
          // Choices "5%", "10%", "15%", "20%", "25%", "30%", default "30%"
          value === 5 ? "" : `, ${5 + 5 * Number(value)}% islands`,
        "expansion-factor": (value) =>
          // Choices "0%", "10%", "20%", ..., "100%", default "10%"
          value === 1 ? "" : `, ${10 * Number(value)}% expansion`,
      },
    ),
  },
  clusters: {
    describeConfig: configFormatter("{width}x{height} {difficulty}"),
  },
  crossing: {
    describeConfig: configFormatter("{width}x{height}{symmetric-walls:|, symmetric}"),
  },
  cube: {
    describeConfig: configFormatter(
      // This won't exactly replicate the preset titles, which don't show dimensions.
      // (We'd need to suppress default dimensions, which vary by type of solid.)
      "{type-of-solid}, {width-top}x{height-bottom}",
    ),
  },
  dominosa: {
    describeConfig: configFormatter("Order {maximum-number-on-dominoes}, {difficulty}"),
  },
  fifteen: {
    describeConfig: configFormatter("{width}x{height}"),
    darkMode: {
      paletteSwaps: [[2, 3]], // 3D
    },
  },
  filling: {
    describeConfig: configFormatter("{width}x{height}"),
  },
  flip: {
    describeConfig: configFormatter("{width}x{height} {shape-type}"),
  },
  flood: {
    describeConfig: configFormatter(
      "{width}x{height}, {colors} colors{extra-moves-permitted}",
      {
        "extra-moves-permitted": (value) =>
          Number(value) > 0 ? `, ${value} extra moves` : "",
      },
    ),
    darkMode: {
      // The separator between regions is `BLACK`, a pinned token, so it needs
      // no override to stay black.
      paletteSwaps: [[12, 13]], // 3D
    },
  },
  galaxies: {
    describeConfig: configFormatter("{width}x{height} {difficulty}"),
  },
  group: {
    describeConfig: configFormatter(
      "{grid-size}x{grid-size} {difficulty}{show-identity:, identity hidden|}",
    ),
  },
  guess: {
    describeConfig: configFormatter(
      "{pegs-per-guess}x{guesses}, {colors} colors{allow-blanks:| + blank}{allow-duplicates:, no duplicates|}",
    ),
  },
  inertia: {
    describeConfig: configFormatter("{width}x{height}"),
    darkMode: {
      paletteSwaps: [[2, 3]], // 3D
    },
  },
  keen: {
    describeConfig: configFormatter(
      "{grid-size}x{grid-size} {difficulty}{multiplication-only:|, multiplication only}",
    ),
  },
  lightup: {
    describeConfig: configFormatter(
      "{width}x{height} {difficulty}{percentage-of-black-squares}{symmetry}",
      {
        // Default black squares is "20". Note value is 5-100, not 0.05-1.0.
        "percentage-of-black-squares": (value) =>
          String(value) === "20" ? "" : `, ${value}% black squares`,
        symmetry: (value, _, config) => {
          // Choices. Presets vary: 7x7 is 4-way rotational, 10x10 and 14x14 are 2-way rotational.
          // 4-way is only valid with square grid.
          const width = Number(config["width"]);
          const height = Number(config["height"]);
          const defaultChoice = width === height && width * height < 50 ? 4 : 2;
          const choice = Number(value);
          const symmetry = [
            "no symmetry",
            "2-way mirror",
            "2-way rotational",
            "4-way mirror",
            "4-way rotational",
          ][choice];
          return choice === defaultChoice ? "" : `, ${symmetry}`;
        },
      },
    ),
  },
  loopy: {
    describeConfig: configFormatter("{width}x{height} {grid-type} - {difficulty}", {
      "grid-type": [
        "Squares",
        "Triangular",
        "Honeycomb",
        "Snub-Square",
        "Cairo",
        "Great-Hexagonal",
        "Octagonal",
        "Kites",
        "Floret",
        "Dodecagonal",
        "Great-Dodecagonal",
        "Penrose (kite/dart)",
        "Penrose (rhombs)",
        "Great-Great-Dodecagonal",
        "Kagome",
        "Compass-Dodecagonal",
        "Hats",
        "Spectres",
      ],
    }),
    // The undecided and ruled-out edges take their dark values from the shared
    // palette (`lineMaybeColor` / `lineNoColor`); a lightness multiplier here
    // would darken an already-dark inversion into invisibility.
  },
  magnets: {
    describeConfig: configFormatter(
      "{width}x{height} {difficulty}{strip-clues:|, strip clues}",
    ),
  },
  map: {
    describeConfig: configFormatter(
      "{width}x{height}, {regions} regions, {difficulty}",
    ),
  },
  mathrax: {
    describeConfig: (config, names) => {
      const { size } = config;
      const difficulty = names?.["difficulty"]?.[Number(config["difficulty"])];
      const enabledClues: string[] = [];
      const disabledClues: string[] = [];
      for (const clueType of [
        "addition",
        "subtraction",
        "multiplication",
        "division",
        "equality",
        "even-odd",
      ]) {
        (config[`${clueType}-clues`] ? enabledClues : disabledClues).push(clueType);
      }

      // Default is all types enabled; otherwise describe the shorter of the lists
      const cluesDescription =
        disabledClues.length === 0
          ? ""
          : enabledClues.length <= disabledClues.length
            ? `, only ${enabledClues.join("/")}`
            : `, no ${disabledClues.join("/")}`;
      return `${size}x${size} ${difficulty}${cluesDescription}`;
    },
  },
  mines: {
    describeConfig: configFormatter(
      "{width}x{height}, {mines} mines{ensure-solubility:, risky|}",
    ),
    darkMode: {
      paletteSwaps: [
        [0, 1], // cleared/uncleared background
        [16, 17], // 3D edges
      ],
    },
  },
  mosaic: {
    // Note: settings config lists "Height" before "Width"
    describeConfig: configFormatter("Size: {width}x{height}{aggressive-generation}", {
      "aggressive-generation": (value, _, { width, height }) => {
        // Boolean: on for 3x3, 5x5, 10x10, 15x15, 25x25 presets; off for 50x50.
        // "not recommended for boards larger than, say, 30x30"
        const defaultOption = Number(width) * Number(height) < 30 * 30;
        return value === defaultOption
          ? ""
          : `, ${value ? "slower" : "faster"} generation`;
      },
    }),
  },
  net: {
    describeConfig: configFormatter(
      "{width}x{height}{walls-wrap-around:| wrapping}{barrier-probability}{ensure-unique-solution:, ambiguous|}",
      {
        // Show barrier % if not default 0
        "barrier-probability": (value) =>
          Number(value) > 0 ? `, ${percentage(value)} barriers` : "",
      },
    ),
  },
  netslide: {
    describeConfig: ({ width, height, ...config }) => {
      const wrapping = Boolean(config["walls-wrap-around"]);
      const barrierProbability = Number(config["barrier-probability"]);
      // Replicate difficulty logic from preset titles
      let difficulty: string;
      if (!wrapping && barrierProbability === 1) {
        difficulty = " easy";
      } else if (!wrapping && barrierProbability === 0) {
        difficulty = " medium";
      } else if (wrapping && barrierProbability === 0) {
        difficulty = " hard";
      } else {
        // Custom difficulty
        difficulty =
          barrierProbability > 0 ? `, ${percentage(barrierProbability)} barriers` : "";
        if (wrapping) {
          difficulty += ", wrapping";
        }
      }
      const shuffles = Number(config["number-of-shuffling-moves"]);
      return `${width}x${height}${difficulty}${shuffles ? `, ${shuffles} shuffles` : ""}`;
    },
  },
  palisade: {
    describeConfig: configFormatter(
      "{width} x {height}, regions of size {region-size}",
    ),
    // Palisade grid/clue/line-yes all share palette index 2; the undecided line
    // (index 3) takes its dark value from the shared `lineMaybeColor`.
  },
  pattern: {
    describeConfig: configFormatter("{width}x{height}"),
  },
  pearl: {
    describeConfig: configFormatter(
      "{width}x{height} {difficulty}{allow-unsoluble:|, ambiguous}",
    ),
    darkMode: {
      paletteOverrides: { 0: 1.15 }, // lighten bg
    },
  },
  pegs: {
    // Note: Cross and Octagon currently allow only specific sizes, all covered
    // by presets. (So any params that don't match a preset will be board-type Random.)
    describeConfig: configFormatter("{board-type} {width}x{height}"),
  },
  range: {
    describeConfig: configFormatter("{width}x{height}"),
    // A shaded square is a pinned `BLACK` piece and a known-white cell a pinned
    // `WHITE` one; ink, grid and the flash adapt with the scheme.
  },
  rect: {
    describeConfig: configFormatter(
      "{width}x{height}{expansion-factor}{ensure-unique-solution:, ambiguous|}",
      {
        "expansion-factor": (value) =>
          Number(value) === 0 ? "" : `, ${percentage(value)} expansion`,
      },
    ),
  },
  rome: {
    describeConfig: configFormatter("{width}x{height} {difficulty}"),
  },
  salad: {
    describeConfig: (config, names) => {
      const isNumbers = Number(config["game-mode"]) > 0;
      const size = Number(config["size"]);
      const symbols = Number(config["symbols"]);
      const tier = names?.["difficulty"]?.[Number(config["difficulty"])];
      const range = isNumbers
        ? `1~${symbols}`
        : `A~${String.fromCharCode(65 + symbols - 1)}`;
      return `${isNumbers ? "Numbers" : "Letters"}: ${size}x${size} ${range}${tier ? ` ${tier}` : ""}`;
    },
  },
  samegame: {
    describeConfig: configFormatter(
      "{width}x{height}, {no-of-colors} colors{ensure-solubility:, ambiguous|}{scoring-system:, alt. scoring|}",
    ),
    darkMode: {
      paletteSwaps: [[12, 13]], // 3D
    },
  },
  seismic: {
    describeConfig: configFormatter("{game-mode}: {width}x{height} {difficulty}"),
  },
  separate: {
    describeConfig: configFormatter("{width}x{height}, {letters} letters"),
    // Separate shares Palisade's palette: grid/letter/wall on index 2, and the
    // undecided line on index 3 takes its dark value from `lineMaybeColor`.
  },
  signpost: {
    describeConfig: configFormatter(
      "{width}x{height}{start-and-end-in-corners:, free ends|}",
    ),
  },
  singles: {
    describeConfig: configFormatter("{width}x{height} {difficulty}"),
  },
  sixteen: {
    describeConfig: configFormatter("{width}x{height}{number-of-shuffling-moves}", {
      "number-of-shuffling-moves": (value) => (value ? `, ${value} shuffles` : ""),
    }),
    darkMode: {
      paletteSwaps: [[2, 3]], // 3D
    },
  },
  slant: {
    describeConfig: configFormatter("{width}x{height} {difficulty}"),
  },
  slide: {
    describeConfig: configFormatter("{width}x{height}, {solution-length-limit}", {
      "solution-length-limit": (value) =>
        Number(value) <= 0 ? "no move limit" : `max ${value} moves`,
    }),
    darkMode: {
      paletteSwaps: [
        [1, 2], // 3D
        [4, 5], // 3D dragging
        [7, 8], // main block 3D
        [10, 11], // main block 3D dragging
        [16, 17], // wall 3D
        [19, 20], // ordinary block 3D
      ],
    },
  },
  sokoban: {
    describeConfig: configFormatter("{width}x{height}"),
    darkMode: {
      paletteSwaps: [[9, 10]], // 3D
    },
  },
  solo: {
    describeConfig: (config, names) => {
      const width = Number(config["columns-of-sub-blocks"]);
      const height = Number(config["rows-of-sub-blocks"]);
      const isJigsaw = Boolean(config["jigsaw"]);
      const isKiller = Boolean(config["killer"]);
      const isX = Boolean(config["x"]);
      const difficulty = names?.["difficulty"]?.[Number(config["difficulty"])];
      const symmetry = [
        "no symmetry", // default for Killer
        "2-way rotation", // default for all but Killer
        "4-way rotation",
        "2-way mirror",
        "2-way diagonal mirror",
        "4-way mirror",
        "4-way diagonal mirror",
        "8-way mirror",
      ][Number(config["symmetry"])];
      const hasDefaultSymmetry = config["symmetry"] === (isKiller ? 0 : 1);

      // Replicate preset titles
      const dimensions = isJigsaw ? `${width * height} Jigsaw` : `${width}x${height}`;
      const fullDifficulty = isKiller
        ? difficulty === "Trivial"
          ? "Killer" // "Killer" replaces "Trivial"
          : `Killer ${difficulty}`
        : difficulty;
      const symmetryDescription = hasDefaultSymmetry ? "" : `, ${symmetry}`;

      return `${dimensions} ${fullDifficulty}${isX ? " X" : ""}${symmetryDescription}`;
    },
  },
  spokes: {
    describeConfig: configFormatter("{width}x{height} {difficulty}"),
  },
  sticks: {
    describeConfig: configFormatter(
      "{width}x{height}{percentage-of-black-squares}{symmetry}",
      {
        // Default black squares is "20". Note value is 5-100, not 0.05-1.0.
        "percentage-of-black-squares": (value) =>
          String(value) === "20" ? "" : `, ${value}% black squares`,
        symmetry: [
          ", no symmetry",
          ", 2-way mirror",
          "", // default: 2-way rotational
          ", 4-way mirror",
          ", 4-way rotational",
        ],
      },
    ),
  },
  subsets: {
    // doesn't currently support custom configuration
  },
  tents: {
    describeConfig: configFormatter("{width}x{height} {difficulty}"),
  },
  towers: {
    describeConfig: configFormatter("{grid-size}x{grid-size} {difficulty}"),
  },
  tracks: {
    describeConfig: configFormatter(
      "{width}x{height} {difficulty}{disallow-consecutive-1-clues:, allow adjacent 1’s|}",
    ),
  },
  twiddle: {
    describeConfig: (config) => {
      // Replicate preset titles
      const blockSize = Number(config["rotating-block-size"]);
      const blockSizeDescription =
        blockSize === 2
          ? "" // don't show default block size
          : `, rotating ${blockSize}x${blockSize} blocks`;

      const qualifiers: string[] = [];
      if (config["one-number-per-row"]) {
        qualifiers.push("rows only");
      }
      if (config["orientation-matters"]) {
        qualifiers.push("orientable");
      }
      if (!qualifiers.length && !blockSizeDescription) {
        // Only show "normal" if there's no other qualifier or block size
        qualifiers.push("normal");
      }
      const description = qualifiers.length ? ` ${qualifiers.join(", ")}` : "";
      const shuffles = Number(config["number-of-shuffling-moves"])
        ? `, ${Number(config["number-of-shuffling-moves"])} shuffles`
        : "";
      return `${config["width"]}x${config["height"]}${description}${blockSizeDescription}${shuffles}`;
    },
    darkMode: {
      paletteSwaps: [
        [2, 4], // highlight/lowlight 3D
        [3, 5], // gentle highlight/lowlight
        // Indices 6 and 7 (the two cursor slots) both hold `CURSOR`, so they
        // need no swap.
      ],
    },
  },
  undead: {
    describeConfig: configFormatter("{width}x{height} {difficulty}"),
  },
  unequal: {
    describeConfig: configFormatter("{mode}: {size}x{size} {difficulty}"),
  },
  unruly: {
    describeConfig: configFormatter(
      "{width}x{height} {difficulty}{unique-rows-and-columns:|, unique}",
    ),
    // The two tile bases author their dark values and `mkhighlightSpecific`
    // hands that on to each bevel trio, so "black" and "white" and their 3D
    // effects survive dark mode without a per-index override.
  },
  untangle: {
    describeConfig: configFormatter("{number-of-points} points"),
    paletteBgIndex: 1,
  },
};

/**
 * Factory for creating custom ConfigValues formatters from a template string
 * using this basic syntax:
 * - `{field}` substitutes the field value as a string.
 * - `{field:option 0|option 1|...}` coerces the field value to a number and
 *   substitutes the corresponding option string from a pipe-separated list.
 *   (If the value is out of range, the raw value is substituted as a string.)
 *   This syntax also works with boolean(ish) values: `{field:if false|if true}`.
 * - Anything outside {braces} is inserted verbatim.
 * - If the field does not appear in the config (or is undefined), it is not replaced.
 *
 * The customFormats argument can be used to provide additional per-field logic:
 * - If customFormats[field] is an array, it is treated as a list of options.
 *   (This may make the template string more readable for long options lists.)
 * - If customFormats[field] is a function, it is called with
 *   `(value, field, config: ConfigValues)` and should return a string.
 *
 * It is an error to specify both options and customFormats for the same field.
 */
function configFormatter(
  template: string,
  customFormats?: Record<
    string,
    | string[]
    | ((val: string | boolean | number, field: string, config: ConfigValues) => string)
  >,
) {
  return (config: ConfigValues, names?: ChoiceNames): string =>
    template.replace(
      /\{(?<field>[a-z0-9-]+)(?::(?<options>[^}]*))?}/g,
      (orig, field: string, optionsList?: string): string => {
        const value = config[field];
        if (value === undefined) {
          return orig;
        }
        const custom = customFormats?.[field];
        if (custom !== undefined) {
          if (!import.meta.env.PROD && optionsList !== undefined) {
            throw new Error(`Field '${field}' has both options and customFormats`);
          }
          if (typeof custom === "function") {
            return custom(value, field, config);
          }
          return custom[Number(value)] ?? String(value);
        }
        if (optionsList !== undefined) {
          const options = optionsList.split("|");
          return options[Number(value)] ?? "";
        }
        // A bare `{field}` on a choices field renders the name the *game*
        // declares, from the same `ConfigDescription` the Custom dialog is
        // built from, so a tier list has one source.
        const declared = names?.[field];
        if (declared) {
          return declared[Number(value)] ?? String(value);
        }
        return String(value);
      },
    );
}

/**
 * Convert ConfigValues value 0.0-1.0 to percentage string
 */
function percentage(value: string | boolean | number) {
  return `${Math.round(Number(value) * 100)}%`;
}
