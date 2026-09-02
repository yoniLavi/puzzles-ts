// @vitest-environment happy-dom
/**
 * The About dialog renders three kinds of license text through one function:
 * this project's own `LICENSE.md` (markdown), upstream's plain-text `LICENSE`
 * notices, and third-party dependency notices (also plain text).
 *
 * The markdown pass is therefore **opt-in**, and the load-bearing test here is
 * the negative one: a plain-text notice must not be reinterpreted. Turning a
 * bracket in someone's copyright line into a link would silently rewrite a
 * legal notice.
 */
import { render } from "lit";
import { beforeEach, describe, expect, it } from "vitest";
import { licenseTextToHTML } from "./about-dialog";

let host: HTMLElement;

beforeEach(() => {
  host = document.createElement("div");
  document.body.append(host);
});

function renderLicense(...args: Parameters<typeof licenseTextToHTML>): HTMLElement {
  render(licenseTextToHTML(...args), host);
  return host;
}

describe("licenseTextToHTML — markdown mode (this project's LICENSE.md)", () => {
  const LICENSE_SHAPED = [
    "# License",
    "",
    "This project (`puzzles-ts`) layers work from four sources:",
    "",
    "- Copyright © 2004–2024 Simon Tatham. See",
    "  [`licenses/sgt-puzzles-LICENSE`](./licenses/sgt-puzzles-LICENSE) for the",
    "  full list.",
    "- Copyright © 2011–2025 Lennard Sprong, for",
    "  [puzzles-unreleased](https://github.com/x-sheep/puzzles-unreleased).",
    "",
    "---",
    "",
    "Permission is hereby granted, free of charge.",
  ].join("\n");

  it("drops the level-1 heading and passes its label to the next block", () => {
    const el = renderLicense(LICENSE_SHAPED, "Puzzles web app", { markdown: true });
    expect(el.textContent).not.toContain("# License");
    // The label must not be lost just because the block it was aimed at vanished.
    expect(el.querySelector("p")?.textContent).toContain("Puzzles web app");
  });

  it("renders list items, joining wrapped continuation lines", () => {
    const el = renderLicense(LICENSE_SHAPED, undefined, { markdown: true });
    const items = [...el.querySelectorAll("li")].map((li) => li.textContent);
    expect(items).toHaveLength(2);
    expect(items[0]).toContain("Simon Tatham");
    expect(items[0]).toContain("full list");
    expect(items[1]).toContain("Lennard Sprong");
  });

  it("links absolute URLs but renders repo-relative ones as plain text", () => {
    const el = renderLicense(LICENSE_SHAPED, undefined, { markdown: true });
    const hrefs = [...el.querySelectorAll("a")].map((a) => a.getAttribute("href"));
    expect(hrefs).toEqual(["https://github.com/x-sheep/puzzles-unreleased"]);
    // The relative link keeps its text, having lost only its (dead) href.
    expect(el.textContent).toContain("licenses/sgt-puzzles-LICENSE");
  });

  it("renders code spans, including inside link text", () => {
    const el = renderLicense(LICENSE_SHAPED, undefined, { markdown: true });
    const code = [...el.querySelectorAll("code")].map((c) => c.textContent);
    expect(code).toContain("puzzles-ts");
    expect(code).toContain("licenses/sgt-puzzles-LICENSE");
  });

  it("leaves no raw markdown syntax in the output", () => {
    const text = renderLicense(LICENSE_SHAPED, undefined, { markdown: true })
      .textContent as string;
    // Literal parentheses are ordinary prose — only markdown constructs go.
    expect(text).not.toMatch(/\[[^\]]*\]\([^)]*\)/); // link syntax
    expect(text).not.toContain("`"); // code fences
    expect(text).not.toMatch(/(^|\s)#{1,6}\s/); // heading markers
  });

  it("still turns a --- rule into a divider", () => {
    const el = renderLicense(LICENSE_SHAPED, undefined, { markdown: true });
    expect(el.querySelectorAll("wa-divider")).toHaveLength(1);
  });
});

describe("licenseTextToHTML — plain text (upstream and dependency notices)", () => {
  // Punctuation that markdown would claim, in the shape a real notice uses it.
  const PLAIN = [
    "Copyright (c) 2004-2024 Simon Tatham [and others].",
    "",
    "Portions copyright *various* contributors, see `AUTHORS`.",
  ].join("\n");

  it("does not reinterpret bracketed text as a link", () => {
    const el = renderLicense(PLAIN);
    expect(el.querySelectorAll("a")).toHaveLength(0);
    expect(el.textContent).toContain("[and others]");
  });

  it("does not reinterpret asterisks or backticks as markup", () => {
    const el = renderLicense(PLAIN);
    expect(el.querySelectorAll("code")).toHaveLength(0);
    expect(el.querySelectorAll("strong")).toHaveLength(0);
    expect(el.textContent).toContain("*various*");
    expect(el.textContent).toContain("`AUTHORS`");
  });

  it("keeps a heading-looking line as literal text", () => {
    const el = renderLicense("# Not a heading here");
    expect(el.textContent).toContain("# Not a heading here");
  });

  it("still splits paragraphs and honours the label", () => {
    const el = renderLicense(PLAIN, "Some Dependency");
    expect(el.querySelectorAll("p")).toHaveLength(2);
    expect(el.querySelector("p")?.textContent).toContain("Some Dependency");
  });
});
