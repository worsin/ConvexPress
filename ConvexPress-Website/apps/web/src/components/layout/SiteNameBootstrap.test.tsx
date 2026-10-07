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
