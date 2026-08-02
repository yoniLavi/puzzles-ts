// Measure the repo's stated snapshot rule: "pair every snapshot with a few
// targeted assertions so a careless `vitest -u` can't erase the guarantee."
//
// The unit is the enclosing `describe(...)` block, NOT the `it(...)`: several
// files deliberately separate the drift-catcher from the guarantee —
// `slide-render.test.ts` gives each frame a `describe` holding targeted-assertion
// tests plus one bare `it("matches its snapshot")`. Measured per-`it` that reads
// as six unpaired snapshots; measured per-frame it is the pairing rule followed
// with a tidier layout. A file with no `describe` at all falls back to the file.

import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";

const files = execSync("grep -rl 'toMatchSnapshot' src", { encoding: "utf8" })
  .trim()
  .split("\n")
  .filter((f) => f.endsWith(".test.ts"));

const SNAP = /toMatchSnapshot|toMatchInlineSnapshot/;

/** Brace-matched call bodies for `name(` at the top level of `src`. */
function calls(src, name) {
  const out = [];
  const re = new RegExp(`\\b${name}(\\.\\w+)?\\s*\\(`, "g");
  for (;;) {
    const m = re.exec(src);
    if (!m) break;
    let depth = 0;
    let i = m.index + m[0].length - 1;
    const start = i;
    for (; i < src.length; i++) {
      if (src[i] === "(") depth++;
      else if (src[i] === ")" && --depth === 0) break;
    }
    out.push({ body: src.slice(start, i + 1), start: m.index });
    re.lastIndex = i;
  }
  return out;
}

const label = (b) => /^\(\s*["'`](.+?)["'`]/s.exec(b)?.[1] ?? "(unnamed)";

let scopes = 0;
const unpaired = [];
for (const f of files) {
  const src = readFileSync(f, "utf8");
  const groups = calls(src, "describe");
  const units = groups.length > 0 ? groups : [{ body: src, start: 0 }];
  for (const g of units) {
    if (!SNAP.test(g.body)) continue;
    scopes++;
    const expects = (g.body.match(/\bexpect\s*\(/g) ?? []).length;
    const snaps = (g.body.match(new RegExp(SNAP.source, "g")) ?? []).length;
    if (expects <= snaps) unpaired.push(`${f} :: describe ${label(g.body)}`);
  }
}

console.log(`snapshot-asserting scopes (describe blocks): ${scopes}`);
console.log(
  `unpaired (snapshot is the ONLY assertion in its scope): ${unpaired.length}`,
);
for (const u of unpaired) console.log(`  ${u}`);
