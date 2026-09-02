/**
 * Locate a named declaration in TypeScript source **without a parser** — the
 * search space the local-feedback probe anchors a case within.
 *
 * A probe case names the function (or method, class, or module-level
 * constant) whose behaviour it perturbs, and its `find` text must then match
 * exactly once *within that declaration's span* rather than once in the whole
 * file. This is what makes an unrelated edit elsewhere in the module — a
 * second method listing the same field names at the same indentation, say —
 * unable to break a case that never touched it.
 *
 * ## How a declaration is found
 *
 * By a small set of line-start shapes. Module-level ones — `function name(`,
 * `const name =`, `class Name` — count at **column 0 only**, so an indented
 * local `const` or nested `function` is part of its enclosing declaration
 * rather than a declaration of its own. A class member or object property —
 * `name(…) {`, `private name<T>(…): T {`, `name: (…) => {`, `name: function` —
 * counts at any indentation, but only **with a body**: what follows the
 * balanced parentheses decides, so a call statement, a parameter, a field, an
 * interface signature or a function *type* on its own line is not mistaken for
 * one. A dotted name (`Class.method`) locates the class first and the member
 * within it.
 *
 * ## How its span is measured
 *
 * Brace-matched from the declaration's first character, skipping string,
 * template and comment contents: the span ends at the `}` that closes the first
 * `{`-block opened at depth zero, or at a `;` at depth zero, whichever comes
 * first — except that a brace block followed by more signature on its own line
 * (`(): { w: number } | null {`, `<S extends { done: boolean }>(`) is a *type*,
 * and the scan continues past it. That covers a function body, a class body,
 * an object or array constant, an expression-bodied arrow, and an abstract
 * signature.
 *
 * ## The known limitation, and what happens instead of guessing
 *
 * A name declared more than once in the searched text — two classes with a
 * `clone()`, a nested function shadowing an outer one — is **ambiguous**, and
 * {@link locateDeclaration} throws rather than choosing. That is the harness's
 * standing rule: an edit that silently applies to the wrong place reports
 * `SURVIVED`, which reads exactly like a finding. The case then needs a
 * qualified name, which the error message says.
 */

/** Regex-escape `s`. */
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * Start offsets of every declaration of `name` in `text`.
 *
 * Each candidate is a line whose first token (after `export`/`async`/
 * accessibility keywords) declares `name`. Member and property shapes are
 * checked against a following `{` or `:` so that a statement calling `name(`
 * on its own line is not mistaken for its declaration.
 */
export function declarationStarts(text, name) {
  if (RESERVED.has(name)) return [];
  const n = esc(name);
  const starts = new Set();
  const add = (re) => {
    for (const m of text.matchAll(re)) starts.add(m.index);
  };
  // Module-level shapes are recognised at **column 0 only**: a `const` or
  // `function` indented inside a body is a local, and a case anchored in one
  // belongs to the enclosing function, not to the local.
  // `export function name(` / `export async function* name<`
  add(
    new RegExp(
      `^(?:export\\s+)?(?:default\\s+)?(?:async\\s+)?function\\*?\\s+${n}\\s*[(<]`,
      "gm",
    ),
  );
  // `export const name =` / `let name:`
  add(new RegExp(`^(?:export\\s+)?(?:const|let|var)\\s+${n}\\s*[=:]`, "gm"));
  // `export abstract class Name`
  add(
    new RegExp(
      `^(?:export\\s+)?(?:default\\s+)?(?:abstract\\s+)?class\\s+${n}\\b`,
      "gm",
    ),
  );
  // A class member or object property **with a body**: `  name(…) {`,
  // `  private name<T>(…): T {`, `  name: (…) =>`, `  name: function`. Checked
  // against what follows, so a call statement, a parameter, a field or a type
  // annotation on its own line is not mistaken for one.
  const member = new RegExp(
    `^(\\s+)(?:(?:public|private|protected|static|readonly|async|override|get|set|abstract)\\s+)*${n}\\s*(?=[(<:])`,
    "gm",
  );
  for (const m of text.matchAll(member)) {
    // `m[0]` runs through the modifiers and the name; the check reads on from
    // there, so `private name(` is judged at `(` and not at `private`.
    if (looksLikeMemberDeclaration(text, m.index + m[0].length)) {
      starts.add(m.index + m[1].length);
    }
  }
  return [...starts].sort((a, b) => a - b);
}

/**
 * After `name`, at `i`: a member or property declaration **with a body**?
 *
 * Bodies are what a case anchors inside, so a signature is not a declaration
 * here: an interface member `name(u: number): T;` or a parameter's function
 * type `name: (v: number) => T,` is a *type*, and counting either would give a
 * span that is either empty or runs to some unrelated `;`. A method is
 * accepted when a `{` follows its parameters before any `;`; a property when
 * its arrow is followed by a `{` block, or its value is a `function`.
 */
function looksLikeMemberDeclaration(text, i) {
  let j = skipSpaces(text, i);
  if (text[j] === ":") {
    j = skipSpaces(text, j + 1);
    if (text.startsWith("function", j)) return true;
    if (text.startsWith("async", j)) j = skipSpaces(text, j + 5);
    if (text[j] === "<") j = skipSpaces(text, matchFrom(text, j));
    if (text[j] !== "(") return false;
    j = skipSpaces(text, matchFrom(text, j));
    const arrow = firstOf(text, j, ["=>", ";", ",", "\n"]);
    if (!text.startsWith("=>", arrow)) return false;
    return text[skipSpaces(text, arrow + 2)] === "{";
  }
  if (text[j] === "<") j = matchFrom(text, j); // generic params
  j = skipSpaces(text, j);
  if (text[j] !== "(") return false;
  j = matchFrom(text, j);
  // A method's body opens before any `;`; a signature ends at one.
  return text[firstOf(text, j, ["{", ";"])] === "{";
}

/** Offset of the first of `needles` at or after `i`, or `text.length`. */
function firstOf(text, i, needles) {
  let best = text.length;
  for (const n of needles) {
    const k = text.indexOf(n, i);
    if (k >= 0 && k < best) best = k;
  }
  return best;
}

const skipSpaces = (text, i) => {
  while (i < text.length && /\s/.test(text[i])) i++;
  return i;
};

const OPEN = { "(": ")", "[": "]", "{": "}", "<": ">" };

/**
 * Offset just past the bracket matching the one at `i`, skipping strings,
 * templates and comments. `<` is matched only when called on one directly
 * (generic parameter lists); inside a scan it is an ordinary character.
 */
function matchFrom(text, i) {
  const close = OPEN[text[i]];
  const stack = [close];
  let j = i + 1;
  while (j < text.length && stack.length) {
    j = skipInert(text, j);
    const c = text[j];
    if (c === undefined) break;
    if (c === "(" || c === "[" || c === "{") stack.push(OPEN[c]);
    else if (c === "<" && close === ">") stack.push(">");
    else if (c === stack[stack.length - 1]) stack.pop();
    j++;
  }
  return j;
}

/** Skip past a string, template literal or comment starting at `i`, if any. */
function skipInert(text, i) {
  for (;;) {
    const c = text[i];
    if (c === '"' || c === "'") {
      i = skipQuoted(text, i, c);
    } else if (c === "`") {
      i = skipTemplate(text, i);
    } else if (c === "/" && text[i + 1] === "/") {
      const nl = text.indexOf("\n", i);
      i = nl < 0 ? text.length : nl;
    } else if (c === "/" && text[i + 1] === "*") {
      const end = text.indexOf("*/", i + 2);
      i = end < 0 ? text.length : end + 2;
    } else {
      return i;
    }
  }
}

function skipQuoted(text, i, quote) {
  let j = i + 1;
  while (j < text.length && text[j] !== quote && text[j] !== "\n") {
    if (text[j] === "\\") j++;
    j++;
  }
  return j + 1;
}

function skipTemplate(text, i) {
  let j = i + 1;
  while (j < text.length && text[j] !== "`") {
    if (text[j] === "\\") j += 2;
    else if (text[j] === "$" && text[j + 1] === "{") j = matchFrom(text, j + 1);
    else j++;
  }
  return j + 1;
}

/**
 * Offset just past the end of the declaration starting at `start`: the `}`
 * closing the first `{`-block opened at depth zero, or a `;` at depth zero,
 * whichever comes first.
 */
export function declarationEnd(text, start) {
  let j = start;
  while (j < text.length) {
    j = skipInert(text, j);
    const c = text[j];
    if (c === undefined) break;
    if (c === ";") return j + 1;
    if (c === "{") {
      const end = matchFrom(text, j);
      // An object-literal *type* — a return annotation `(): { w: number } {`,
      // `(): { n: number } | null {`, a generic bound `<S extends { x: T }>(` —
      // is a brace block too, and is told from the body by the rest of its
      // line: a body's closing `}` ends the line (bar punctuation or a
      // comment), a type's is followed by more signature.
      const lineEnd = firstOf(text, end, ["\n"]);
      const rest = text
        .slice(end, lineEnd)
        .replace(/\/\/.*$/, "")
        .trim();
      if (!/^[;,)\]]*$/.test(rest)) {
        j = end;
        continue;
      }
      return end;
    }
    if (c === "(" || c === "[") {
      j = matchFrom(text, j);
      continue;
    }
    j++;
  }
  return text.length;
}

/**
 * The `[start, end)` span of `name`'s declaration in `source`. `Outer.inner`
 * locates `Outer` first and `inner` within it. Throws on a name declared zero
 * or several times in the searched text, naming the offsets so the caller can
 * qualify the name.
 */
export function locateDeclaration(source, name) {
  const [head, ...rest] = name.split(".");
  let base = 0;
  let text = source;
  if (rest.length) {
    const outer = locateDeclaration(source, head);
    base = outer.start;
    text = source.slice(outer.start, outer.end);
  }
  const target = rest.length ? rest.join(".") : head;
  if (rest.length > 1) return shift(locateDeclaration(text, target), base);

  const starts = declarationStarts(text, target);
  if (starts.length !== 1) {
    const where = starts.map((s) => `line ${lineOf(text, s) + lineOf(source, base)}`);
    throw new Error(
      starts.length === 0
        ? `no declaration of "${name}" found`
        : `"${name}" is declared ${starts.length}× (${where.join(", ")}); qualify it as Outer.${target}`,
    );
  }
  return shift({ start: starts[0], end: declarationEnd(text, starts[0]) }, base);
}

const shift = (span, by) => ({ start: span.start + by, end: span.end + by });

/** 1-based line number of offset `i` in `text`. */
export function lineOf(text, i) {
  let line = 1;
  for (let k = 0; k < i; k++) if (text[k] === "\n") line++;
  return line;
}

/**
 * The innermost declaration whose span contains offset `at` — used by the
 * migration to derive a case's location from where its anchor matches today.
 * Returns the qualified name (`Outer.inner` when nested one level), or `null`
 * when `at` sits in no declaration this module recognises.
 */
export function enclosingDeclaration(source, at) {
  const candidates = [];
  // Every declaration shape, every name: scan for names declared at line
  // starts and test whether their span covers `at`.
  const nameRe =
    /^\s*(?:export\s+)?(?:default\s+)?(?:abstract\s+)?(?:async\s+)?(?:function\*?\s+|class\s+|const\s+|let\s+|var\s+|(?:(?:public|private|protected|static|readonly|async|override|get|set|abstract)\s+)*)([A-Za-z_$][\w$]*)/gm;
  for (const m of source.matchAll(nameRe)) {
    const name = m[1];
    if (RESERVED.has(name)) continue;
    for (const s of declarationStarts(source, name)) {
      if (s !== m.index + (m[0].length - m[0].trimStart().length) && s !== m.index)
        continue;
      const e = declarationEnd(source, s);
      if (s <= at && at < e) candidates.push({ name, start: s, end: e });
    }
  }
  if (!candidates.length) return null;
  candidates.sort((a, b) => b.start - a.start || a.end - b.end);
  const inner = candidates[0];
  const outer = candidates.find(
    (c) => c !== inner && c.start <= inner.start && c.end >= inner.end,
  );
  return outer ? `${outer.name}.${inner.name}` : inner.name;
}

/** Statement keywords that can head a `keyword (…) {` line and so would
 * otherwise pass for a method named after them. Words that are legal member
 * names (`delete`, `get`, `set`, `constructor`) are deliberately not here. */
const RESERVED = new Set([
  "if",
  "for",
  "while",
  "switch",
  "catch",
  "with",
  "return",
  "else",
  "do",
  "try",
  "finally",
  "throw",
  "function",
  "typeof",
  "await",
  "yield",
]);
