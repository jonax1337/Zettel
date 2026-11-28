import { describe, expect, it } from "vitest";
import appSource from "../App.svelte?raw";
import { CREATE_ACTIONS, NAV_GROUPS, REPORT_PAGES, SETTINGS_NAV_ITEM, SETTINGS_PAGES } from "./navigation";

// Every file that can send the user somewhere, apart from tests and migrations.
const SOURCES = import.meta.glob<string>(
  ["/src/**/*.{svelte,ts}", "!/src/**/*.test.ts", "!/src/lib/db/migrations/**"],
  { query: "?raw", import: "default", eager: true },
);

/** The keys of the route table in App.svelte, without the catch-all. */
function routePatterns(): string[] {
  const table = appSource.match(/const routes = \{([\s\S]*?)\} as never;/)?.[1] ?? "";
  return [...table.matchAll(/^\s*"(\/[^"]*)":/gm)].map((match) => match[1]);
}

function patternToRegExp(pattern: string): RegExp {
  const segments = pattern.split("/").map((segment) => (segment.startsWith(":") ? "[^/]+" : segment));
  return new RegExp("^" + segments.join("/") + "$");
}

/** Template placeholders and Svelte attribute expressions become a dummy id. */
function normalise(literal: string): { path: string; query: string[] } {
  const filled = literal.replace(/\$\{[^}]*\}/g, "1").replace(/\{[^}]*\}/g, "1");
  const [beforeHash] = filled.split("#");
  const [path, queryString = ""] = beforeHash.split("?");
  return { path, query: [...new URLSearchParams(queryString).keys()] };
}

const NAVIGATION_CONTEXT =
  /(?:push|replace|navigate|href|route|to|link|[A-Za-z]+_ROUTE|[A-Za-z]+Route)\s*(?:\(|=|:)\s*\{?\s*(["`])(\/[^"'`]*)\1/g;

function collectLiterals(): { file: string; literal: string }[] {
  const found: { file: string; literal: string }[] = [];
  for (const [file, source] of Object.entries(SOURCES)) {
    for (const match of source.matchAll(NAVIGATION_CONTEXT)) found.push({ file, literal: match[2] });
  }
  return found;
}

/** Query keys that some page actually reads. */
function readQueryKeys(): Set<string> {
  const keys = new Set<string>();
  for (const source of Object.values(SOURCES)) {
    for (const match of source.matchAll(/(?:queryParam|intQueryParam)\([^,)]+,\s*"(\w+)"\)/g)) keys.add(match[1]);
  }
  return keys;
}

const patterns = routePatterns().map((pattern) => ({ pattern, regexp: patternToRegExp(pattern) }));
const resolves = (path: string) => patterns.some(({ regexp }) => regexp.test(path));

describe("route table", () => {
  it("is found in App.svelte", () => {
    expect(patterns.length).toBeGreaterThan(30);
  });

  it("sends the navigation entries somewhere that exists", () => {
    const hrefs = [
      ...NAV_GROUPS.flatMap((group) => group.items.map((item) => item.href)),
      SETTINGS_NAV_ITEM.href,
      ...SETTINGS_PAGES.map((page) => page.href),
      ...REPORT_PAGES.map((page) => page.href),
      ...CREATE_ACTIONS.map((action) => action.href),
    ];
    const dead = hrefs.filter((href) => !resolves(normalise(href).path));
    expect(dead).toEqual([]);
  });

  it("resolves every literal route the code navigates to", () => {
    const literals = collectLiterals();
    expect(literals.length).toBeGreaterThan(50);
    const dead = literals.filter(({ literal }) => !resolves(normalise(literal).path));
    expect(dead).toEqual([]);
  });

  it("only passes query parameters that a page reads", () => {
    const read = readQueryKeys();
    const unread = collectLiterals().flatMap(({ file, literal }) =>
      normalise(literal)
        .query.filter((key) => !read.has(key))
        .map((key) => `${file}: ${literal} (${key})`),
    );
    expect(unread).toEqual([]);
  });
});
