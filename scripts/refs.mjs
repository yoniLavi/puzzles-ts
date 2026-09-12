#!/usr/bin/env node
/**
 * Who references a symbol — `npm run refs -- <file> <Name | Type.member>`.
 *
 * **The instrument for taking a population by reference rather than by name**
 * (`AGENTS.md` § "A scan that keys on a name"). A grep for `tierNames(<digit>`
 * found 21 tiered games where references find 29, and a grep for `latinSolver(`
 * misses every call written `latinSolver<Ctx>(`.
 *
 * **Why a script and not the agent's LSP tool.** That tool answers from a
 * language server that loads the project in the background, and a query issued
 * while it loads comes back short with no error: measured 2026-09-12, a cold
 * `findReferences` on `tierNames` returned 2 references and the same query warm
 * returned 72 (`weigh-a-semantic-code-server`). It is also enabled per user, not
 * per repository, so not every agent has it. This builds the whole program
 * before answering, so there is nothing to be early for.
 *
 * **What it cannot see**, which is most of what the record's other misses were:
 * a copy of a helper under another name, a constant's value typed out, and
 * source read as text through a `?raw` glob — a text read is not a reference.
 * It answers "who references this symbol", never "who has this mechanic".
 *
 * It runs on the `typescript` 5.9 compiler API, as the other build-side scripts
 * do, because `tsgo` publishes no stable API before TypeScript 7.1. So its
 * reading of the tree is 5.9's, not the gate's. On the five reference queries
 * `weigh-a-semantic-code-server` put to both, `tsgo --lsp` gave the same answers.
 *
 * Output: one line per file with its reference lines, then the totals and the
 * number of distinct games. `--files` prints only the paths; `--json` the lot.
 */
import path from "node:path";
import ts from "typescript";

const ROOT = path.resolve(import.meta.dirname, "..");

/** Below this the project listing is broken rather than the symbol unused.
 * Both projects list ~830 files (2026-09-12). */
const FLOOR_FILES = 600;

const fail = (msg) => {
  console.error(`refs: ${msg}`);
  process.exit(1);
};

const argv = process.argv.slice(2);
const flags = new Set(argv.filter((a) => a.startsWith("--")));
const [fileArg, nameArg] = argv.filter((a) => !a.startsWith("--"));
if (!fileArg || !nameArg)
  fail("usage: npm run refs -- <file> <Name | Type.member> [--files | --json]");

function parseConfig(name) {
  const configPath = path.join(ROOT, name);
  const read = ts.readConfigFile(configPath, ts.sys.readFile);
  if (read.error) fail(ts.flattenDiagnosticMessageText(read.error.messageText, "\n"));
  return ts.parseJsonConfigFileContent(
    read.config,
    ts.sys,
    ROOT,
    undefined,
    configPath,
  );
}

// One service over both projects: the build-side checks import `src/`, so a
// reference from `scripts/checks/` is as real as one from a game. The build-side
// options are the superset (they extend the app's and add Node's types), and
// references do not depend on which ambient types are loaded.
const app = parseConfig("tsconfig.json");
const buildSide = parseConfig("tsconfig.node.json");
const files = [...new Set([...app.fileNames, ...buildSide.fileNames])];
if (files.length < FLOOR_FILES)
  fail(`the two projects list only ${files.length} files (floor ${FLOOR_FILES})`);

const service = ts.createLanguageService(
  {
    getCompilationSettings: () => buildSide.options,
    getScriptFileNames: () => files,
    getScriptVersion: () => "0",
    getScriptSnapshot: (f) => {
      const text = ts.sys.readFile(f);
      return text === undefined ? undefined : ts.ScriptSnapshot.fromString(text);
    },
    getCurrentDirectory: () => ROOT,
    getDefaultLibFileName: (o) => ts.getDefaultLibFilePath(o),
    fileExists: ts.sys.fileExists,
    readFile: ts.sys.readFile,
    readDirectory: ts.sys.readDirectory,
    directoryExists: ts.sys.directoryExists,
    getDirectories: ts.sys.getDirectories,
  },
  ts.createDocumentRegistry(),
);

const target = path.resolve(ROOT, fileArg);
const program = service.getProgram();
const sf = program?.getSourceFile(target);
if (!program || !sf)
  fail(`${fileArg} is in neither tsconfig.json nor tsconfig.node.json`);
const checker = program.getTypeChecker();

/** Declarations a name can denote. Parameters and locals-by-destructuring are
 * left out so that `hint` does not match every `hint` argument in the file. */
const isNamedDeclaration = (n) =>
  (ts.isFunctionDeclaration(n) ||
    ts.isClassDeclaration(n) ||
    ts.isInterfaceDeclaration(n) ||
    ts.isTypeAliasDeclaration(n) ||
    ts.isEnumDeclaration(n) ||
    ts.isVariableDeclaration(n) ||
    ts.isMethodSignature(n) ||
    ts.isPropertySignature(n) ||
    ts.isMethodDeclaration(n) ||
    ts.isPropertyDeclaration(n)) &&
  n.name != null &&
  ts.isIdentifier(n.name);

const membersOf = (n) => {
  if (ts.isInterfaceDeclaration(n) || ts.isClassDeclaration(n)) return n.members;
  if (ts.isTypeAliasDeclaration(n) && ts.isTypeLiteralNode(n.type))
    return n.type.members;
  return [];
};

const [head, member] = nameArg.split(".");
const found = [];
const visit = (n) => {
  if (isNamedDeclaration(n) && n.name.text === head) {
    if (member == null) found.push(n.name);
    else
      for (const m of membersOf(n))
        if (isNamedDeclaration(m) && m.name.text === member) found.push(m.name);
  }
  ts.forEachChild(n, visit);
};
visit(sf);

// Overloads and interface merges are several declarations of one symbol.
const bySymbol = new Map();
for (const node of found) {
  const sym = checker.getSymbolAtLocation(node) ?? node;
  if (!bySymbol.has(sym)) bySymbol.set(sym, node);
}
const lineOf = (file, pos) =>
  program.getSourceFile(file).getLineAndCharacterOfPosition(pos).line + 1;
if (bySymbol.size === 0) fail(`no declaration of ${nameArg} in ${fileArg}`);
if (bySymbol.size > 1)
  fail(
    `${nameArg} names ${bySymbol.size} different declarations in ${fileArg}, at lines ` +
      [...bySymbol.values()].map((n) => lineOf(target, n.getStart())).join(", "),
  );
const [decl] = bySymbol.values();

const seen = new Set();
/** relative path -> sorted line numbers */
const byFile = new Map();
for (const group of service.findReferences(target, decl.getStart()) ?? []) {
  for (const ref of group.references) {
    const key = `${ref.fileName}:${ref.textSpan.start}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const rel = path.relative(ROOT, ref.fileName);
    if (!byFile.has(rel)) byFile.set(rel, []);
    byFile.get(rel).push(lineOf(ref.fileName, ref.textSpan.start));
  }
}
const rows = [...byFile]
  .map(([file, lines]) => ({ file, lines: lines.sort((a, b) => a - b) }))
  .sort((a, b) => a.file.localeCompare(b.file));
const games = [
  ...new Set(
    rows
      .map((r) => /^src\/games\/([^/]+)\//.exec(r.file)?.[1])
      .filter((g) => g != null),
  ),
].sort();
const declaredAt = `${path.relative(ROOT, target)}:${lineOf(target, decl.getStart())}`;

if (flags.has("--json")) {
  console.log(
    JSON.stringify(
      { symbol: nameArg, declaredAt, references: seen.size, files: rows, games },
      null,
      2,
    ),
  );
} else if (flags.has("--files")) {
  for (const r of rows) console.log(r.file);
} else {
  for (const r of rows) console.log(`${r.file}  ${r.lines.join(", ")}`);
  console.log(
    `\n${nameArg} (${declaredAt}): ${seen.size} references in ${rows.length} files, ` +
      `${games.length} games${games.length ? ` — ${games.join(", ")}` : ""}.`,
  );
  console.error(
    "References only: a renamed copy, a value typed out, or source read as text is not among them.",
  );
}
