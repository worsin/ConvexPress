import { afterEach, expect, test } from "bun:test";
import { mkdtemp, mkdir, writeFile, symlink, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { discoverPackDesign } from "./pack-design.mjs";

const roots = [];
afterEach(async () => { for (const root of roots.splice(0)) await rm(root, { recursive: true }); });
const pack = { id: "study", path: "packs/study" };
const manifest = { id: "study", name: "Study", version: "1.0.0", description: "A readable journal", presets: { colors: [] } };
async function fixture() {
  const root = await mkdtemp(path.join(tmpdir(), "convexpress-pack-design-")); roots.push(root);
  await mkdir(path.join(root, pack.path), { recursive: true });
  return root;
}
test("design and manifest changes invalidate context; key ordering does not", async () => {
  const root = await fixture(), file = path.join(root, pack.path, "DESIGN.md");
  await writeFile(file, "# Study\nQuiet and readable.");
  const first = await discoverPackDesign(root, pack, manifest);
  expect(await discoverPackDesign(root, pack, Object.fromEntries(Object.entries(manifest).reverse()))).toEqual(first);
  expect((await discoverPackDesign(root, pack, { ...manifest, presets: { colors: ["changed"] } })).revision).not.toBe(first.revision);
  await writeFile(file, "# Study\nMore contrast.");
  expect((await discoverPackDesign(root, pack, manifest)).revision).not.toBe(first.revision);
  for (const invalid of [{ ...manifest, id: "foreign" }, { ...manifest, name: "" }, { ...manifest, version: 1 }, { ...manifest, description: "x".repeat(8001) }])
    await expect(discoverPackDesign(root, pack, invalid)).rejects.toThrow();
});
test("absent guides are unavailable; oversized, empty and linked guides fail closed", async () => {
  const root = await fixture(), file = path.join(root, pack.path, "DESIGN.md");
  expect(await discoverPackDesign(root, pack, undefined)).toBeNull();
  expect(await discoverPackDesign(root, pack, manifest)).toBeNull();
  for (const invalid of ["  ", "x".repeat(32769), "é".repeat(16385)]) {
    await writeFile(file, invalid);
    await expect(discoverPackDesign(root, pack, manifest)).rejects.toThrow();
  }
  await rm(file); await symlink(path.join(root, "missing"), file);
  await expect(discoverPackDesign(root, pack, manifest)).rejects.toThrow("regular owned file");
});
