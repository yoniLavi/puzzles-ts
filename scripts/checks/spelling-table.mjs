/**
 * The British→American stem table. **This file is the convention** — the
 * `repo-layout` requirement "Source, documentation and specs use American
 * English spelling" points here, `spelling.mjs` (the gate guard) scans for
 * every stem in it, `spelling-fold.mjs` applies it to stdin, and the one-shot
 * sweep that respelled the tree applied exactly this and nothing else.
 *
 * ## Why a table and not a rule
 *
 * `-ise → -ize` as a regex rewrites `precise`, `promise`, `otherwise`,
 * `exercise`, `compromise`, `noise`, `raise`, `arise`, `revise`, `devise` —
 * all correct American English. `-our → -or` rewrites `hour`, `four`, `tour`,
 * `contour`, `source`. So every entry is an explicit stem, matched as a
 * **substring** (so `ncolours`, `bgcolour` and `colourToOKLCH` are found) and
 * case-preservingly (`Colour` → `Color`, `COLOUR` → `COLOR`). A stem that is
 * also a fragment of an American word may not be added: `organis` would turn
 * `organism` into `organizm`, which is why the `-ise` family carries a
 * lookahead for the suffixes that make it a verb.
 *
 * ## What is deliberately absent
 *
 * - `spectre` — the aperiodic Spectre tiling (`src/engine/grid/tilings/`) is a
 *   proper noun, named by its discoverers.
 * - `towards`, `maths`, `anticlockwise`, `-wards`, `got/gotten` — vocabulary,
 *   not spelling; accepted in American English or already American here.
 * - `dialog` in the sense of the HTML element; `prologue`/`epilogue`, which
 *   American keeps; `glamour`, likewise.
 * - `analyses` — the plural noun of `analysis` is American; only the verb
 *   forms `analyse`/`analysed`/`analyser`/`analysing` are folded.
 * - `smelt` — a metal is smelted in American English too.
 *
 * Adding a stem: put it here, run `node scripts/checks/spelling.mjs` to see
 * what it finds, and fold the hits with `spelling-fold.mjs` — never fix a
 * spelling by hand that the table does not know, or the guard never learns it.
 */

/**
 * "Not followed by a lowercase letter" — the end of a word, or the seam of a
 * camelCase identifier. Written with a modifier because every rule runs
 * case-insensitively, under which a plain `[a-z]` would also refuse `A` and
 * `isCancelledAt` would never fold.
 */
const END = "(?!(?-i:[a-z]))";

/**
 * `-ise` verbs and their `-isation`/`-iser`/`-isable` derivatives: the stem is
 * followed by `is`, then a suffix that makes it a verb form. `organism`,
 * `optimism`, `hypothesis`, `emphasis` and `characteristic` all fail the
 * lookahead and are left alone.
 */
const ise = (stem) => ({ from: `${stem}is(?=e|ing|ation|able)`, to: `${stem}iz` });

/**
 * Consonant doubling before a suffix: `cancelled` → `canceled`, `labelling` →
 * `labeling`, `traveller` → `traveler`. American doubles the `l` when the last
 * syllable is stressed (`controlled`, `compelled`, `enrolled`), so those stems
 * are not listed. The suffix must end the word or meet an uppercase letter, so
 * `aria-labelledby` — the platform's attribute — is untouched.
 */
const single = (stems) => ({
  from: `(${stems.join("|")})l(?=(?:ed|ing|er|ers)${END})`,
  to: "$1",
});

/**
 * Each entry is `{ from, to }`: `from` is a regex source applied with the `gi`
 * flags, `to` its replacement (with `$1` allowed), lowercase — case is
 * restored from the matched text. Order matters only where a later stem is a
 * substring of an earlier one's *output* (`centred` before `centre`, or
 * `centered` would come out `centerd`).
 */
export const RULES = [
  // -our
  { from: `colour`, to: "color" },
  { from: `neighbour`, to: "neighbor" },
  { from: `behaviour`, to: "behavior" },
  { from: `favour`, to: "favor" },
  { from: `flavour`, to: "flavor" },
  { from: `honour`, to: "honor" },
  { from: `labour`, to: "labor" },
  { from: `harbour`, to: "harbor" },
  { from: `armour`, to: "armor" },
  { from: `rumour`, to: "rumor" },
  { from: `humour`, to: "humor" },
  { from: `rigour`, to: "rigor" },
  { from: `vigour`, to: "vigor" },
  { from: `vapour`, to: "vapor" },
  { from: `tumour`, to: "tumor" },
  { from: `odour`, to: "odor" },
  { from: `ardour`, to: "ardor" },
  { from: `candour`, to: "candor" },
  { from: `clamour`, to: "clamor" },
  { from: `fervour`, to: "fervor" },
  { from: `parlour`, to: "parlor" },
  { from: `savour`, to: "savor" },
  { from: `saviour`, to: "savior" },
  { from: `splendour`, to: "splendor" },
  { from: `valour`, to: "valor" },
  { from: `endeavour`, to: "endeavor" },
  { from: `demeanour`, to: "demeanor" },
  // -re
  { from: `centred`, to: "centered" },
  { from: `centring`, to: "centering" },
  { from: `centre`, to: "center" },
  { from: `mitred`, to: "mitered" },
  { from: `mitring`, to: "mitering" },
  { from: `mitre`, to: "miter" },
  { from: `metre`, to: "meter" },
  { from: `litre`, to: "liter" },
  { from: `fibre`, to: "fiber" },
  { from: `theatre`, to: "theater" },
  { from: `sombre`, to: "somber" },
  { from: `lustre`, to: "luster" },
  { from: `calibre`, to: "caliber" },
  { from: `sabre`, to: "saber" },
  { from: `meagre`, to: "meager" },
  { from: `manoeuvring`, to: "maneuvering" },
  { from: `manoeuvre`, to: "maneuver" },
  // grey
  { from: `grey`, to: "gray" },
  // -ise / -isation / -iser
  ...[
    "initial",
    "serial",
    "normal",
    "optim",
    "recogn",
    "minim",
    "maxim",
    "organ",
    "real",
    "summar",
    "memo",
    "random",
    "stabil",
    "priorit",
    "custom",
    "general",
    "special",
    "visual",
    "capital",
    "synchron",
    "categor",
    "emphas",
    "util",
    "final",
    "sanit",
    "token",
    "character",
    "formal",
    "penal",
    "equal",
    "item",
    "symbol",
    "factor",
    "quant",
    "linear",
    "discret",
    "parametr",
    "parameter",
    "author",
    "standard",
    "local",
    "material",
    "neutral",
    "rational",
    "revital",
    "scrutin",
    "apolog",
    "critic",
    "harmon",
    "popular",
    "mobil",
    "monopol",
    "patron",
    "public",
    "subsid",
    "theor",
    "vocal",
    "energ",
    "amort",
    "contextual",
    "external",
    "internal",
    "hypothes",
    "synthes",
    "institutional",
    "plural",
    "polar",
    "raster",
    "target",
    "digit",
    "canonical",
    "central",
    "modern",
    "legal",
    "civil",
    "personal",
    "trivial",
    "ideal",
    "human",
    "magnet",
    "oxid",
    "incentiv",
    "italic",
    "alphabet",
    "sympath",
    "agon",
    "immun",
    "colon",
    "steril",
    "fertil",
    "familiar",
    "vandal",
    "verbal",
    "atom",
    "monet",
    "regular",
    "vapor",
  ].map(ise),
  { from: `analys(?=e${END}|ed${END}|er|ing)`, to: "analyz" },
  { from: `paralys(?=e${END}|ed${END}|ing)`, to: "paralyz" },
  { from: `catalys(?=e${END}|ed${END}|ing)`, to: "catalyz" },
  { from: `practis(?=e|ing)`, to: "practic" },
  // -ogue
  { from: `catalogued`, to: "cataloged" },
  { from: `cataloguing`, to: "cataloging" },
  { from: `catalogue`, to: "catalog" },
  { from: `analogue`, to: "analog" },
  { from: `dialogue`, to: "dialog" },
  // -ce
  { from: `licenc`, to: "licens" },
  { from: `defenc`, to: "defens" },
  { from: `offenc`, to: "offens" },
  { from: `pretenc`, to: "pretens" },
  // doubled l
  single([
    "bevel",
    "cancel",
    "dial",
    "label",
    "model",
    "pencil",
    "signal",
    "total",
    "travel",
    "level",
    "marshal",
    "initial",
    "channel",
    "fuel",
    "counsel",
    "equal",
    "rival",
    "tunnel",
    "quarrel",
    "spiral",
    "panel",
    "shovel",
    "swivel",
    "revel",
    "grovel",
    "unravel",
    "funnel",
    "kennel",
    "libel",
    "yodel",
    "jewel",
    "towel",
    "trowel",
    "barrel",
    "chisel",
    "gravel",
    "parcel",
    "pedal",
    "medal",
    "shrivel",
    "stencil",
    "tinsel",
  ]),
  { from: `jewellery`, to: "jewelry" },
  { from: `woollen`, to: "woolen" },
  // single l → double
  { from: `enrolment`, to: "enrollment" },
  { from: `enrol(?=s?${END})`, to: "enroll" },
  { from: `fulfilment`, to: "fulfillment" },
  { from: `fulfil(?=s?${END})`, to: "fulfill" },
  { from: `instalment`, to: "installment" },
  { from: `(?<![a-z])(in|di)stil(?=s?${END})`, to: "$1still" },
  { from: `(?<![a-z])appal(?=s?${END})`, to: "appall" },
  { from: `(?<![a-z])enthral(?=s?${END})`, to: "enthrall" },
  { from: `skilful`, to: "skillful" },
  { from: `wilful`, to: "willful" },
  // assorted
  { from: `artefact`, to: "artifact" },
  { from: `judgement`, to: "judgment" },
  { from: `acknowledgement`, to: "acknowledgment" },
  { from: `abridgement`, to: "abridgment" },
  { from: `programme(?=s?${END})`, to: "program" },
  { from: `(?<![a-z])whilst${END}`, to: "while" },
  { from: `(?<![a-z])amongst${END}`, to: "among" },
  { from: `(?<![a-z])amidst${END}`, to: "amid" },
  { from: `sceptic`, to: "skeptic" },
  { from: `(?<![a-z])ageing`, to: "aging" },
  { from: `learnt${END}`, to: "learned" },
  { from: `spelt${END}`, to: "spelled" },
  { from: `burnt${END}`, to: "burned" },
  { from: `dreamt${END}`, to: "dreamed" },
  { from: `leapt${END}`, to: "leaped" },
  { from: `spoilt${END}`, to: "spoiled" },
  { from: `mould`, to: "mold" },
  { from: `orientat(?=ed|ing)`, to: "orient" },
  { from: `(?<![a-z])tyre(?=s?${END})`, to: "tire" },
  { from: `(?<![a-z])kerb(?=s?${END}|ed|ing|side)`, to: "curb" },
  { from: `(?<![a-z])storeys${END}`, to: "stories" },
  { from: `(?<![a-z])storey${END}`, to: "story" },
  { from: `(?<![a-z])cheque(?=s?${END}|book)`, to: "check" },
  { from: `plough`, to: "plow" },
  { from: `draught`, to: "draft" },
  { from: `(?<![a-z])gaol`, to: "jail" },
  { from: `aluminium`, to: "aluminum" },
  { from: `aeroplane`, to: "airplane" },
  { from: `paedia`, to: "pedia" },
  { from: `paediatric`, to: "pediatric" },
  { from: `anaem`, to: "anem" },
  { from: `oestrogen`, to: "estrogen" },
  { from: `mediaeval`, to: "medieval" },
  { from: `foetus`, to: "fetus" },
  { from: `oesophag`, to: "esophag" },
  { from: `diarrhoea`, to: "diarrhea" },
  { from: `sulphur`, to: "sulfur" },
  { from: `pyjama`, to: "pajama" },
  { from: `moustache`, to: "mustache" },
  { from: `titbit`, to: "tidbit" },
  { from: `yoghurt`, to: "yogurt" },
  { from: `specialit(?=y|ies)`, to: "specialt" },
  { from: `(?<![a-z])cos(?=y${END}|ier${END}|iest${END}|ily${END}|iness)`, to: "coz" },
  { from: `annexe${END}`, to: "annex" },
];

/**
 * Names this project does not own, each with the files it is expected in.
 * Two kinds: a quotation of an upstream C symbol — a comment saying
 * "implements `game_colours`" names a function in Simon Tatham's `puzzles.h`,
 * and respelling it makes the pointer false — and a third-party API member
 * (`@sentry/browser` spells its `behaviour` option that way). The scope is
 * per file so an allowance cannot silently cover a new occurrence elsewhere —
 * a new port quoting `game_colours` adds its file here, deliberately. The
 * token is matched whole, delimited by anything but `[A-Za-z0-9_-]`, so
 * `sgt-puzzles-LICENCE` is not covered by an allowance for `LICENCE`.
 */
export const QUOTATIONS = {
  behaviour: ["src/utils/sentry.ts", "AGENTS.md", "openspec/specs/repo-layout/spec.md"],
  midend_colours: ["openspec/specs/repo-layout/spec.md"],
  game_colours: [
    "AGENTS.md",
    "openspec/specs/repo-layout/spec.md",
    "openspec/specs/ts-engine/spec.md",
    "src/games/group/render.ts",
    "src/games/loopy/render.ts",
    "src/games/map/render.ts",
    "src/games/pearl/render.ts",
    "src/games/signpost/render.ts",
    "src/games/slide/render.ts",
    "src/games/slide/slide-render.test.ts",
    "src/games/sokoban/render.ts",
    "src/games/solo/render.ts",
  ],
  frontend_default_colour: [
    "AGENTS.md",
    "openspec/specs/repo-layout/spec.md",
    "docs/games/rendering.md",
    "src/engine/color/color-mkhighlight.ts",
    "src/engine/game.ts",
    "src/games/loopy/render.ts",
    "src/games/netslide/render.ts",
    "src/puzzle/board-background.test.ts",
  ],
  midend_serialise: ["openspec/specs/ts-engine/spec.md", "src/engine/save.ts"],
  midend_deserialise: ["src/puzzle/puzzle.ts"],
  highlight_colour: ["src/games/twiddle/render.ts"],
  check_neighbours: ["openspec/specs/tracks/spec.md"],
  raise_colour: ["src/games/slide/render.ts"],
  net_neighbour: ["src/games/net/loops.ts"],
  neighbour_fn_t: ["src/engine/findloop.ts"],
  nc_colour: ["openspec/specs/guess/spec.md"],
  has_incentre: ["src/engine/grid/grid-core.ts"],
  grid_find_incentre: ["src/engine/grid/grid-geometry.ts"],
  face_colour: ["src/engine/loopgen.ts"],
  colour_mix: ["src/engine/color/color-mkhighlight.ts"],
  can_colour_face: ["src/engine/loopgen.ts"],
  bridges_neighbour: ["src/games/bridges/solver.ts"],
  alloc_find_neighbour: ["src/games/dominosa/generator.ts"],
};

/** Every rule, compiled once. */
const compiled = RULES.map(({ from, to }) => ({ re: new RegExp(from, "gi"), to }));

/** One regex that matches wherever any rule would fire. */
export const SCAN = new RegExp(RULES.map((r) => `(?:${r.from})`).join("|"), "gi");

/** Restore the case of `matched` onto the lowercase replacement `to`. */
function matchCase(matched, to) {
  const letters = matched.replace(/[^a-z]/gi, "");
  if (letters.length > 1 && letters === letters.toUpperCase()) return to.toUpperCase();
  if (/^[A-Z]/.test(matched)) return to[0].toUpperCase() + to.slice(1);
  return to;
}

/** Fold `text` to American spelling under the table, case-preservingly. */
export function foldText(text) {
  let out = text;
  for (const { re, to } of compiled) {
    out = out.replace(re, (m, ...rest) => {
      // With a capture group the first extra argument is the group; without
      // one it is the numeric offset.
      const g1 = typeof rest[0] === "string" ? rest[0] : undefined;
      return matchCase(m, g1 === undefined ? to : to.replace("$1", g1));
    });
  }
  return out;
}
