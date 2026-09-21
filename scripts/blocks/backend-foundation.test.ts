import { expect, test } from "bun:test";
import { cp, mkdtemp, rm, symlink, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = fileURLToPath(new URL("../../", import.meta.url));
test("backend generated contracts execute outside the checkout with only installed dependencies", async () => {
  const isolated = await mkdtemp(path.join(tmpdir(), "cp-canonical-contracts-"));
  try {
    const generated = path.join(isolated, "generated");
    await cp(path.join(root, "ConvexPress-Admin/packages/backend/canonical-blocks-foundation/generated"), generated, { recursive: true });
    await symlink(path.join(root, "ConvexPress-Admin/packages/backend/node_modules"), path.join(isolated, "node_modules"), "dir");
    const schemas = await import(pathToFileURL(path.join(generated, "schemas.ts")).href);
    const convex = await import(pathToFileURL(path.join(generated, "convex.ts")).href);
    const metadata = await import(pathToFileURL(path.join(generated, "metadata.ts")).href);
    const catalog = JSON.parse(await readFile(path.join(generated, "catalog.json"), "utf8"));
    expect(Object.keys(convex.blockAttrsValidators)).toHaveLength(137);
    expect(Object.keys(metadata.dependencyDescriptors)).toHaveLength(137);
    expect(schemas.validateBlockAttrs("core/featured-page", { page: "target" })).toEqual({ page: "target", ctaLabel: "Read more" });
    expect(() => schemas.validateBlockAttrs("core/featured-page", { page: "target", injected: true })).toThrow();
    expect(JSON.stringify(catalog)).toContain("core/featured-page");
  } finally { await rm(isolated, { recursive: true, force: true }); }
});
