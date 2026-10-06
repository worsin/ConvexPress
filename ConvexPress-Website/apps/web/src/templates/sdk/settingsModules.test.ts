import { expect, test } from "bun:test";
import { settingsCss, STANDARD_MODULES, modulesFor, defaultsFor } from "./settingsModules";
import { STANDARD_MODULES as ADMIN_MODULES, modulesFor as adminModulesFor, defaultsFor as adminDefaultsFor } from "../../../../../../ConvexPress-Admin/apps/web/src/lib/templates/settingsModules";

test("migrated palette keeps custom tokens and separate dark overrides", () => {
  const { css } = settingsCss({ colors: { background: "#ffffff", primary: "#123456", "sidebar-background": "#eeeeee", "dark-primary": "#abcdef" } });
  expect(css).toContain(":root:not(.dark)");
  expect(css).toContain("--sidebar-background: #eeeeee;");
  expect(css).toContain(".dark {\n--primary: #abcdef;");
});

test("Customize default labels follow pack defaults without changing the shared schema", () => {
  const input = {modules:["layout","header"],defaults:{layout:{sectionSpacing:"compact",contentWidth:"full"},header:{layout:{sticky:"always"}}}};
  const modules=modulesFor(input);
  expect(modules[0].fields.find(field=>field.id==="sectionSpacing")?.default).toBe("compact");
  expect(modules[0].fields.find(field=>field.id==="contentWidth")?.default).toBe("full");
  expect(STANDARD_MODULES.layout.fields.find(field=>field.id==="sectionSpacing")?.default).toBe("comfortable");
});

test("migrated dark brand palette retains its existing global appearance", () => {
  const { css } = settingsCss({ colors: { background: "#101010", foreground: "#ffffff" } });
  expect(css).toContain(":root {\n--background: #101010;");
  expect(css).toContain("color-scheme: dark");
});

test("palette CSS refuses token and value injection", () => {
  const { css } = settingsCss({ colors: { "bad};body{color": "#ffffff", primary: "red;}</style><script>alert(1)</script>", accent: "#123456" } });
  expect(css).not.toContain("script");
  expect(css).not.toContain("bad}");
  expect(css).toContain("--accent: #123456;");
});

test("palette CSS refuses style element escapes inside functional colors", () => {
  const { css } = settingsCss({ colors: { primary: "oklch(0.5 0.2 30;}</style><script>1</script>)", accent: "rgb(10 20 30 / 50%)" } });
  expect(css).not.toContain("script");
  expect(css).not.toContain("--primary");
  expect(css).toContain("--accent: rgb(10 20 30 / 50%);");
});

test("layout controls drive the closed SDK variables and reject arbitrary CSS", () => {
  const compact = settingsCss({ layout: { sectionSpacing: "compact", elementSpacing: "compact", blockGap: "small", contentWidth: "full" } }).css;
  for (const token of ["section-py-compact", "section-py-default", "section-py-spacious", "section-max-contained", "section-max-wide", "stack-gap-sm", "stack-gap-md", "stack-gap-lg", "grid-gap", "card-pad", "block-gap"])
    expect(compact).toContain(`--${token}:`);
  expect(compact).toContain("--section-py-default: clamp(1.5rem, 3vw, 2rem);");
  expect(compact).toContain("--block-gap: 0.75rem;");
  expect(compact).not.toBe(settingsCss({ layout: { sectionSpacing: "comfortable", elementSpacing: "comfortable" } }).css);
  const rejected = settingsCss({layout:{ sectionSpacing:"};body{display:none}", elementSpacing:"__proto__", blockGap:"constructor", contentWidth:"toString" }}).css;
  expect(rejected).not.toContain("display:none");
  expect(rejected).not.toContain("[object");
  expect(rejected).not.toContain("function");
  expect(rejected).toContain("--content-max-width: 80rem;");
  expect(STANDARD_MODULES.layout.fields.map(field=>field.id)).toEqual(["radius","contentWidth","sectionSpacing","elementSpacing","blockGap"]);
  expect(ADMIN_MODULES.layout).toEqual(STANDARD_MODULES.layout);
});

import { TEMPLATE_PACKS } from "../../../../../../ConvexPress-Admin/apps/web/src/lib/templates/packs";
test("native and on-site Customizers expose the same installed module fields and nested defaults", () => {
  expect(ADMIN_MODULES).toEqual(STANDARD_MODULES);
  for (const pack of TEMPLATE_PACKS) {
    const actual = adminModulesFor(pack), expected = modulesFor(pack);
    expect(actual).toEqual(expected);
    expect(actual.find(module => module.id === "menuLayout")?.fields.map(field => field.id)).toContain("primary");
    expect(actual.find(module => module.id === "header")?.fields.map(field => field.id)).toContain("layout.sticky");
    expect(adminDefaultsFor(actual)).toEqual(defaultsFor(expected));
  }
});


test("type scale has finite values and an explicit comfortable reset", () => {
  for (const [scale, factor] of [["compact", 0.94], ["comfortable", 1], ["spacious", 1.06], [undefined, 1], ["1;display:none", 1]]) {
    const css = settingsCss({ typography: { scale } }).css;
    expect(css).toContain(`--type-scale: ${factor};`);
    expect(css).not.toContain("display:none");
  }
});
