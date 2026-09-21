import { mkdtemp, writeFile, readFile, readdir, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

// Keep these existing renderer cases runnable before backend/provider and
// BlockDemo integration. The complete renderer suite still includes them.
const root = fileURLToPath(new URL("../../", import.meta.url));
const web = path.join(root, "ConvexPress-Website/apps/web");
const require = createRequire(path.join(web, "package.json"));
const cases = ["model.cases.tsx", "pack-registry.cases.tsx", "content.cases.tsx", "treatments.cases.jsx"];
const temporary = await mkdtemp(path.join(tmpdir(), "convexpress-renderer-foundation-"));
try {
  await symlink(path.join(web, "node_modules"), path.join(temporary, "node_modules"), "dir");
  const entry = path.join(temporary, "entry.tsx");
  const imports = cases.map(name => `import ${JSON.stringify(path.join(web, "src/templates/sdk/block-renderer", name))};`);
  const catalog = JSON.parse(await readFile(path.join(root, "blocks/.generated/catalog.json"), "utf8"));
  const libraryEntries = catalog.map((spec, index) => {
    const source = path.join(root, spec.source.replace(/block.json$/u, "render.tsx"));
    imports.push(`import library${index} from ${JSON.stringify(source)};`);
    return `${JSON.stringify(source)}: library${index}`;
  });
  const manifests = [], ownedEntries = [];
  for (const id of (await readdir(path.join(web, "src/templates/packs"))).sort()) {
    const directory = path.join(web, "src/templates/packs", id);
    const manifest = JSON.parse(await readFile(path.join(directory, "template.json"), "utf8"));
    manifests.push(manifest);
    for (const source of Object.values(manifest.blocks?.renderers ?? {})) {
      const file = path.join(directory, source), name = `owned${ownedEntries.length}`;
      imports.push(`import ${name} from ${JSON.stringify(file)};`);
      ownedEntries.push(`${JSON.stringify(file)}: ${name}`);
    }
  }
  imports.push(`import { expect, test } from "bun:test";
import { discoverRenderers } from ${JSON.stringify(path.join(web, "src/templates/sdk/block-renderer/model.tsx"))};
import { installPackRenderers } from ${JSON.stringify(path.join(web, "src/templates/sdk/block-renderer/pack-registry.tsx"))};
test("every shipped Library and declared pack renderer initializes against the canonical contracts", () => {
  const library = discoverRenderers({${libraryEntries.join(",")}});
  const registry = installPackRenderers(library, ${JSON.stringify(manifests)}, {${ownedEntries.join(",")}});
  expect(Object.keys(registry).sort()).toEqual(${JSON.stringify(catalog.map(spec => spec.name).sort())});
});`);
  await writeFile(entry, imports.join("\n"));
  const result = await Bun.build({
    entrypoints: [entry], target: "bun", outdir: temporary,
    naming: { entry: "foundation.test.[ext]", asset: "[name]-[hash].[ext]" },
    external: ["bun:test"],
    plugins: [{ name: "shared-workspace-runtime", setup(build) {
      build.onResolve({ filter: /^jsdom$/u }, () => ({ path: require.resolve("jsdom"), external: true }));
      build.onResolve({ filter: /^(?:react(?:\/.*)?|react-dom(?:\/.*)?|zod)$/u }, args => ({ path: require.resolve(args.path) }));
    } }],
  });
  if (!result.success) throw Error(result.logs.join("\n"));
  const tests = spawnSync(process.execPath, ["test", path.join(temporary, "foundation.test.js")], { stdio: "inherit" });
  if (tests.error) throw tests.error;
  process.exitCode = tests.status ?? 1;
} finally {
  await rm(temporary, { recursive: true, force: true });
}
