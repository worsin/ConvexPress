import { describe, expect, test } from "bun:test";

import { paletteStyleBlocks } from "./ThemeStyleInjector";

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
