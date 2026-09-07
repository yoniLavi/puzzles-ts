/**
 * **What the About box says about the code this app ships.**
 *
 * `rollup-plugin-license` hands us every bundled package with its license text,
 * its `NOTICE` file if it has one, and the people fields from its
 * `package.json`. This turns that into the entries the About dialog renders,
 * and it exists as its own module because there are two decisions in it that
 * are easy to get subtly wrong and were.
 *
 * ## The Apache appendix is instructions, not terms
 *
 * Apache-2.0's text ends with "APPENDIX: How to apply the Apache License to
 * your work" — a *template* for authors, containing the line
 * `Copyright [yyyy] [name of copyright owner]`. Many packages fill it in
 * (Comlink: "Copyright 2017 Google Inc."), and where they do it is the closest
 * thing they have to a NOTICE, so using it is right.
 *
 * **Some ship it unfilled**, and the previous version of this code lifted the
 * placeholder out and put it in the About box verbatim — so the app told its
 * players `Copyright [yyyy] [name of copyright owner]`, which attributes
 * nobody and reads as this project's own unfinished work. Two of twenty-three
 * dependencies do this today (`@material-design-icons/svg`, `signal-polyfill`).
 *
 * A placeholder is not a notice. When the appendix is unfilled it is **cut**,
 * and the license grant above it is what we reproduce — falling back to the
 * whole license text is not enough, because the placeholder is still in it,
 * further down. (That was the first attempt, and the build caught it.) The
 * attribution then comes from {@link attribution} instead.
 *
 * ## Attribution is derived, not written down
 *
 * Every entry carries whoever the package itself names — `author`, else
 * `contributors`, else the repository it is published from. That is real data
 * from the package, it costs nothing to keep current, and it is strictly more
 * than the About box showed before (which was nothing). It is deliberately
 * **not** phrased as a copyright notice: this project is in no position to
 * assert who holds copyright in someone else's code, and inventing a
 * `Copyright X` line would be doing exactly that. It says who publishes the
 * package, which is what we know.
 *
 * ## Nothing ships with a hole in it
 *
 * {@link assertNoPlaceholders} fails the build if any notice still contains an
 * unfilled license template, or if an entry ends up with neither a copyright
 * line nor derived attribution. `vite build` is in the commit gate, so the next
 * dependency that ships a blank template is caught there rather than in the
 * About box.
 */
import type { Dependency, Person } from "rollup-plugin-license";

/** One dependency as the About dialog consumes it. */
export interface DependencyNotice {
  name: string;
  version: string | null;
  license: string | null;
  /** The package's NOTICE, or its license text. Never a template. */
  notice: string | null;
  /** Who the package says publishes it. Absent when it says nothing. */
  attribution?: string;
}

/**
 * The unfilled forms of the common license templates.
 *
 * Apache's appendix is the one that actually bites, but MIT and BSD have the
 * same shape and a package could ship either blank; catching the class costs
 * one alternation and means the next one is not a surprise.
 */
const TEMPLATE_PLACEHOLDER =
  /\[yyyy\]|\[name of copyright owner\]|<year>|<COPYRIGHT HOLDER>|\[fullname\]|\[year\]|\{\{\s*year\s*\}\}/i;

const personName = (p: Person | string | null | undefined): string | null => {
  if (!p) return null;
  const name = typeof p === "string" ? p : p.name;
  // npm's people fields allow "Name <email> (url)"; the About box wants a name.
  return name ? name.replace(/\s*[<(].*$/, "").trim() || null : null;
};

/**
 * Who the package says publishes it: its author, else its contributors, else
 * the owner of the repository it points at. `undefined` when it names nobody —
 * which is a fact worth showing as absence rather than papering over.
 */
export function attribution(dep: Dependency): string | undefined {
  const author = personName(dep.author);
  if (author) return author;

  const contributors = (dep.contributors ?? [])
    .map(personName)
    .filter((n): n is string => Boolean(n));
  if (contributors.length > 0) return contributors.join(", ");

  const repo =
    typeof dep.repository === "string" ? dep.repository : (dep.repository?.url ?? null);
  // `git+https://github.com/owner/name.git` → `github.com/owner/name`
  const cleaned = repo
    ?.replace(/^git\+/, "")
    .replace(/\.git$/, "")
    .replace(/^[a-z+]+:\/\//, "");
  return cleaned || undefined;
}

/**
 * The notice text to reproduce: the package's own NOTICE where it has one
 * (Apache-2.0 §4(d) requires propagating it), else the filled-in appendix,
 * else the license text.
 */
export function noticeFor(dep: Dependency): string | null {
  if (dep.noticeText) return dep.noticeText;
  const { licenseText } = dep;
  if (!licenseText) return null;

  if (dep.license === "Apache-2.0") {
    const appendix =
      /APPENDIX: How to apply the Apache License.*^\s*(Copyright.+)/ms.exec(
        licenseText,
      );
    // Only when somebody actually filled it in. An unfilled template names no
    // one, and shipping it is worse than shipping the license.
    if (appendix && !TEMPLATE_PLACEHOLDER.test(appendix[1])) return appendix[1];

    // Unfilled: drop the appendix rather than fall back to a license text that
    // still has the placeholder in it, further down. (The first attempt at this
    // fix did exactly that, and the build caught it.) The appendix is not part
    // of the grant — it is headed "How to apply the Apache License to your
    // work" and is addressed to authors, not to recipients — so removing it
    // costs a reader nothing and removes the only text in the file that names
    // nobody.
    const start = licenseText.indexOf("APPENDIX: How to apply the Apache License");
    if (start > 0) return licenseText.slice(0, start).trimEnd();
  }
  return licenseText;
}

/** Build the About box's entry for one bundled package. */
export function dependencyNotice(dep: Dependency): DependencyNotice {
  // The service worker pulls in several `workbox-*` packages from one monorepo,
  // under one copyright and license. Naming the family once avoids repeating
  // this plugin inside the VitePWA config. (`name` is nullable in the plugin's
  // types; a package without one would be unattributable, so it is named as
  // such rather than silently becoming "undefined" in the About box.)
  const raw = dep.name ?? "(unnamed package)";
  const name = raw.startsWith("workbox-") ? "workbox" : raw;
  const who = attribution(dep);
  return {
    name,
    version: dep.version ?? null,
    license: dep.license ?? null,
    notice: noticeFor(dep),
    ...(who ? { attribution: who } : {}),
  };
}

/**
 * Fail the build rather than ship an attribution hole.
 *
 * Two ways an entry is a hole: it still contains an unfilled license template,
 * or it credits nobody at all — no copyright line in its notice *and* no
 * derived attribution. Both are invisible from anywhere but the About box,
 * which nobody reads until a stranger does.
 */
export function assertNoPlaceholders(entries: readonly DependencyNotice[]): void {
  if (entries.length < 5) {
    throw new Error(
      `dependency notices: only ${entries.length} bundled packages found — the ` +
        "listing is empty or nearly so, and every check below would pass over it",
    );
  }

  const templated = entries
    .filter((e) => e.notice && TEMPLATE_PLACEHOLDER.test(e.notice))
    .map((e) => e.name);
  if (templated.length > 0) {
    throw new Error(
      "dependency notices: these packages' notices still contain an unfilled " +
        `license template, which credits nobody: ${templated.join(", ")}. ` +
        "See vite-plugins/dependency-notices.ts",
    );
  }

  // A *copyright line*, not the word "copyright" anywhere: every Apache and
  // BSD license body says "the copyright owner" in its definitions, so a bare
  // substring test passes for a package that credits nobody — which is the
  // whole thing being checked.
  const hasCopyrightLine = (text: string | null) =>
    (text ?? "").split("\n").some((line) => /^\s*copyright\b/i.test(line));

  const uncredited = entries
    .filter((e) => !e.attribution && !hasCopyrightLine(e.notice))
    .map((e) => e.name);
  if (uncredited.length > 0) {
    throw new Error(
      "dependency notices: these packages are shipped with no attribution at " +
        `all — no copyright line and no author, contributor or repository in ` +
        `their package.json: ${uncredited.join(", ")}`,
    );
  }
}

/** The whole `dependencies-app.json` payload. */
export function dependencyNotices(deps: readonly Dependency[]): string {
  const dependencies = deps.map(dependencyNotice);
  assertNoPlaceholders(dependencies);
  return JSON.stringify({ dependencies });
}
