// @vitest-environment happy-dom
/**
 * The `project-identity` spec, checked against the About dialog's rendered
 * words and against the sources of every other surface that names the app.
 *
 * Two halves. The first renders the dialog's blurb and credits — the exported
 * templates the dialog itself mounts — and reads them: who it says wrote this,
 * that the lineage is credited in order, that no first-person sentence is left
 * for the next maintainer to inherit, and that a support link points home while
 * an attribution link still points at the project it credits. (The templates
 * are rendered bare rather than inside `<about-dialog>` because Web Awesome's
 * dialog does not survive happy-dom; the words are the same either way.) The
 * second is a source scan for the two strings this change retired — the
 * predecessor's name for the app, and its issue tracker as a support
 * destination — which a rename could reintroduce anywhere a template or a
 * README is edited by hand. The scan counts what it read, so an unmatched glob
 * (which yields `{}`) cannot pass it.
 *
 * Sources are read through Vite's `import.meta.glob` rather than `node:fs`, so
 * the file stays inside the browser-shaped type world (`tsconfig.json`
 * `"types": []`), as every other source-scanning test here does.
 */
import { render } from "lit";
import { beforeAll, describe, expect, it } from "vitest";
import { aboutBlurb, credits } from "./dialogs/about-dialog.ts";
import { APP_NAME, ISSUES_URL, REPO_URL } from "./project-identity.ts";

const PUZZLES_WEB = "https://github.com/medmunds/puzzles-web";

let panel: HTMLElement;
let creditsEl: HTMLElement;
let panelText: string;
let creditsText: string;

beforeAll(() => {
  panel = document.createElement("div");
  creditsEl = document.createElement("div");
  document.body.append(panel, creditsEl);
  render(aboutBlurb(), panel);
  render(credits(), creditsEl);
  panelText = (panel.textContent ?? "").replace(/\s+/g, " ");
  creditsText = (creditsEl.textContent ?? "").replace(/\s+/g, " ");
});

function hrefsIn(el: HTMLElement): string[] {
  return [...el.querySelectorAll("a")].map((a) => a.getAttribute("href") ?? "");
}

describe("the About dialog presents this project's authorship and lineage", () => {
  it("names the author and the product in the opening blurb", () => {
    expect(panelText).toContain(APP_NAME);
    expect(panelText).toContain("Yoni Lavi");
  });

  it("describes a native TypeScript implementation, not a WebAssembly adaptation", () => {
    expect(panelText).toMatch(/native TypeScript/);
    expect(panelText).not.toMatch(/adaptation|WebAssembly|wasm/i);
  });

  it("credits the lineage in chronological order, with puzzles-web named", () => {
    const order = ["Simon Tatham", "Lennard Sprong", "Mike Edmunds"].map((name) => {
      const at = creditsText.indexOf(name);
      expect(at, `${name} is credited`).toBeGreaterThanOrEqual(0);
      return at;
    });
    expect(order).toEqual([...order].sort((a, b) => a - b));
    // The blurb also walks the chain in order, ending at this project.
    for (const name of ["Simon Tatham", "Lennard Sprong", "Mike Edmunds"]) {
      expect(panelText).toContain(name);
    }
    const mike = [...creditsEl.querySelectorAll("li")].find((li) =>
      li.textContent?.includes("Mike Edmunds"),
    );
    expect(mike?.textContent).toContain("puzzles-web");
    expect(mike?.querySelector("a")?.getAttribute("href")).toBe(PUZZLES_WEB);
  });

  it("leaves no first-person statement attributed to nobody", () => {
    // "I", "I’ve", "my", "me": the credits once said "from which I’ve freely
    // borrowed", with the "I" being the previous maintainer.
    const firstPerson = /(^|[\s(])(I|my|me)(?=[\s’'.,)])/;
    expect(panelText).not.toMatch(firstPerson);
    expect(creditsText).not.toMatch(firstPerson);
  });

  it("sends source and bug-report links home, and offers no forum link", () => {
    const hrefs = hrefsIn(panel);
    expect(hrefs).toContain(REPO_URL);
    expect(hrefs).toContain(ISSUES_URL);
    for (const href of hrefs) {
      expect(href.startsWith(REPO_URL), `${href} belongs to this project`).toBe(true);
    }
    expect(hrefs.some((h) => /discussions/.test(h))).toBe(false);
  });

  it("keeps the attribution links pointing at the projects they credit", () => {
    const hrefs = hrefsIn(creditsEl);
    expect(hrefs).toContain("https://www.chiark.greenend.org.uk/~sgtatham/puzzles/");
    expect(hrefs).toContain("https://github.com/x-sheep/puzzles-unreleased");
    expect(hrefs).toContain(PUZZLES_WEB);
  });
});

describe("no other surface still carries the predecessor's identity", () => {
  const sources = import.meta.glob<string>(
    [
      "./**/*.ts",
      "../templates/*.hbs",
      "../help/**/*.md",
      "../vite.config.ts",
      "../README.md",
      "../unsupported.html",
    ],
    { query: "?raw", import: "default", eager: true },
  );
  const thisFile = "./project-identity.test.ts";

  it("scanned the whole app surface", () => {
    // Vacuity guard: 57 games' sources and help pages alone exceed this.
    expect(Object.keys(sources).length).toBeGreaterThan(400);
    for (const must of [
      "../templates/index.html.hbs",
      "../vite.config.ts",
      "../README.md",
    ]) {
      expect(sources, `${must} was read`).toHaveProperty(must);
    }
  });

  it("never names the app 'Puzzles web app' or routes support to puzzles-web", () => {
    const retired = [/Puzzles web app/i, /medmunds\/puzzles-web\/(issues|discussions)/];
    const offenders: string[] = [];
    for (const [file, text] of Object.entries(sources)) {
      if (file === thisFile) {
        continue;
      }
      for (const pattern of retired) {
        if (pattern.test(text)) {
          offenders.push(`${file}: ${pattern}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it("gives the front page and the manifest the same name as the dialog", () => {
    const template = sources["../templates/index.html.hbs"];
    expect(template).toMatch(/<h1[^>]*>\{\{ appName \}\}<\/h1>/);
    expect(template).toMatch(/<title>\{\{ appName \}\}/);
    const config = sources["../vite.config.ts"];
    expect(config).toMatch(/appName: APP_NAME/);
    expect(config).toMatch(/name: env\["VITE_APP_NAME"\] \|\| APP_NAME/);
  });
});
