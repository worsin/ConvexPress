import { selectPackReady } from "./pack-ready";
import { test, expect } from "@playwright/test";
import { readFileSync, readdirSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { discoverSourceInventory, compareRendererInventory } from "./inventory.mjs";
import { decodeCaptureMedia } from "./capture-media";

const packRoot = new URL("../../src/templates/packs/", import.meta.url);
const packs = readdirSync(packRoot, { withFileTypes: true })
  .filter(entry => entry.isDirectory())
  .map(entry => JSON.parse(readFileSync(new URL(`${entry.name}/template.json`, packRoot), "utf8")).id as string)
  .sort();
const blockRoot = new URL("../../../../../blocks/", import.meta.url);

// Each pack/viewport is independently reported. One failed example cannot erase
// the evidence for earlier examples or prevent other packs from being checked.
for (const pack of packs) for (const width of [1440, 390]) {
  test(`all canonical examples · ${pack} · ${width}px`, async ({ page }, info) => {
    test.setTimeout(300000);
    const manifest = JSON.parse(readFileSync(new URL(`${pack}/template.json`, packRoot), "utf8"));
    const owned = new Set(Object.keys(manifest.blocks?.renderers ?? {}));
    await page.setViewportSize({ width, height: width === 1440 ? 1000 : 844 });
    await page.emulateMedia({ reducedMotion: "reduce" });
    const errors: string[] = [];
    page.on("pageerror", error => errors.push(error.message));
    page.on("console", message => { if (message.type() === "error") errors.push(message.text()); });
    const inventory = await discoverSourceInventory(fileURLToPath(blockRoot));
    const evidence: unknown[] = [];
    let attempted: { name: string; example: number } | null = null;
    let complete = false;
    let expectedCases = 0;
    const report = () => writeFile(info.outputPath("example-matrix.json"), JSON.stringify({
      scope: "All canonical spec examples with BlockDemo fixture adapters. Does not certify live providers, every interactive fixture state, visual approval or normal-motion performance.",
      pack, width, reducedMotion: true, inventory, expectedCases, capturedCases: evidence.length,
      complete, attempted, errors, evidence,
    }, null, 2));
    try {
      await page.goto("/", { waitUntil: "networkidle" });
      const advertisedPacks = await page.locator("#pack option").evaluateAll(options => options.map(option => (option as HTMLOptionElement).value).sort());
      expect(advertisedPacks).toEqual(packs);
      const advertised = await page.locator("#canonical-block option").evaluateAll(options => options.filter(option => option.textContent?.startsWith("●")).map(option => (option as HTMLOptionElement).value));
      expect(compareRendererInventory(inventory.renderers, advertised)).toEqual({ missing: [], unexpected: [], duplicates: [] });
      expect(inventory.renderers.length).toBe(inventory.specs.length);
      await selectPackReady(page, pack);
      await expect(page.locator(".theme-status strong")).toHaveText(manifest.name);
      await page.evaluate(() => document.fonts.ready);
      const specs = inventory.renderers.map(entry => ({ ...entry, spec: JSON.parse(readFileSync(new URL(`${entry.name}/block.json`, blockRoot), "utf8")) }));
      expectedCases = specs.reduce((sum, entry) => sum + entry.spec.examples.length, 0);
      const canvas = page.locator(".canonical-canvas");
      for (const { name, version, sha256, spec } of specs) {
        await page.locator("#canonical-block").selectOption(name);
        await expect(page.locator("#canonical-example option")).toHaveCount(spec.examples.length);
        for (let example = 0; example < spec.examples.length; example++) {
          attempted = { name, example };
          await report();
          await page.locator("#canonical-example").selectOption(String(example));
          await expect(canvas).toHaveAttribute("data-canonical-block", name);
          await expect(canvas).toHaveAttribute("data-canonical-version", String(version));
          await expect(canvas.locator('[data-demo-ready="false"]')).toHaveCount(0);
          await expect(canvas.locator(".block-not-ready")).toHaveCount(0);
          // A loading message or adapter controls alone are not a block render.
          await expect(canvas.locator("[data-block-id]").first()).toBeAttached();
          await canvas.scrollIntoViewIfNeeded();
          // Lazy media must enter the viewport before capture. A screenshot of
          // undecoded image placeholders cannot substantiate visual acceptance.
          await decodeCaptureMedia(canvas);
          await page.evaluate(() => document.fonts.ready);
          const packMarkers = await canvas.locator("[data-pack-block]").evaluateAll(nodes => nodes.map(node => node.getAttribute("data-pack-block")!));
          expect(packMarkers.every(marker => marker.startsWith(`${pack}:`))).toBe(true);
          if (owned.has(name)) expect(packMarkers).toContain(`${pack}:${name}`);
          if (!owned.size) expect(packMarkers).toEqual([]);
          const geometry = await canvas.evaluate(node => ({
            width: node.clientWidth, scrollWidth: node.scrollWidth,
            pageWidth: document.documentElement.clientWidth,
            pageScrollWidth: document.documentElement.scrollWidth,
            blockIds: Array.from(node.querySelectorAll("[data-block-id]")).map(block => block.getAttribute("data-block-id")),
            textLength: node.textContent?.trim().length ?? 0,
            media: Array.from(node.querySelectorAll("img")).map(image => ({ alt: image.alt, visible: image.checkVisibility(), decoded: image.complete && image.naturalWidth > 0, naturalWidth: image.naturalWidth, naturalHeight: image.naturalHeight })),
            controls: Array.from(node.querySelectorAll("select")).map(select => ({
              label: select.getAttribute("aria-label") ?? select.labels?.[0]?.textContent?.trim() ?? "",
              selected: select.value,
              choices: Array.from(select.options).map(option => option.value),
            })),
          }));
          expect(geometry.width).toBeGreaterThan(0);
          expect(geometry.scrollWidth).toBeLessThanOrEqual(geometry.width + 1);
          expect(geometry.pageScrollWidth).toBeLessThanOrEqual(geometry.pageWidth + 1);
          expect(new Set(geometry.blockIds).size).toBe(geometry.blockIds.length);
          const path = info.outputPath(`${name.replaceAll("/", "-")}-example-${example + 1}.png`);
          await canvas.screenshot({ path, animations: "disabled" });
          evidence.push({ name, version, sha256, example, path, geometry, packMarkers });
          expect(errors).toEqual([]);
        }
        await report();
      }
      expect(evidence).toHaveLength(expectedCases);
      complete = true;
    } finally {
      await report();
      await info.attach("example-matrix.json", { path: info.outputPath("example-matrix.json"), contentType: "application/json" });
    }
  });
}
