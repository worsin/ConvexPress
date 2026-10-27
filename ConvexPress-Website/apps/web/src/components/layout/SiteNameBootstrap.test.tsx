import { expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { JSDOM } from "jsdom";
import { rememberSiteName } from "@/lib/seo/head";
import { SiteNameBootstrap } from "./SiteNameBootstrap";

for (const name of [
  'Northstar & "Friends"',
  '</ScRiPt><script>window.__siteNameProbe=1</script><img title="probe">',
  '<!-- <script>quoted</script> \u2028 \u2029 end',
]) {
  test(`site-name bootstrap preserves data without creating markup: ${name}`, () => {
    rememberSiteName(name);
    const html = renderToStaticMarkup(<SiteNameBootstrap />);
    const dom = new JSDOM(html, { runScripts: "dangerously" });
    expect(dom.window.document.querySelectorAll("script").length).toBe(1);
    expect(dom.window.document.querySelectorAll("img").length).toBe(0);
    expect(dom.window.__siteNameProbe).toBeUndefined();
    expect(dom.window.__CONVEXPRESS_SITE_NAME__).toBe(name);
    dom.window.close();
  });
}

test("the bootstrap tells the client when the site discourages search engines, and pages say noindex", async () => {
  const { buildSeoHead, effectiveRobots, rememberSearchVisibility } = await import("@/lib/seo/head");
  rememberSiteName("Northstar");
  rememberSearchVisibility(false);
  try {
    const dom = new JSDOM(renderToStaticMarkup(<SiteNameBootstrap />), { runScripts: "dangerously" });
    expect(dom.window.__CONVEXPRESS_NOINDEX__).toBe(true);
    dom.window.close();
    expect(effectiveRobots("index, follow")).toBe("noindex, nofollow");
    expect(buildSeoHead({ title: "Pricing" }).meta.some((tag) => tag.name === "robots" && tag.content === "noindex, nofollow")).toBe(true);
  } finally {
    rememberSearchVisibility(true);
  }
  const dom = new JSDOM(renderToStaticMarkup(<SiteNameBootstrap />), { runScripts: "dangerously" });
  expect(dom.window.__CONVEXPRESS_NOINDEX__).toBeUndefined();
  dom.window.close();
  expect(effectiveRobots("noindex, follow")).toBe("noindex, follow");
  expect(effectiveRobots(undefined)).toBe("index, follow");
});
