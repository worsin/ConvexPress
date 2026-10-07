import { mock } from "bun:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { JSDOM } from "jsdom";
const identity = { title: "Footer identity", tagline: "Distinct tagline", logoUrl: "https://example.org/logo.svg" };
const menus = { footer: { name: "Custom footer", items: [{ id: "custom", label: "Custom policy", url: "/custom-policy", type: "custom", children: [], target: "_blank", rel: "noopener noreferrer" }] }, "footer-1": { name: "First footer", items: [{ id: "one", label: "First menu", url: "/first-menu", type: "custom", children: [] }] } };
const pages = [{ _id: "parent", title: "Published parent", path: "/parent", children: [{ _id: "child", title: "Published child", path: "/parent/child", children: [] }] }];
let pageQueries = 0;
mock.module("@/hooks/layout/useSiteIdentity", () => ({ useSiteIdentity: () => identity }));
mock.module("@/hooks/layout/useFooterConfig", () => ({ useFooterConfig: () => undefined }));
mock.module("@/hooks/layout/useMenuForLocation", () => ({ useMenuForLocation: location => menus[location] }));
mock.module("@/components/layout/SocialLinks", () => ({ SocialLinks: () => null }));
const query = await import("@tanstack/react-query");
mock.module("@tanstack/react-query", () => ({ ...query, useSuspenseQuery: options => { assert.equal(options.queryKey[1], "pages/queries:getTree"); assert.deepEqual(options.queryKey[2], { status: "publish" }); pageQueries++; return { data: pages }; } }));
const convex = await import("convex/react");
mock.module("convex/react", () => ({ ...convex, useMutation: () => async () => {} }));
const router = await import("@tanstack/react-router");
mock.module("@tanstack/react-router", () => ({ ...router, Link: ({ to, children, activeProps: _activeProps, ...props }) => createElement("a", { ...props, href: to }, children) }));
const { FOOTER_DEFAULTS } = await import("@/templates/sdk/chromeDefinitions");
const { convertLegacyFooterToRows: clientConvert } = await import("../../../../../../ConvexPress-Admin/apps/web/src/components/appearance/footerRowsHelpers.ts");
const { convertLegacyFooterToRows: serverConvert } = await import("../../../../../../ConvexPress-Admin/packages/backend/convex/settings/footerRows.ts");
const failures = [];
let cases = 0;
function check(name, run) { try { run(); cases++; } catch (e) { failures.push(`${name}: ${e.message}`); } }
function config() { const c = structuredClone(FOOTER_DEFAULTS); c.rows = []; c.branding.enabled = false; c.newsletter.enabled = false; c.contactInfo.enabled = false; c.navColumns.enabled = true; c.navColumns.columns = [{ heading: "Explore", menuSource: "footer-1" }]; return c; }
for (const pack of ["core", "journal", "depot", "aster-house"]) {
  const { default: Surface } = await import(`../../templates/packs/${pack}/surfaces/chrome.footer.tsx`);
  function render(c, verify) { const dom = new JSDOM(renderToStaticMarkup(createElement(Surface, { data: { variant: "full", siteIdentity: identity, footerConfig: c } }))); try { verify(dom.window.document); } finally { dom.window.close(); } }
  for (const legal of ["privacy-terms", "privacy-only", "custom", "none"]) check(`${pack}/${legal}`, () => {
    const c = config(); c.bottomBar.legalLinks = legal;
    render(c, d => {
      assert.equal(!!d.querySelector('a[href="/privacy"]'), legal === "privacy-terms" || legal === "privacy-only");
      assert.equal(!!d.querySelector('a[href="/terms"]'), legal === "privacy-terms");
      assert.equal(!!d.querySelector('a[href="/custom-policy"]'), legal === "custom");
      if (legal === "custom") assert.equal(d.querySelector('a[href="/custom-policy"]').getAttribute("target"), "_blank");
      assert.equal(!!d.querySelector('nav[aria-label="Legal links"]'), legal !== "none");
    });
  });
  for (const enabled of [true, false]) check(`${pack}/branding/${enabled}`, () => { const c = config(); c.branding.enabled = enabled; render(c, d => assert.equal(!!d.querySelector('a[href="/"]'), enabled)); });
  for (const source of ["auto-pages", "custom", "footer-1"]) for (const mode of ["sections", "client-converted", "server-converted"]) check(`${pack}/${source}/${mode}`, () => {
    const c = config(); c.bottomBar.enabled = false; c.navColumns.columns[0].menuSource = source;
    if (mode !== "sections") c.rows = (mode === "client-converted" ? clientConvert : serverConvert)(c);
    render(c, d => {
      const hrefs = [...d.querySelectorAll('a')].map(a => a.getAttribute("href")).filter(h => h !== "/");
      assert.deepEqual(hrefs, source === "auto-pages" ? ["/parent", "/parent/child"] : source === "custom" ? ["/custom-policy"] : ["/first-menu"]);
    });
  });
}
for (const [name, convert] of [["client", clientConvert], ["server", serverConvert]]) check(`${name}/custom-conversion`, () => { const c = config(); c.bottomBar.legalLinks = "custom"; const rows = convert(c); assert.equal(rows.at(-1).columns[1].cell.type, "nav"); assert.equal(rows.at(-1).columns[1].cell.menuLocation, "footer"); });
check("published pages were requested", () => assert.ok(pageQueries > 0));
assert.equal(failures.length, 0, failures.join("\n"));
console.log(JSON.stringify({ passed: true, cases, pageQueries }));
