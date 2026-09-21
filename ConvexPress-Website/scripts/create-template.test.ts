import { expect, test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync, writeFileSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createTemplate } from "./create-template.mjs";

test("scaffolding creates a contract-valid local pack and refuses overwrite/path escape", () => {
  const root = mkdtempSync(join(tmpdir(), "template-kit-"));
  try {
    const result = createTemplate({ root, id: "sample", name: "Sample" });
    expect(JSON.parse(readFileSync(join(result.path, "template.json"), "utf8")).surfaces).toEqual(["home"]);
    expect(readFileSync(join(result.path, "surfaces/home.tsx"), "utf8")).toContain("HomeSurfaceData");
    expect(() => createTemplate({ root, id: "sample", name: "Changed" })).toThrow("already exists");
    expect(() => createTemplate({ root, id: "../outside", name: "Bad" })).toThrow("slug");
    writeFileSync(join(result.path, "surfaces/home.tsx"), 'import { Card } from "@/templates/packs/sample/parts"; export default Card;');
    const copy = createTemplate({ root, id: "copy", name: "Copy", from: "sample" });
    expect(readFileSync(join(copy.path, "surfaces/home.tsx"), "utf8")).toContain("@/templates/packs/copy/parts");
    expect(copy.manifest.id).toBe("copy");
    expect(copy.manifest.surfaces).toEqual(["home"]);
    const external = join(root, "external.tsx");
    writeFileSync(external, "export default null;");
    symlinkSync(external, join(result.path, "parts.tsx"));
    expect(() => createTemplate({ root, id: "linked", name: "Linked", from: "sample" })).toThrow("symbolic links");
    expect(readFileSync(external, "utf8")).toBe("export default null;");
  } finally { rmSync(root, { recursive: true, force: true }); }
});
