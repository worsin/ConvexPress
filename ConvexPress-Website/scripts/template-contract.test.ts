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
