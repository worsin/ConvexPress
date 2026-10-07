import { expect, test } from "bun:test";
import { opensWithHero } from "./page-opening";

test("opening role follows the first canonical spec, with unknown and empty trees retaining titles", () => {
  for (const name of ["core/hero", "core/hero-split", "core/hero-text-only", "core/hero-video"])
    expect(opensWithHero([{name}])).toBe(true);
  for (const blocks of [undefined, [], [{name:"core/paragraph"},{name:"core/hero"}], [{name:"constructor"}], [{name:"uninstalled/hero"}]])
    expect(opensWithHero(blocks)).toBe(false);
});
