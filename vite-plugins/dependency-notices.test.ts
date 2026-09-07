/**
 * The About box's third-party attribution, tested where it is decided.
 *
 * `dependency-notices.ts` is pure functions over the shape
 * `rollup-plugin-license` hands us, so the awkward cases can be stated directly
 * rather than inferred from a built `dependencies-app.json` — and the awkward
 * cases are the point. Two of the twenty-three packages this app bundles ship
 * the Apache appendix **unfilled**, so the About box told players
 * `Copyright [yyyy] [name of copyright owner]`.
 *
 * The first attempt at that fix declined to *extract* the placeholder and fell
 * back to the license text — which still contains it, further down. That is the
 * case `keeps no placeholder when it falls back` pins.
 */

import type { Dependency } from "rollup-plugin-license";
import { describe, expect, it } from "vitest";
import {
  assertNoPlaceholders,
  attribution,
  dependencyNotice,
  noticeFor,
} from "./dependency-notices.ts";

/** The tail of a real Apache-2.0 LICENSE, with the appendix left as shipped. */
const APACHE_UNFILLED = `
   Licensed under the Apache License, Version 2.0

   APPENDIX: How to apply the Apache License to your work.

      To apply the Apache License to your work, attach the following
      boilerplate notice.

   Copyright [yyyy] [name of copyright owner]

   Licensed under the Apache License, Version 2.0 (the "License");
   you may not use this file except in compliance with the License.
`;

/** The same, filled in — what Comlink actually ships. */
const APACHE_FILLED = APACHE_UNFILLED.replace(
  "Copyright [yyyy] [name of copyright owner]",
  "Copyright 2017 Google Inc.",
);

function dep(overrides: Partial<Dependency> = {}): Dependency {
  return {
    name: "example",
    version: "1.0.0",
    license: "MIT",
    licenseText: "MIT License\n\nCopyright (c) 2020 Someone\n",
    noticeText: null,
    author: null,
    contributors: [],
    repository: null,
    homepage: null,
    description: null,
    private: false,
    maintainers: [],
    licenseFile: null,
    ...overrides,
  } as Dependency;
}

describe("what the About box reproduces for a bundled package", () => {
  it("prefers the package's own NOTICE file", () => {
    // Apache-2.0 §4(d): if the work carries a NOTICE, its contents travel with
    // it. Dexie is the one dependency here that ships one.
    const notice = noticeFor(
      dep({ license: "Apache-2.0", noticeText: "Dexie.js\n\nCopyright (c) 2014 X\n" }),
    );
    expect(notice).toContain("Dexie.js");
  });

  it("uses a filled-in Apache appendix as the notice", () => {
    const notice = noticeFor(
      dep({ license: "Apache-2.0", licenseText: APACHE_FILLED }),
    );
    expect(notice).toContain("Copyright 2017 Google Inc.");
    // The short form, not the whole license — that is what the appendix is for.
    expect(notice).not.toContain("APPENDIX");
  });

  it("keeps no placeholder when it falls back", () => {
    // The bug this exists for, in both of its forms: the placeholder must not
    // be lifted out *and* must not survive in the text we fall back to.
    const notice = noticeFor(
      dep({ license: "Apache-2.0", licenseText: APACHE_UNFILLED }),
    );
    expect(notice).not.toContain("[yyyy]");
    expect(notice).not.toContain("name of copyright owner");
    // The grant itself is still reproduced; only the authors' instructions go.
    expect(notice).toContain("Licensed under the Apache License");
    expect(notice).not.toContain("APPENDIX");
  });

  it("leaves a non-Apache license alone", () => {
    const text = "MIT License\n\nCopyright (c) 2020 Someone\n";
    expect(noticeFor(dep({ licenseText: text }))).toBe(text);
  });
});

describe("who a package says publishes it", () => {
  it("prefers the author", () => {
    expect(
      attribution(dep({ author: { name: "Andrey Sitnik" } } as Partial<Dependency>)),
    ).toBe("Andrey Sitnik");
  });

  it("strips the email and url npm allows in a people field", () => {
    expect(
      attribution(dep({ author: "David Fahlander <https://example.com>" } as never)),
    ).toBe("David Fahlander");
  });

  it("falls back to contributors, then to the repository", () => {
    expect(
      attribution(
        dep({
          contributors: [{ name: "Lea Verou" }, { name: "Chris Lilley" }],
        } as never),
      ),
    ).toBe("Lea Verou, Chris Lilley");

    expect(
      attribution(
        dep({
          repository: {
            url: "git+https://github.com/marella/material-design-icons.git",
          },
        } as never),
      ),
    ).toBe("github.com/marella/material-design-icons");
  });

  it("is absent when the package names nobody", () => {
    expect(attribution(dep())).toBeUndefined();
  });
});

describe("nothing ships with an attribution hole", () => {
  const ok = { name: "a", version: "1", license: "MIT", notice: "Copyright (c) X\n" };
  const five = [1, 2, 3, 4, 5].map((i) => ({ ...ok, name: `pkg-${i}` }));

  it("accepts a well-formed set", () => {
    expect(() => assertNoPlaceholders(five)).not.toThrow();
  });

  it("fails on an unfilled template", () => {
    expect(() =>
      assertNoPlaceholders([
        ...five,
        { ...ok, name: "bad", notice: "Copyright [yyyy] [name of copyright owner]" },
      ]),
    ).toThrow(/unfilled license template/);
  });

  it("fails on a package that credits nobody", () => {
    expect(() =>
      assertNoPlaceholders([...five, { ...ok, name: "bad", notice: "Some license." }]),
    ).toThrow(/no attribution/);
  });

  it("is not fooled by the word copyright inside a license body", () => {
    // Every Apache and BSD license says "the copyright owner" in its
    // definitions. A substring test would read that as a credit; only a
    // copyright *line* counts.
    expect(() =>
      assertNoPlaceholders([
        ...five,
        {
          ...ok,
          name: "bad",
          notice: '"Licensor" shall mean the copyright owner granting the License.',
        },
      ]),
    ).toThrow(/no attribution/);
  });

  it("fails on an implausibly short list rather than passing over it", () => {
    expect(() => assertNoPlaceholders([ok])).toThrow(/bundled packages found/);
  });
});

describe("the entry the About box renders", () => {
  it("names the workbox family once", () => {
    // The service worker pulls in several workbox-* packages from one monorepo.
    expect(dependencyNotice(dep({ name: "workbox-window" })).name).toBe("workbox");
    expect(dependencyNotice(dep({ name: "workbox-routing" })).name).toBe("workbox");
  });

  it("carries the derived attribution", () => {
    const entry = dependencyNotice(dep({ author: { name: "Surma" } } as never));
    expect(entry.attribution).toBe("Surma");
  });

  it("omits attribution rather than inventing it", () => {
    expect(dependencyNotice(dep())).not.toHaveProperty("attribution");
  });
});
