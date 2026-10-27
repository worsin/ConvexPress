import { describe, expect, test } from "bun:test";

import { brandCss, paletteStyleBlocks, legacyPaletteFor } from "./ThemeStyleInjector";

describe("brand palette scoping", () => {
  test("a light palette never overrides dark-mode tokens", () => {
    const css = paletteStyleBlocks([
      { slug: "background", color: "#fbfaf7" },
      { slug: "primary", color: "#b4623b" },
    ]);
    expect(css.startsWith(":root:not(.dark) {")).toBe(true);
    expect(css.includes(".dark {")).toBe(false);
  });

  test("explicit dark entries land under .dark as plain tokens", () => {
    const css = paletteStyleBlocks([
      { slug: "background", color: "#fbfaf7" },
      { slug: "dark-background", color: "#191815" },
    ]);
    expect(css.includes(".dark {\n--background: #191815;")).toBe(true);
    expect(css.includes("--dark-background")).toBe(false);
  });

  test("a palette that is itself dark applies in both modes", () => {
    const css = paletteStyleBlocks([{ slug: "background", color: "#101010" }]);
    expect(css.startsWith(":root {")).toBe(true);
  });
});

test("template-aware backends do not emit a second saved palette beneath reset drafts", () => {
  const palette = [{ slug: "primary", color: "#123456" }];
  expect(legacyPaletteFor({ colorPalette: palette })).toEqual(palette);
  expect(legacyPaletteFor({ colorPalette: palette, templateConfig: { active: "core" } })).toBeUndefined();
});

describe("brand fonts", () => {
  test("Inter is the bundled face: named by its self-hosted copy, never asked of Google Fonts", () => {
    const { css, fontsHref } = brandCss({ typography: { body: "Inter", display: "Inter" } });
    expect(css).toContain("--font-sans: 'Inter Variable', system-ui, sans-serif;");
    expect(css).not.toContain("'Inter',");
    expect(fontsHref).toBeNull();
  });
  test("another font loads from Google Fonts, with the bundled face behind it", () => {
    const { css, fontsHref } = brandCss({ typography: { body: "Space Grotesk", display: "Fraunces" } });
    expect(css).toContain("--font-sans: 'Space Grotesk', 'Inter Variable', system-ui, sans-serif;");
    expect(css).toContain("--font-display: 'Fraunces', Georgia, 'Times New Roman', serif;");
    expect(fontsHref).toBe("https://fonts.googleapis.com/css2?family=Fraunces:wght@400;500;600;700&family=Space+Grotesk:wght@400;500;600;700&display=swap");
  });
});
