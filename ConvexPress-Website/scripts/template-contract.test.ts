import { expect, test } from "bun:test";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from "node:fs";
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

test("a surface's stylesheet sits next to it, where the server-rendered page loads it", () => {
  const root = mkdtempSync(join(tmpdir(), "template-contract-"));
  try {
    const base = { version: "1.0.0", sdk: "^1.0.0", surfaces: ["home"] };
    mkdirSync(join(root, "surfaces"));
    mkdirSync(join(root, "styles"));
    writeFileSync(join(root, "surfaces", "home.tsx"), [
      'import "./home.css";',
      'import shared from "../styles/shared.css?url";',
      "export default function Home() { return null; }",
    ].join("\n"));
    expect(validateTemplateContract(root, base, new Set(["home"]))).toEqual([]);

    writeFileSync(join(root, "surfaces", "home.tsx"), ['import "../styles/home.css";', "export default function Home() { return null; }"].join("\n"));
    expect(validateTemplateContract(root, base, new Set(["home"]))).toEqual([
      `surfaces/home.tsx: imports ../styles/home.css, which the server-rendered page won't have; put the stylesheet next to the surface in surfaces/ or link it with "?url"`,
    ]);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("the server-rendered page loads every pack's surface stylesheets", () => {
  const critical = readFileSync(join(import.meta.dir, "../apps/web/src/templates/sdk/block-renderer/critical-styles.ts"), "utf8");
  expect(critical).toContain('"../../packs/*/surfaces/*.css"');
});
