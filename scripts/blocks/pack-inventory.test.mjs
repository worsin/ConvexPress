import { test, expect } from "bun:test";
import { fileURLToPath } from "node:url";
import { discoverBlocks } from "./discovery.mjs";
import { generateArtifacts } from "./generator.mjs";
test("all four installed packs expose their actual bounded guide and deterministic revision", async () => {
  const found = await discoverBlocks(fileURLToPath(new URL("../../", import.meta.url)));
  expect(found.packs).toHaveLength(4);
  for (const entry of found.packs) {
    expect(entry.design.id).toBe(entry.id);
    expect(entry.design.design).toContain("# ");
    expect(entry.design.revision).toMatch(/^[a-f0-9]{64}$/);
  }
  const artifacts = await generateArtifacts(found);
  expect(artifacts["pack-designs.ts"]).toContain("export const packDesigns");
  const changed = { ...found, packs: found.packs.map((p, i) => i === 0 ? { ...p, design: { ...p.design, design: p.design.design + "\nMore guidance." } } : p) };
  const next = await generateArtifacts(changed);
  expect(next["pack-designs.ts"]).not.toBe(artifacts["pack-designs.ts"]);
  expect(next["ai-catalog.ts"]).not.toBe(artifacts["ai-catalog.ts"]);
});

const { packs } = await discoverBlocks(fileURLToPath(new URL("../../", import.meta.url)));
test("all four shipped packs declare eight distinct portable canonical patterns", () => {
  expect(packs.length).toBe(4);
  for (const pack of packs) {
    expect(pack.patterns.length).toBe(8);
    expect(new Set(pack.patterns.map(p => p.id)).size).toBe(8);
    expect(pack.patterns.every(p => p.packId === pack.id && p.id.startsWith(pack.id + "/"))).toBe(true);
  }
});
