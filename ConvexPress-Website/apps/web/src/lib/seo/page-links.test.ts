import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

// A page lives at /page/<slug>; /<slug> is only a pretty address that
// redirects there (routes/_marketing/$slug.tsx). A link the site renders to
// the pretty address sends every visitor and crawler through that redirect,
// and points search engines at a URL that isn't the page's canonical one.

const SRC = fileURLToPath(new URL("../..", import.meta.url));
const PRETTY_PAGE_LINK = /\bto(?:=\{?|:\s*)["'`]\/\$slug["'`]/;

function sources(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return entry.name === "node_modules" ? [] : sources(path);
    return /\.(?:tsx?|jsx?)$/.test(entry.name) && !/\.(?:test|cases|fixture)\./.test(entry.name) ? [path] : [];
  });
}

describe("links to site pages", () => {
  test("name the page's own address, not the pretty one that redirects to it", () => {
    const offenders = sources(SRC)
      .flatMap((file) =>
        readFileSync(file, "utf8")
          .split("\n")
          .map((line, index) => (PRETTY_PAGE_LINK.test(line) ? `${relative(SRC, file)}:${index + 1}` : null)),
      )
      .filter((offender) => offender !== null);
    expect(offenders).toEqual([]);
  });

  test("the check recognises a pretty page link", () => {
    expect(PRETTY_PAGE_LINK.test(`<Link to="/$slug" params={{ slug: "privacy" }}>`)).toBe(true);
    expect(PRETTY_PAGE_LINK.test(`navigate({ to: "/$slug", params: { slug: "terms" } })`)).toBe(true);
    expect(PRETTY_PAGE_LINK.test(`<Link to="/page/$" params={{ _splat: "privacy" }}>`)).toBe(false);
  });
});
