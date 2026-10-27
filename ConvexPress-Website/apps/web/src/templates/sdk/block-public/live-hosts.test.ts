import { describe, expect, test } from "bun:test";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { blockNamesIn, LIVE_HOSTS, liveHostsFor, type LiveHostId } from "./live-hosts";

// The same roots block-renderer/discovery.ts globs: library renderers under the
// repository's blocks/, pack-owned renderers and primitive parts under packs/.
const here = dirname(fileURLToPath(import.meta.url));
const src = resolve(here, "../../..");
const blocksRoot = resolve(here, "../../../../../../../blocks");
const rendererDir = resolve(here, "../block-renderer");

function files(dir: string, keep: (path: string) => boolean): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? (name === "node_modules" ? [] : files(path, keep)) : keep(path) ? [path] : [];
  });
}

const EXTENSIONS = ["", ".ts", ".tsx", ".js", ".jsx", ".mjs", "/index.ts", "/index.tsx"];
function resolveImport(from: string, specifier: string): string | null {
  const base = specifier.startsWith("@/") ? join(src, specifier.slice(2)) : specifier.startsWith(".") ? resolve(dirname(from), specifier) : null;
  if (!base) return null;
  for (const extension of EXTENSIONS) {
    const candidate = base + extension;
    if (existsSync(candidate) && statSync(candidate).isFile()) return candidate;
  }
  return null;
}

/** Runtime imports only: `import type` and `export type` don't load a module. */
const IMPORT = /(?:^|[;\s])(?:import|export)\s+(?!type\s)(?:[^'"`;]*?\sfrom\s*)?["']([^"']+)["']|import\(\s*["']([^"']+)["']\s*\)/g;
const graph = new Map<string, string[]>();
function importsOf(file: string): string[] {
  let found = graph.get(file);
  if (!found) {
    found = [];
    if (/\.(tsx?|jsx?|mjs)$/.test(file)) {
      for (const match of readFileSync(file, "utf8").matchAll(IMPORT)) {
        const target = resolveImport(file, match[1] ?? match[2]);
        if (target) found.push(target);
      }
    }
    graph.set(file, found);
  }
  return found;
}
/** A block that shows a document of its own (a form's body) mounts that
 * document's hosts there: the walk stops at the page body. */
const NESTED_BODY = new Set([join(here, "PublicCanonicalBody.tsx"), join(here, "live-hosts.tsx")]);
function reachable(entry: string): Set<string> {
  const seen = new Set<string>([entry]);
  const queue = [entry];
  for (let file = queue.pop(); file; file = queue.pop()) {
    if (NESTED_BODY.has(file)) continue;
    for (const next of importsOf(file)) if (!seen.has(next)) (seen.add(next), queue.push(next));
  }
  return seen;
}

const consumerFile = (id: LiveHostId) => join(rendererDir, `${LIVE_HOSTS[id].consumer}.tsx`);
const hostIds = Object.keys(LIVE_HOSTS) as LiveHostId[];

/** Every renderer a page can show, by block name: the library's and each pack's own. */
const renderers = new Map<string, string[]>();
for (const file of files(blocksRoot, (path) => path.endsWith("/render.tsx"))) {
  const [namespace, name] = relative(blocksRoot, file).split("/");
  renderers.set(`${namespace}/${name}`, [...(renderers.get(`${namespace}/${name}`) ?? []), file]);
}
for (const file of files(join(src, "templates/packs"), (path) => /\/packs\/[^/]+\/blocks\/[^/]+\/[^/]+\.tsx$/.test(path))) {
  const [namespace, name] = relative(join(src, "templates/packs"), file).split("/").slice(2);
  const block = `${namespace}/${name.replace(/\.tsx$/, "")}`;
  renderers.set(block, [...(renderers.get(block) ?? []), file]);
}

describe("live hosts serve exactly the blocks that use them", () => {
  test("the walk finds the renderers and the host modules", () => {
    expect(renderers.size).toBeGreaterThan(50);
    for (const id of hostIds) expect(existsSync(consumerFile(id))).toBe(true);
  });

  test("every block that reaches a host is listed under it, and every listed block still does", () => {
    const expected: Record<string, string[]> = {};
    for (const id of hostIds) expected[id] = [];
    for (const [block, sources] of renderers) {
      const reached = new Set(sources.flatMap((source) => [...reachable(source)]));
      for (const id of hostIds) if (reached.has(consumerFile(id))) expected[id].push(block);
    }
    const listed = Object.fromEntries(hostIds.map((id) => [id, [...LIVE_HOSTS[id].blocks].sort()]));
    expect(listed).toEqual(Object.fromEntries(hostIds.map((id) => [id, expected[id].sort()])));
  });

  test("no block loads a production host itself, which would skip loading it on demand", () => {
    const production = files(rendererDir, (path) => path.endsWith("-production.tsx"));
    expect(production.length).toBe(hostIds.length);
    const offenders = [...renderers].filter(([, sources]) => sources.some((source) => production.some((host) => reachable(source).has(host))));
    expect(offenders.map(([block]) => block)).toEqual([]);
  });

  test("primitives and pack parts, which any block can render, use no host", () => {
    const shared = [
      ...files(resolve(here, "../primitives"), (path) => /\.(tsx?)$/.test(path) && !/\.(test|cases)\./.test(path)),
      ...files(join(src, "templates/packs"), (path) => path.endsWith("/parts/primitives.tsx")),
    ];
    expect(shared.length).toBeGreaterThan(0);
    const offenders = shared.filter((file) => hostIds.some((id) => reachable(file).has(consumerFile(id))));
    expect(offenders.map((file) => relative(src, file))).toEqual([]);
  });
});

describe("which hosts a document needs", () => {
  const document = (blocks: unknown[]) => ({ id: "page", blocks }) as never;

  test("finds blocks at any depth, ignoring malformed nodes and repeated references", () => {
    const shared = { name: "core/poll" };
    const tree = [{ name: "core/group", children: [{ name: "core/columns", children: [shared, shared, null, 3, { children: [{ name: "core/form" }] }] }] }];
    expect([...blockNamesIn([tree])].sort()).toEqual(["core/columns", "core/form", "core/group", "core/poll"]);
  });

  test("a page of text and images needs none", () => {
    expect(liveHostsFor({ document: document([{ name: "core/heading" }, { name: "core/image" }]), synced: undefined })).toEqual(new Set());
  });

  test("a form, a poll and the cart button need their hosts and nothing else", () => {
    const value = { document: document([{ name: "core/form" }, { name: "core/group", children: [{ name: "core/poll" }, { name: "commerce/cart-cta" }] }]), synced: undefined };
    expect(liveHostsFor(value)).toEqual(new Set<LiveHostId>(["formEmbed", "poll", "cartSummary"]));
  });

  test("reusable content counts as the page's own", () => {
    const synced = { revisions: [{ blocks: [{ name: "core/group", children: [{ name: "core/newsletter-signup" }] }] }] } as never;
    expect(liveHostsFor({ document: document([{ name: "core/synced" }]), synced })).toEqual(new Set<LiveHostId>(["newsletter"]));
  });
});
