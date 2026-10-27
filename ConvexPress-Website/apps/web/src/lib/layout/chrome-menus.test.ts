import { describe, expect, test } from "bun:test";

import { chromeMenuLocations as resolve } from "./chrome-menus";

// The packs' own template.json menuLocations, as the registry reads them.
const PACKS: Record<string, { menuLocations?: Record<string, string> }> = {
  core: { menuLocations: { primary: "header", secondary: "secondary", "footer-1": "footer-1", "footer-2": "footer-2", "footer-3": "footer-3" } },
  journal: { menuLocations: { primary: "header", "footer-1": "footer-1", "footer-2": "footer-2", "footer-3": "footer-3" } },
  depot: { menuLocations: { primary: "header", secondary: "secondary", "footer-1": "footer-1", "footer-2": "footer-2", "footer-3": "footer-3" } },
};
const chromeMenuLocations = (settings: unknown, preview?: unknown) => resolve(settings, preview, (packId) => PACKS[packId]);

const sorted = (values: string[]) => [...values].sort();

describe("the menus the header and footer will read", () => {
  test("by default, every Menu locations field's own location and the directly read ones", () => {
    expect(sorted(chromeMenuLocations(null))).toEqual(["footer", "footer-1", "footer-2", "footer-3", "footer-4", "header", "mobile", "secondary", "social"]);
  });

  test("follow the site's saved choices for its active pack", () => {
    const settings = { templateConfig: { active: "journal", settings: { journal: { menuLayout: { primary: "main-nav", "footer-1": "company" } } } } };
    const locations = chromeMenuLocations(settings);
    expect(locations).toContain("main-nav");
    expect(locations).toContain("company");
    expect(locations).not.toContain("header");
    expect(locations).not.toContain("footer-1");
  });

  test("a previewed pack's choices apply; an unknown pack or a malformed slug is ignored", () => {
    const settings = { templateConfig: { active: "journal", settings: { depot: { menuLayout: { primary: "depot-nav" } }, journal: { menuLayout: { primary: "Not A Slug!" } } } } };
    expect(chromeMenuLocations(settings, "depot")).toContain("depot-nav");
    expect(chromeMenuLocations(settings, "no-such-pack")).not.toContain("depot-nav");
    expect(chromeMenuLocations(settings)).not.toContain("Not A Slug!");
    expect(chromeMenuLocations(settings)).toContain("secondary");
  });
});
