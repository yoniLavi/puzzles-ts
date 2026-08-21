/*
 * The `Game` contract carries no capability without a consumer.
 *
 * `validateParams(p, full)`'s `full` meant "these params are about to generate
 * a board", and every production call site passed a literal `true`. Sixteen
 * games gated a bound on it, three of them with a comment describing the
 * behaviour that was not happening, and it silently refused game IDs a game had
 * deliberately kept loadable — for months, because the symptom only appears for
 * params someone has since bounded. The flag was dead in a way that was
 * invisible until the day it mattered (`bound-abcd-generable-sizes`).
 *
 * That shape needs no unusual ingredients: an interface transcribed from
 * upstream C, where the distinction was live; a caller in our own engine that
 * collapsed it; and per-game code written against the *documented* contract
 * rather than the actual one. This asserts the two counts that would have
 * caught it, for every optional member of `Game`.
 *
 * **The two counts fail differently and are therefore checked separately.** No
 * implementer means dead weight in the interface. No consumer means every
 * implementer wrote code that never runs — which is the worse one, because the
 * code reads as protection.
 *
 * ON THE INSTRUMENT. Both halves are derived, not listed:
 *
 *  - *implementers* come from the live registry (`Object.hasOwn` on the real
 *    game object), so a game is enrolled the day it is registered;
 *  - *consumers* come from the **TypeScript AST** of every non-game module, not
 *    from a grep. A grep for the member name is the instrument error this whole
 *    audit is about: `needsRightButton` has eighteen implementers and its only
 *    textual hit outside the games is a *commented-out* line proposing to read
 *    it. A comment is not a consumer, and a property-access node cannot be one
 *    by accident.
 *
 * Both derivations carry a floor, because a sweep that silently matched nothing
 * reports success (`grid.test.ts`'s `d.edges.length === d.order`,
 * `touch-input.test.ts`'s catalog-vs-registry count, the silently-empty
 * `import.meta.glob` — this repo has now hit that shape five times).
 *
 * WHY BY NAME AND NOT BY TYPE, since a `ts.Program` over the tree costs only
 * about a second and would resolve `game.hint` exactly. Because it would be
 * *less* correct here. A capability does not reach its consumer directly: the
 * midend relays it into `PuzzleStaticAttributes`, the `Puzzle` constructor
 * relays that into a field, and the reader is a Lit template asking
 * `this.puzzle?.canMarkAll`. Every hop keeps the name and changes the type, so
 * a type-aware scan would see `canMarkAll` read *only* by the relay in
 * `midend.ts` and convict a flag that a toolbar button genuinely branches on.
 * Matching the name follows the chain the app actually uses; the relay and
 * write exclusions above are what stop the chain being mistaken for its own
 * destination.
 *
 * The price is a false pass when an unrelated type has a field of the same
 * name, and it is real: `config["difficulty"]` in `augmentation.ts` is a
 * `ConfigValues` lookup with nothing to do with `Game.difficulty`, and counting
 * it made `difficulty` read as production-consumed — which is why the
 * element-access branch is not here. So the errors run one way: this can pass a
 * member that only looks consumed, never fail one that is genuinely read.
 */
import ts from "typescript";
import { beforeAll, describe, expect, it } from "vitest";
import { getTsGame, registeredGameIds } from "./engine/registry.ts";
// Registers every ported game; `beforeAll` re-runs it in case a sibling file
// reset the shared registry under `isolate: false`.
import { registerAllGames } from "./games/index.ts";

beforeAll(registerAllGames);

/** Every source module, eagerly, as raw text — Vite resolves these at build. */
const sources = Object.entries(
  import.meta.glob("./**/*.ts", {
    query: "?raw",
    import: "default",
    eager: true,
  }) as Record<string, string>,
).map(([p, text]) => [p.replace(/^\.\//, "src/"), text] as const);

// --- what the contract offers ----------------------------------------------

/** The optional members of the `Game` interface, read off its declaration. */
function optionalGameMembers(): string[] {
  const [, text] = sources.find(([p]) => p === "src/engine/game.ts") ?? [];
  if (text === undefined) throw new Error("contract-surface: game.ts not found");
  const src = ts.createSourceFile("game.ts", text, ts.ScriptTarget.ESNext, true);
  for (const st of src.statements) {
    if (!ts.isInterfaceDeclaration(st) || st.name.text !== "Game") continue;
    return st.members
      .filter((m) => m.questionToken !== undefined && m.name !== undefined)
      .map((m) => (m.name as ts.Identifier).text);
  }
  throw new Error("contract-surface: no `Game` interface in game.ts");
}

const OPTIONAL = optionalGameMembers();

/** The fields of `PuzzleStaticAttributes`, read off its declaration. */
function staticAttributeFields(): string[] {
  const [, text] = sources.find(([p]) => p === "src/engine/types.ts") ?? [];
  if (text === undefined) throw new Error("contract-surface: types.ts not found");
  const src = ts.createSourceFile("types.ts", text, ts.ScriptTarget.ESNext, true);
  for (const st of src.statements) {
    if (!ts.isInterfaceDeclaration(st) || st.name.text !== "PuzzleStaticAttributes")
      continue;
    return st.members
      .filter((m) => m.name !== undefined && ts.isIdentifier(m.name))
      .map((m) => (m.name as ts.Identifier).text);
  }
  throw new Error("contract-surface: no `PuzzleStaticAttributes` in types.ts");
}

const STATIC_ATTRIBUTES = staticAttributeFields();

// --- who consumes it -------------------------------------------------------

/**
 * The property this access is merely being *relayed* into, if any: the name of
 * the field it is assigned to, when the access is the whole of the assigned
 * value (optionally with a `?? default` / `|| default` on it).
 *
 * Copying `game.needsRightButton` into a field also called `needsRightButton`
 * is not consumption, it is postage. Without this distinction the check passes
 * on exactly the member that motivated it: `Midend.getStaticProperties` relays
 * the flag into `PuzzleStaticAttributes`, the `Puzzle` constructor relays that
 * into a field, and nothing ever branches on it. A relay into a *differently*
 * named field is a real read — `canHint: this.game.hint !== undefined` is the
 * engine deciding something — so the names have to match.
 */
function relayTarget(access: ts.PropertyAccessExpression): string | undefined {
  let node: ts.Node = access;
  let parent = access.parent;
  if (
    parent !== undefined &&
    ts.isBinaryExpression(parent) &&
    (parent.operatorToken.kind === ts.SyntaxKind.QuestionQuestionToken ||
      parent.operatorToken.kind === ts.SyntaxKind.BarBarToken) &&
    parent.left === node
  ) {
    node = parent;
    parent = parent.parent;
  }
  if (parent === undefined) return undefined;
  if (
    ts.isPropertyAssignment(parent) &&
    parent.initializer === node &&
    ts.isIdentifier(parent.name)
  ) {
    return parent.name.text;
  }
  if (
    ts.isBinaryExpression(parent) &&
    parent.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
    parent.right === node &&
    ts.isPropertyAccessExpression(parent.left)
  ) {
    return parent.left.name.text;
  }
  return undefined;
}

/**
 * Every property name *read or called* anywhere outside the games and the
 * interface declaration itself, split by whether the reader ships.
 *
 * A game reading its own field is not a consumer of the contract — the contract
 * is a promise from the engine, so only the engine and the app shell can keep
 * it — hence `src/games/` is excluded. So is `game.ts`, where every name occurs
 * by definition.
 */
function propertyReads(): {
  production: Set<string>;
  test: Set<string>;
  app: Set<string>;
  appScanned: number;
} {
  const production = new Set<string>();
  const test = new Set<string>();
  // Shipping reads from *outside* the engine. A `PuzzleStaticAttributes` field
  // can only be read through a `Puzzle`, which lives in the app shell — the
  // engine produces the struct and never reads it back. Narrowing to the app is
  // what makes that sweep say anything the `Game` sweep does not: the two
  // contracts share field names, so an engine read of `game.canSolve` would
  // otherwise vouch for `PuzzleStaticAttributes.canSolve`.
  const app = new Set<string>();
  let scanned = 0;
  let appScanned = 0;

  for (const [path, text] of sources) {
    if (path.startsWith("src/games/") || path === "src/engine/game.ts") continue;
    scanned++;
    const isTest = /\.test\.ts$/.test(path);
    const isApp = !isTest && !path.startsWith("src/engine/");
    if (isApp) appScanned++;
    const into = isTest ? test : production;
    const src = ts.createSourceFile(path, text, ts.ScriptTarget.ESNext, true);
    const visit = (node: ts.Node): void => {
      if (ts.isPropertyAccessExpression(node)) {
        // A write is not a read. `this.needsRightButton = needsRightButton` in
        // the `Puzzle` constructor is the far end of the relay, and counting
        // its left-hand side would let a value that is only ever stored look
        // like a value something uses.
        const written =
          node.parent !== undefined &&
          ts.isBinaryExpression(node.parent) &&
          node.parent.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
          node.parent.left === node;
        if (!written && relayTarget(node) !== node.name.text) {
          into.add(node.name.text);
          if (isApp) app.add(node.name.text);
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(src);
  }

  // Vacuity guard on the *scan*: an empty or mis-rooted glob would leave both
  // sets empty and every member would read as "no consumer", which at least
  // fails loudly — but a glob that matched only a handful of files would let
  // real gaps through while still passing. Floor is well under the ~150 engine
  // + app modules present when this was written.
  expect(scanned, "contract-surface inspected implausibly few modules").toBeGreaterThan(
    100,
  );
  return { production, test, app, appScanned };
}

const READS = propertyReads();

// --- the two documented exceptions -----------------------------------------

/**
 * Members whose only consumer is a test, with the argument for why that is the
 * consumer. Not a loophole: a cross-game guard is a real reader, and for
 * `difficulty` it is the *stated* reason the member exists.
 */
const TEST_ONLY_CONSUMER: Record<string, string> = {
  difficulty:
    "Declared so a property *about* difficulty tiers can be asserted for every " +
    "tiered game at once rather than one game at a time — so its consumers are " +
    "`difficulty-contract.test.ts` and `hint-quality.test.ts` by design, and " +
    "production never asks a game for its tiers. See `difficulty.ts`.",
};

/**
 * Members with no consumer at all, each with the change that owns the decision.
 * An entry here is a **finding under management**, not an exemption — adding one
 * without an owning change is the thing this file exists to prevent.
 */
const NO_CONSUMER: Record<string, string> = {
  needsRightButton:
    "Eighteen implementers, no reader: the midend forwards it to " +
    "`PuzzleStaticAttributes` and the shell carries it to " +
    "`Puzzle.needsRightButton`, where the trail ends. Kept rather than deleted " +
    "because `audit-input-mode-parity` task 4b.1 owns the decision — it is " +
    "already asking for the per-game secondary-button control this is half of, " +
    "and there is no C build left to re-derive the eighteen declarations from.",
};

// --- the guards ------------------------------------------------------------

describe("the Game contract carries no capability without a consumer", () => {
  it("inspects every optional member of the interface", () => {
    // Vacuity guard on the *derivation*: a parse that found the wrong node, or
    // an interface renamed out from under this file, would sweep an empty list
    // and report success. Floor is well under the 31 present when written.
    expect(OPTIONAL.length).toBeGreaterThan(25);
    // And a spot check that it read real members rather than, say, every member.
    expect(OPTIONAL).toContain("hint");
    expect(OPTIONAL).not.toContain("executeMove");
  });

  it("every optional member has at least one game implementing it", () => {
    const ids = registeredGameIds();
    expect(ids.length).toBeGreaterThan(50);

    const orphans: string[] = [];
    for (const member of OPTIONAL) {
      const implementers = ids.filter((id) =>
        Object.hasOwn(getTsGame(id) as object, member),
      );
      if (implementers.length === 0) orphans.push(member);
    }
    expect(
      orphans,
      "optional Game members no game implements — surface to remove",
    ).toEqual([]);
  });

  it("every optional member is read by the engine or the app shell", () => {
    const unread: string[] = [];
    const testOnly: string[] = [];

    for (const member of OPTIONAL) {
      if (READS.production.has(member)) continue;
      if (READS.test.has(member)) testOnly.push(member);
      else unread.push(member);
    }

    // Report the implementers alongside, because that is the sentence the
    // failure needs to say: not "X is unused" but "N games wrote code that
    // never runs".
    const withImplementers = (names: string[]) =>
      names.map((m) => {
        const n = registeredGameIds().filter((id) =>
          Object.hasOwn(getTsGame(id) as object, m),
        ).length;
        return `${m} (${n} implementers)`;
      });

    expect(
      withImplementers(unread.filter((m) => !(m in NO_CONSUMER))),
      "optional Game members nothing invokes — every implementer's code is dead",
    ).toEqual([]);
    expect(
      withImplementers(testOnly.filter((m) => !(m in TEST_ONLY_CONSUMER))),
      "optional Game members only a test reads — say why, or remove them",
    ).toEqual([]);
  });

  it("keeps the documented exceptions honest", () => {
    // An exception that has stopped being true is worse than no exception: it
    // records a finding that no longer exists and hides the state that does.
    for (const member of Object.keys(NO_CONSUMER)) {
      expect(OPTIONAL, `${member} is no longer an optional Game member`).toContain(
        member,
      );
      expect(
        READS.production.has(member) || READS.test.has(member),
        `${member} now has a consumer — delete its NO_CONSUMER entry`,
      ).toBe(false);
    }
    for (const member of Object.keys(TEST_ONLY_CONSUMER)) {
      expect(OPTIONAL, `${member} is no longer an optional Game member`).toContain(
        member,
      );
      expect(
        READS.production.has(member),
        `${member} now has a production consumer — delete its TEST_ONLY_CONSUMER entry`,
      ).toBe(false);
      expect(READS.test.has(member), `${member} has no consumer at all`).toBe(true);
    }
  });
});

/**
 * The same question for the sibling contract, because that is where the answer
 * turned out to be "no" twice.
 *
 * `PuzzleStaticAttributes` is what the app learns about a game once, at
 * construction. Every field is produced by `Midend.getStaticProperties` and
 * relayed, under the same name, into a `Puzzle` field — a chain that is easy to
 * extend and whose far end is easy to forget. Of the original nine fields,
 * `canConfigure` had no reader anywhere (the midend answered it with a literal
 * `true`) and `displayName` had none that mattered (`Puzzle` overrode it from
 * the catalog on every path). Both are gone; this is what stops a third.
 *
 * Scoped to app-shell reads on purpose. The two contracts share field names —
 * `canSolve` is a `Game` member too — so an *engine* read of `game.canSolve`
 * would vouch for an app field nothing touches.
 *
 * The limitation, stated as before: this catches the `canConfigure` shape (a
 * field nothing reads) and not the `displayName` shape (a field something reads
 * under that name, but whose value never arrives from here — `Puzzle` sourced
 * its display name from the catalog and the relayed value only ever lost the
 * `??`). The second shape is a dataflow question, and tsc already answers it —
 * an unused destructured binding in the `Puzzle` constructor is an error. What
 * hid `displayName` was that the binding *was* used, in a fallback that could
 * not fire.
 */
describe("PuzzleStaticAttributes carries no field the app does not read", () => {
  it("inspects every field, and enough app modules to mean it", () => {
    expect(STATIC_ATTRIBUTES.length).toBeGreaterThan(5);
    expect(STATIC_ATTRIBUTES).toContain("canHint");
    expect(
      READS.appScanned,
      "scanned implausibly few app-shell modules",
    ).toBeGreaterThan(20);
  });

  it("every field is read by the app shell", () => {
    const unread = STATIC_ATTRIBUTES.filter(
      (f) => !READS.app.has(f) && !(f in NO_CONSUMER),
    );
    expect(
      unread,
      "PuzzleStaticAttributes fields the app never reads — the midend computes " +
        "and ships them for nobody",
    ).toEqual([]);
  });
});
