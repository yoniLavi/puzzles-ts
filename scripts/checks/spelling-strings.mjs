/**
 * Splits JavaScript/TypeScript source into `code` and `string` segments.
 *
 * ## Why this exists — the second phase of `adopt-american-spelling`
 *
 * The respelling of the tree lands in two commits. The first respells every
 * identifier, comment, path and document; the second respells the words a
 * player reads — help pages, catalog objectives, preset and config labels,
 * validation messages, hint narrations — because that half is accepted by the
 * owner, not decided mid-sweep (`AGENTS.md`, "Acceptance bar"). In source, the
 * player's words live in string literals, and so, between the two commits,
 * the guard scans code and comments but not the contents of string literals.
 *
 * **This module is deleted by the second phase**, together with its one use in
 * `spelling.mjs`. If it is still here and `help/` is still excluded from the
 * guard, the second phase has not happened.
 *
 * ## What it recognises
 *
 * Line and block comments (code — they are this project's words), single- and
 * double-quoted strings, template literals with `${…}` holes (the hole is
 * code, and may itself contain strings and templates), and regex literals
 * (`regex` — a regex in a test matches a narration or an error message, so
 * it belongs to the same half as the string it matches; the first gate run
 * proved that, when `/unrecognized/` met a message still saying
 * `unrecognised`). Regex-versus-division is decided the way a tokenizer
 * without a parser can: a `/` after `)`, `]`, `}`, an identifier or a number
 * is division, except after a keyword such as `return`; anything else opens a
 * regex. Good enough for this tree, and the failure mode is a string mistaken
 * for code, which the guard then *reports* rather than misses.
 */

const REGEX_KEYWORDS = new Set([
  "return",
  "typeof",
  "case",
  "in",
  "of",
  "do",
  "else",
  "void",
  "delete",
  "throw",
  "new",
  "yield",
  "await",
  "instanceof",
]);

/**
 * @param {string} text
 * @returns {{ text: string, kind: "code" | "string" | "regex" }[]}
 */
export function segments(text) {
  const out = [];
  let buf = "";
  let kind = "code";
  let i = 0;
  const n = text.length;
  /** The last few non-whitespace code characters, for regex detection. */
  let tail = "";

  const flush = (next) => {
    if (buf) out.push({ text: buf, kind });
    buf = "";
    kind = next;
  };
  const code = (s) => {
    buf += s;
    const t = s.replace(/\s+/g, "");
    if (t) tail = (tail + t).slice(-24);
  };

  const regexAhead = () => {
    if (tail === "") return true;
    const last = tail[tail.length - 1];
    if (/[)\]}]/.test(last)) return false;
    if (/[A-Za-z0-9_$]/.test(last)) {
      const word = /[A-Za-z_$][A-Za-z0-9_$]*$/.exec(tail)?.[0] ?? "";
      return REGEX_KEYWORDS.has(word);
    }
    return true;
  };

  const readQuoted = (q) => {
    flush("string");
    buf += q;
    i++;
    while (i < n) {
      const c = text[i];
      if (c === "\\") {
        buf += text.slice(i, i + 2);
        i += 2;
        continue;
      }
      buf += c;
      i++;
      if (c === q || c === "\n") break;
    }
    flush("code");
  };

  const readRegex = () => {
    flush("regex");
    buf += "/";
    i++;
    let inClass = false;
    while (i < n) {
      const c = text[i];
      if (c === "\\") {
        buf += text.slice(i, i + 2);
        i += 2;
        continue;
      }
      if (c === "\n") break;
      buf += c;
      i++;
      if (c === "[") inClass = true;
      else if (c === "]") inClass = false;
      else if (c === "/" && !inClass) {
        const flags = /^[a-z]*/.exec(text.slice(i))?.[0] ?? "";
        buf += flags;
        i += flags.length;
        break;
      }
    }
    flush("code");
    tail = `${tail})`.slice(-24); // a regex ends a value, like `)`
  };

  const readTemplate = () => {
    flush("string");
    buf += "`";
    i++;
    while (i < n) {
      const c = text[i];
      if (c === "\\") {
        buf += text.slice(i, i + 2);
        i += 2;
        continue;
      }
      if (c === "`") {
        buf += c;
        i++;
        break;
      }
      if (c === "$" && text[i + 1] === "{") {
        buf += "${";
        i += 2;
        flush("code");
        readCode(true);
        flush("string");
        continue;
      }
      buf += c;
      i++;
    }
    flush("code");
  };

  const readCode = (inHole) => {
    let depth = 0;
    while (i < n) {
      const c = text[i];
      const d = text[i + 1];
      if (c === "/" && d === "/") {
        const e = text.indexOf("\n", i);
        const end = e < 0 ? n : e;
        buf += text.slice(i, end);
        i = end;
        continue;
      }
      if (c === "/" && d === "*") {
        const e = text.indexOf("*/", i + 2);
        const end = e < 0 ? n : e + 2;
        buf += text.slice(i, end);
        i = end;
        continue;
      }
      if (c === "'" || c === '"') {
        readQuoted(c);
        continue;
      }
      if (c === "`") {
        readTemplate();
        continue;
      }
      if (c === "/" && regexAhead()) {
        readRegex();
        continue;
      }
      if (inHole) {
        if (c === "{") depth++;
        else if (c === "}") {
          if (depth === 0) {
            code(c);
            i++;
            return;
          }
          depth--;
        }
      }
      code(c);
      i++;
    }
  };

  readCode(false);
  flush("code");
  return out;
}

/** The file extensions the segmenter applies to. */
export const isScript = (file) => /\.(ts|mts|cts|js|mjs|cjs)$/.test(file);
