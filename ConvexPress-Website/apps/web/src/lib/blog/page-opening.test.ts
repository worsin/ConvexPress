import { expect, test } from "bun:test";
import { opensWithHero, legacyPageOpensWithHero } from "./page-opening";
import type { PageDetail } from "./types";

test("opening role follows the first canonical spec, with unknown and empty trees retaining titles", () => {
  for (const name of ["core/hero", "core/hero-split", "core/hero-text-only", "core/hero-video"])
    expect(opensWithHero([{name}])).toBe(true);
  for (const blocks of [undefined, [], [{name:"core/paragraph"},{name:"core/hero"}], [{name:"constructor"}], [{name:"uninstalled/hero"}]])
    expect(opensWithHero(blocks)).toBe(false);
});

test("legacy headings preserve the banner alias and never inspect a v2 raw fallback", () => {
  const page = {contentMode:"blocks", blocks:[{name:"blocks/page-banner"}]} as PageDetail;
  expect(legacyPageOpensWithHero(page)).toBe(true);
  expect(legacyPageOpensWithHero({...page, contentMode:"article"})).toBe(false);
  expect(legacyPageOpensWithHero({...page, blocksVersion:2})).toBe(false);
});
