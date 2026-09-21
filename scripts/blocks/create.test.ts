import { afterEach, expect, test } from "bun:test";
import { mkdtemp, mkdir, readFile, rm, symlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";
import { createBlock } from "./create.mjs";
import { discoverBlocks } from "./discovery.mjs";
import { syncBlocks } from "./generator.mjs";

const repo = fileURLToPath(new URL("../../", import.meta.url));
const require = createRequire(new URL("../../ConvexPress-Website/apps/web/package.json", import.meta.url));
const roots: string[] = [];
async function fixture() {
  const root = await mkdtemp(path.join(repo, "ConvexPress-Admin/.block-create-test-"));
  roots.push(root);
  return root;
}
afterEach(async () => { for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true }); });

test("scaffold is discovered, generates contracts and renders through the real SDK", async () => {
  const root = await fixture();
  const created = await createBlock({ root, name: "blocks/acceptance-notice", title: "Acceptance Notice" });
  const found = await discoverBlocks(root);
  expect(found.blocks).toHaveLength(1);
  expect(found.blocks[0].spec.name).toBe("blocks/acceptance-notice");
  expect(found.blocks[0].hasRenderer).toBe(true);
  await syncBlocks({ root });
  expect((await syncBlocks({ root, check: true })).changed).toEqual([]);
  await symlink(path.join(repo, "ConvexPress-Website/apps/web/node_modules"), path.join(root, "node_modules"), "dir");
  await symlink(path.join(repo, "scripts"), path.join(root, "scripts"), "dir");
  const contractRun = execFileSync("bun", ["test", `./${created.folder}/contract.test.ts`], { cwd: root, encoding: "utf8", stdio: "pipe" });
  expect(contractRun).toContain("bun test");
  const entry = path.join(root, created.folder, "render.tsx");
  const build = await Bun.build({
    entrypoints: [entry], outdir: path.join(root, "compiled"), target: "bun",
    plugins: [{ name: "isolated-canonical-block", setup(builder) {
      builder.onResolve({ filter: /ConvexPress-Website/ }, args => ({ path: path.join(repo, args.path.slice(args.path.indexOf("ConvexPress-Website"))) + (args.path.endsWith("model") ? ".tsx" : "/index.tsx") }));
      builder.onResolve({ filter: /generated\/(schemas|metadata)$/ }, args => ({ path: path.join(root, "blocks/.generated", `${path.basename(args.path)}.ts`) }));
      builder.onResolve({ filter: /^(react(?:\/.*)?|react-dom(?:\/.*)?|zod)$/ }, args => ({ path: require.resolve(args.path), external: true }));
      builder.onLoad({ filter: /\.css$/ }, () => ({ contents: "", loader: "js" }));
    }}],
  });
  if (!build.success) throw new Error(build.logs.map(String).join("\n"));
  const definition = (await import(pathToFileURL(path.join(root, "compiled/render.js")).href)).default;
  const { createElement } = require("react");
  const { renderToStaticMarkup } = require("react-dom/server");
  expect(definition.blockName).toBe("blocks/acceptance-notice");
  const render = (attrs: unknown) => renderToStaticMarkup(createElement(definition.View, { attrs, resources: { media: {} } }));
  const html = render({ heading: "An <announcement>", body: "Useful & safe" });
  expect(html).toContain("An &lt;announcement&gt;");
  expect(html).toContain("Useful &amp; safe");
  expect(render({ heading: "Only a heading", body: "" })).not.toContain("<p");
  expect(() => render({ heading: "", body: "Invalid" })).toThrow();
  expect(() => render({ heading: "Hello", html: "<script>" })).toThrow();
});

test("dry run creates nothing; invalid names and duplicate blocks do not overwrite content", async () => {
  const root = await fixture();
  expect((await createBlock({ root, name: "blocks/notice", dryRun: true })).dryRun).toBe(true);
  expect((await discoverBlocks(root)).blocks).toHaveLength(0);
  for (const name of ["../escape", "blocks/../../escape", "blocks/UPPER", "blocks/name/child"])
    await expect(createBlock({ root, name })).rejects.toThrow();
  await createBlock({ root, name: "blocks/notice" });
  const file = path.join(root, "blocks/blocks/notice/render.tsx"), before = await readFile(file, "utf8");
  await expect(createBlock({ root, name: "blocks/notice" })).rejects.toThrow("already exists");
  expect(await readFile(file, "utf8")).toBe(before);
});

test("symlink destinations, partial folders and duplicate ownership fail without writes", async () => {
  const root = await fixture(), outside = await fixture();
  await symlink(outside, path.join(root, "blocks"));
  await expect(createBlock({ root, name: "blocks/notice" })).rejects.toThrow("symlink");
  expect((await discoverBlocks(outside)).blocks).toHaveLength(0);
  const partial = await fixture();
  await mkdir(path.join(partial, "blocks/notice/partial"), { recursive: true });
  await expect(createBlock({ root: partial, name: "notice/partial" })).rejects.toThrow("Missing block.json");
  const duplicate = await fixture();
  const spec = JSON.parse(await readFile(path.join(repo, "block-kit/scaffold/block.json"), "utf8"));
  const folder = path.join(duplicate, "plugins/blocks/blocks/notice");
  await mkdir(folder, { recursive: true });
  await writeFile(path.join(folder, "block.json"), JSON.stringify(spec));
  await expect(createBlock({ root: duplicate, name: "blocks/notice" })).rejects.toThrow("already exists");
});
