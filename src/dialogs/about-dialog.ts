import {
  css,
  type HTMLTemplateResult,
  html,
  LitElement,
  nothing,
  type TemplateResult,
} from "lit";
import { query } from "lit/decorators/query.js";
import { customElement, state } from "lit/decorators.js";
import { unsafeHTML } from "lit/directives/unsafe-html.js";
import { cssNative, cssWATweaks } from "../utils/css.ts";

// Register components
import "@awesome.me/webawesome/dist/components/button/button.js";
import "@awesome.me/webawesome/dist/components/details/details.js";
import "@awesome.me/webawesome/dist/components/dialog/dialog.js";
import "@awesome.me/webawesome/dist/components/divider/divider.js";
import "@awesome.me/webawesome/dist/components/icon/icon.js";
import "../components/command-link"; // may appear in embedded text (e.g., privacy.html)

// Raw content
import appLicenseText from "../../LICENSE.md?raw";
import unreleasedLicenseText from "../../licences/puzzles-unreleased-LICENCE?raw";
import puzzlesLicenseText from "../../licences/sgt-puzzles-LICENCE?raw";
import privacyHtml from "../assets/privacy.html?raw";

// The name of this repo's project (which is covered by its LICENSE)
const repoName = "Puzzles web app";
// The (potentially branded) name of the PWA built from this repo
const appName = import.meta.env.VITE_APP_NAME || repoName;
const appVersion = import.meta.env.VITE_APP_VERSION || "(development build)";

const sgtPuzzlesLink = "https://www.chiark.greenend.org.uk/~sgtatham/puzzles/";
const unreleasedPuzzlesLink = "https://github.com/x-sheep/puzzles-unreleased";
const androidAppLink =
  "https://play.google.com/store/apps/details?id=name.boyle.chris.sgtpuzzles";
const iOSAppLink = "https://apps.apple.com/in/app/puzzles-reloaded/id6504365885";
// const iOSOldAppLink = "https://apps.apple.com/us/app/simon-tathams-puzzles/id622220631";

const repoLink = "https://github.com/medmunds/puzzles-web";
const forumLink = "https://github.com/medmunds/puzzles-web/discussions";
const issuesLink = "https://github.com/medmunds/puzzles-web/issues";

// Form of dependencies.json
interface DependencyInfo {
  dependencies: {
    name: string;
    version?: string;
    license: string | null;
    notice: string | null;
  }[];
}

/**
 * Inline markdown, for the one input that is markdown: `[text](url)` links,
 * `` `code` `` spans and `**bold**`. Recurses into link text so a
 * ``[`path`](url)`` renders its code span too.
 *
 * Only *absolute* links become anchors. `LICENSE.md`'s links are repo-relative
 * (`./licences/sgt-puzzles-LICENCE`), which resolve on GitHub but to nothing in
 * the deployed app — rendering those as anchors would manufacture broken links,
 * so they render as plain text.
 */
function renderInlineMarkdown(text: string): (HTMLTemplateResult | string)[] {
  const out: (HTMLTemplateResult | string)[] = [];
  const inline = /\[([^\]]+)\]\(([^)]+)\)|`([^`]+)`|\*\*([^*]+)\*\*/g;
  let consumed = 0;
  for (const match of text.matchAll(inline)) {
    const [whole, linkText, url, code, bold] = match;
    if (match.index > consumed) {
      out.push(text.slice(consumed, match.index));
    }
    if (linkText !== undefined && url !== undefined) {
      const inner = renderInlineMarkdown(linkText);
      out.push(
        /^https?:\/\//.test(url)
          ? html`<a href=${url} target="_blank">${inner}</a>`
          : html`${inner}`,
      );
    } else if (code !== undefined) {
      out.push(html`<code>${code}</code>`);
    } else if (bold !== undefined) {
      out.push(html`<strong>${bold}</strong>`);
    }
    consumed = match.index + whole.length;
  }
  if (consumed < text.length) {
    out.push(text.slice(consumed));
  }
  return out;
}

/**
 * One markdown block. Returns `null` for a block that renders to nothing, so
 * the caller can keep looking for somewhere to put its label.
 *
 * The level-1 heading is dropped: it is the document title, and the dialog
 * already supplies one (the `label` argument, plus the summary above it).
 * Deeper headings become bold lines — this is a licence panel, not a document
 * viewer, so it wants no heading hierarchy of its own.
 */
function markdownBlockToHTML(
  block: string,
  label: string | HTMLTemplateResult | typeof nothing,
): HTMLTemplateResult | null {
  const lines = block
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  if (lines.length === 0) {
    return null;
  }

  const heading = /^(#{1,6})\s+(.*)$/.exec(lines[0]);
  if (heading) {
    if (heading[1].length === 1) {
      return null;
    }
    return html`<p>${label}<strong>${renderInlineMarkdown(heading[2])}</strong></p>`;
  }

  if (lines[0].startsWith("- ")) {
    // Wrapped continuation lines belong to the item above them.
    const items: string[] = [];
    for (const line of lines) {
      if (line.startsWith("- ")) {
        items.push(line.slice(2));
      } else if (items.length > 0) {
        items[items.length - 1] += ` ${line}`;
      }
    }
    return html`
      ${label === nothing ? nothing : html`<p>${label}</p>`}
      <ul>${items.map((item) => html`<li>${renderInlineMarkdown(item)}</li>`)}</ul>
    `;
  }

  return html`<p>${label}${renderInlineMarkdown(lines.join(" "))}</p>`;
}

/**
 * Format text as html:
 * - Split into <p> at double NLs (but ignore single NL as plain text wrapping)
 * - Convert CR to <br> (special convention for dependencies.json from puzzles)
 * - Omit ----- or ===== (and longer sequences)
 * Optional label is inserted at the start of the first paragraph if provided.
 *
 * `markdown: true` additionally renders headings, `- ` lists and inline
 * markdown. It is **opt-in and belongs only to this project's own
 * `LICENSE.md`**: upstream's `LICENCE` notices and third-party dependency
 * notices are plain text, and reinterpreting them would turn a stray bracket or
 * asterisk in someone's copyright line into a link or emphasis — silently
 * rewriting a legal notice.
 */
export function licenseTextToHTML(
  text: string,
  label?: string | HTMLTemplateResult,
  { markdown = false }: { markdown?: boolean } = {},
): HTMLTemplateResult {
  const result: HTMLTemplateResult[] = [];
  const divider = /^\s*(?:={3,}|-{3,})\s*$/;
  let firstParagraph = true;
  let lastParagraphWasDivider = false;
  for (const paragraph of text.trim().split("\n\n")) {
    if (divider.test(paragraph)) {
      if (!firstParagraph) {
        result.push(html`<wa-divider></wa-divider>`);
        lastParagraphWasDivider = true;
      }
      continue;
    }
    lastParagraphWasDivider = false;
    if (markdown) {
      const block = markdownBlockToHTML(
        paragraph,
        firstParagraph && label ? label : nothing,
      );
      if (block) {
        result.push(block);
        firstParagraph = false;
      }
      continue;
    }
    const lines = paragraph
      .replace(/[-=]{5,}/g, "")
      .split("\r")
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) =>
        // Linkify the Apache license url. (Could try to implement general
        // linkfication, but this is simpler and all we really need for now.)
        line === "http://www.apache.org/licenses/LICENSE-2.0"
          ? html`<a href="https://www.apache.org/licenses/LICENSE-2.0" target="_blank">${line}</a>`
          : line,
      )
      .map((line, i) => (i > 0 ? html`<br>${line}` : line));
    if (lines.length > 0) {
      result.push(html`<p>${firstParagraph ? label : nothing}${lines}</p>`);
      firstParagraph = false;
    }
  }
  if (lastParagraphWasDivider) {
    // Skip trailing <hr>
    result.pop();
  }
  if (firstParagraph && label) {
    // Didn't get a chance to add the label (no paragraphs in the lines)
    result.push(html`<p>${label}</p>`);
  }
  return html`<div class="license-text" translate="no">${result}</div>`;
}

@customElement("about-dialog")
export class AboutDialog extends LitElement {
  @query("wa-dialog", true)
  protected dialog?: HTMLElementTagNameMap["wa-dialog"];

  get open(): boolean {
    return this.dialog?.open ?? false;
  }
  set open(value: boolean) {
    if (this.dialog) {
      this.dialog.open = value;
    }
  }

  async showPanel(panelId: string) {
    const panel = this.shadowRoot?.querySelector<HTMLElementTagNameMap["wa-details"]>(
      `wa-details#${panelId}`,
    );
    if (panel) {
      panel.open = true;
      await panel.updateComplete;
      panel.scrollIntoView({});
    }
  }

  @state()
  private dependencies?: DependencyInfo["dependencies"];

  private async loadDependencies() {
    if (!this.dependencies) {
      // Load dependency info. This must be fetched rather than imported,
      // because dependencies-app.json is generated *after* bundling
      // (and we don't want to bundle an imported placeholder).
      async function loadJson(href: string): Promise<DependencyInfo["dependencies"]> {
        const response = await fetch(href);
        const { dependencies } = (await response.json()) as DependencyInfo;
        return dependencies;
      }

      // package.json dependencies, from rollup-plugin-license via vite.
      // There used to be a second source here — `dependencies.json`, the
      // Emscripten/musl notices produced by puzzles/emcc-dependency-info.py
      // from the wasm source maps. `retire-c-engine` removed it: we no longer
      // ship any of that code, so attributing it would be inaccurate rather
      // than generous.
      const dependencies = await loadJson(
        `${import.meta.env.BASE_URL}dependencies-app.json`,
      );

      // Sort by name ignoring leading "@" (and other punctuation)
      const { compare } = new Intl.Collator(undefined, {
        sensitivity: "accent",
        ignorePunctuation: true,
      });
      dependencies.sort((a, b) => compare(a.name, b.name));
      this.dependencies = dependencies;
    }
  }

  protected override render() {
    return html`
      <wa-dialog light-dismiss>
        <div slot="label">About ${appName}</div>
        
        <div class="panel">
          <p>
            A web adaptation of
            <cite translate="no">Simon&nbsp;Tatham’s 
              Portable&nbsp;Puzzle&nbsp;Collection</cite>
            and <span translate="no">Lennard&nbsp;Sprong’s</span> 
            <cite translate="no">puzzles-unreleased</cite> additions,
            by&nbsp;<span translate="no">Mike&nbsp;Edmunds</span>
          </p>
          <p>
            Version <span class="version">${appVersion}</span>
          </p>
          <p>
            This is open source software. Source code and more on GitHub:
            ${this.renderOffsiteLink(repoLink, repoLink.replace("https://", ""))}
            - ${this.renderOffsiteLink(forumLink, html`discussion&nbsp;forums`)}
            - ${this.renderOffsiteLink(issuesLink, html`bug&nbsp;reports`)}
          </p>
        </div>
        
        <wa-details id="credits" name="panel" summary="Credits" open>
          <p>Special thanks to&hellip;</p>
          <ul role="list">
            <li><span translate="no">Simon Tatham</span> and all the 
              contributors to the official
              ${this.renderOffsiteLink(
                sgtPuzzlesLink,
                html`<span translate="no">Portable Puzzle Collection</span>`,
              )}, 
              for over 20 years of fascinating puzzle solving</li>
            <li><span translate="no">Lennard Sprong</span> for the
              ${this.renderOffsiteLink(
                unreleasedPuzzlesLink,
                html`<span translate="no">puzzles-unreleased</span>`,
              )} 
              additions (which actually <em>have</em> been released, 
              at least twice now)</li>
            <li><span translate="no">Chris Boyle</span>, 
              <span translate="no">Greg Hewgill</span>
              and <span translate="no">Kyle Swarner</span> for their fantastic
              ${this.renderOffsiteLink(androidAppLink, "Android")} and
              ${this.renderOffsiteLink(iOSAppLink, "iOS")} apps, 
              from which I’ve freely borrowed several clever ideas</li> 
            <li>${this.renderOffsiteLink(
              "https://lucide.dev/",
              html`<span translate="no">Lucide</span>`,
            )} icons and ${this.renderOffsiteLink(
              "https://webawesome.com",
              html`<span translate="no">Web Awesome</span>`,
            )} UI components</li>
            <li>All the other open source software that makes this app possible
              (see the source code link above and the licenses section below)</li>
          </ul>
        </wa-details>
        
        <wa-details id="privacy" name="panel" summary="Privacy">
          ${unsafeHTML(privacyHtml)}
        </wa-details>

        <wa-details
            id="license" name="panel"
            summary="Copyright notices and licenses" 
            @wa-show=${this.loadDependencies}
        >
          <p>This software is released under the MIT License:</p>
          ${licenseTextToHTML(
            appLicenseText,
            html`<strong>${repoName /* NOT appName */}</strong><br>`,
            { markdown: true },
          )}

          <wa-divider></wa-divider>
          
          <div>
            <h2>Additional licensed software</h2>
            <p>This software includes portions of the following
              (expand each item for copyright and license terms):</p>
          </div>
          
          <wa-details appearance="plain" icon-placement="start">
            <div slot="summary" translate="no">Simon Tatham’s Portable Puzzle Collection</div>
            ${licenseTextToHTML(puzzlesLicenseText)}
          </wa-details>
          <wa-details appearance="plain" icon-placement="start">
            <div slot="summary" translate="no">x-sheep/puzzles-unreleased</div>
            ${licenseTextToHTML(unreleasedLicenseText)}
          </wa-details>

          ${this.dependencies?.map(
            ({ name, license, notice }) => html`
              <wa-details appearance="plain" icon-placement="start">
                <div slot="summary" translate="no">${name}</div>
                ${licenseTextToHTML(notice ?? `${license} license (no license text provided)`)}
              </wa-details>
            `,
          )}

        </wa-details>
      </wa-dialog>
    `;
  }

  private renderOffsiteLink(link: string, text?: string | TemplateResult) {
    return html`<a href=${link} target="_blank">${text ?? link}</a>`;
  }

  static override styles = [
    cssNative,
    cssWATweaks,
    css`
      :host {
        display: contents;
      }
  
      wa-dialog {
        --width: min(calc(100vw - 2 * var(--wa-space-l)), 65ch);
      }
  
      wa-dialog::part(body) {
        display: flex;
        flex-direction: column;
        gap: var(--wa-space-l);
      }
  
      wa-dialog::part(dialog) {
        background-color: var(--wa-color-brand-fill-quiet);
      }
  
      wa-details:not([appearance="plain"])[open]::part(header) {
        border-block-end:
            var(--wa-panel-border-width)
            var(--wa-color-surface-border)
            var(--wa-panel-border-style);
      }
      
      wa-details wa-details {
        margin-block-start: var(--wa-space-m);
        
        &::part(header) {
          padding: 0;
          font-weight: var(--wa-font-weight-semibold);
        }
        &::part(content) {
          padding-block: 0;
          /* caret (wa-icon) width = 1em in wa-tweaks.css */
          padding-inline-start: calc(1em + var(--spacing));
          padding-inline-end: 0;
        }
      }
      
      .panel {
        /* Effectively a wa-details without the summary */
        padding: var(--wa-space-m);
  
        background-color: var(--wa-color-surface-default);
        color: var(--wa-color-text-normal);
  
        border: var(--wa-panel-border-width) var(--wa-color-surface-border) var(--wa-panel-border-style);
        border-radius: var(--wa-panel-border-radius);
      }
  
      h1, h2, h3 {
        font-size: inherit;
      }
      
      ul {
        padding-inline-start: 1.25em;
      }
      
      strong {
        font-weight: var(--wa-font-weight-semibold);
      }
      
      .version {
        user-select: all;
      }
      
      /* workaround for Chrome translation's added font tags
       * that seem to ignore the whitespace text nodes between
       * neighboring inline tags */ 
      font::before,
      font::after {
        content: " ";
      },
  `,
  ];
}

declare global {
  interface HTMLElementTagNameMap {
    "about-dialog": AboutDialog;
  }
}
