import { expect, test } from "bun:test";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { validateTemplateContract } from "./template-contract.mjs";

test("template contract audits shared parts and field declarations", () => {
  const root = mkdtempSync(join(tmpdir(), "template-contract-"));
  try {
    mkdirSync(join(root, "parts"));
    writeFileSync(join(root, "parts", "unsafe.tsx"), 'import { useQuery } from "convex/react";');
    const errors = validateTemplateContract(root, { version: "1.0.0", sdk: "^1.0.0", surfaces: ["home", "home"], modules: ["unknown"], settings: [{ id: "custom", fields: [{ id: "title", type: "text", surfaces: ["missing"] }] }] }, new Set(["home"]));
    expect(errors.some((error: string) => error.includes("shared") || error.includes("unsafe.tsx"))).toBe(true);
    expect(errors.some((error: string) => error.includes("unique"))).toBe(true);
    expect(errors.some((error: string) => error.includes("needs a default"))).toBe(true);
    expect(errors.some((error: string) => error.includes("unknown surface"))).toBe(true);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("packs may add page templates with new, unique ids and must draw the page surface", () => {
  const root = mkdtempSync(join(tmpdir(), "template-contract-"));
  try {
    const base = { version: "1.0.0", sdk: "^1.0.0", surfaces: ["page"] };
    const catalog = new Set(["page", "home"]);
    expect(validateTemplateContract(root, { ...base, pageTemplates: [{ id: "story", name: "Story homepage" }] }, catalog)).toEqual([]);
    const errors = validateTemplateContract(root, {
      ...base,
      surfaces: ["home"],
      pageTemplates: [{ id: "landing", name: "Landing" }, { id: "Story", name: "x" }, { id: "story", name: "" }, { id: "story", name: "Story" }],
    }, catalog);
    expect(errors).toEqual(expect.arrayContaining([
      "page template 'landing' is a Core layout; packs add new ids",
      "page template id 'Story' must be lowercase letters, digits and hyphens",
      "page template 'story' needs a name",
      "duplicate page template 'story'",
      "a pack that adds page templates must implement the page surface",
    ]));
  } finally { rmSync(root, { recursive: true, force: true }); }
});
