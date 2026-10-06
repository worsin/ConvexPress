import { mock } from "bun:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { JSDOM } from "jsdom";
const identity = { title: "Footer menu study" };
const item = (id, type, children = [], extra = {}) => ({ id, type, label: id, url: type === "custom" ? `https://example.org/${id}` : "", depth: 0, children, ...extra });
const items = [
  item("Guides", "heading", [item("Getting-started", "custom", [item("Deep-link", "custom")])]),
  item("Hidden-divider-label", "separator", [item("Below-divider", "custom", [], { target: "_blank", rel: "noopener noreferrer", cssClasses: "authored-link" })]),
  item("Unavailable", "custom", [item("Hidden-descendant", "custom")], { isOrphaned: true }),
  item("Last-link", "custom", [item("Unavailable-child", "custom", [], { isOrphaned: true })]),
];
const original = JSON.stringify(items);
const menu = { id: "study", name: "Study menu", items };
mock.module("@/hooks/layout/useSiteIdentity", () => ({ useSiteIdentity: () => identity }));
mock.module("@/hooks/layout/useFooterConfig", () => ({ useFooterConfig: () => undefined }));
mock.module("@/hooks/layout/useMenuForLocation", () => ({ useMenuForLocation: () => menu }));
mock.module("@/components/layout/SocialLinks", () => ({ SocialLinks: () => null }));
const convex = await import("convex/react");
mock.module("convex/react", () => ({ ...convex, useMutation: () => async () => {} }));
const router = await import("@tanstack/react-router");
mock.module("@tanstack/react-router", () => ({ ...router, Link: ({ to, children }) => createElement("a", { href: to }, children) }));
const { FOOTER_DEFAULTS } = await import("@/templates/sdk/chromeDefinitions");
let cases = 0;
const failures = [];
for (const pack of ["core", "journal", "depot", "aster-house"]) {
  const { default: Surface } = await import(`../../templates/packs/${pack}/surfaces/chrome.footer.tsx`);
  for (const mode of ["rows", "columns", "inline"]) {
    const config = structuredClone(FOOTER_DEFAULTS);
    config.branding.enabled = false;
    config.newsletter.enabled = false;
    config.contactInfo.enabled = false;
    config.bottomBar.enabled = false;
    config.navColumns.enabled = mode === "columns";
    config.navColumns.columns = [{ heading: "Study links", menuSource: "footer-1" }];
    config.rows = mode === "rows" ? [{ id: "row", background: "default", padding: "normal", container: "default", columns: [{ id: "cell", cell: { type: "nav", heading: "Study links", menuLocation: "footer-1" } }] }] : [];
    const dom = new JSDOM(renderToStaticMarkup(createElement(Surface, { data: { variant: "full", siteIdentity: identity, footerConfig: config } })));
    try {
      const d = dom.window.document;
      const links = [...d.querySelectorAll('a[href^="https://example.org/"]')];
      assert.deepEqual(links.map(a => a.textContent), ["Getting-started", "Deep-link", "Below-divider", "Last-link"], `${pack}/${mode}: every reachable descendant appears once in authored order`);
      assert.equal(links[2].getAttribute("target"), "_blank");
      assert.equal(links[2].getAttribute("rel"), "noopener noreferrer");
      assert.ok(d.body.textContent.includes("Guides"));
      assert.ok(!d.body.textContent.includes("Hidden-divider-label"));
      assert.ok(!d.body.textContent.includes("Unavailable"));
      assert.ok(!d.body.textContent.includes("Hidden-descendant"));
      assert.equal(d.querySelectorAll('hr,[role="separator"]').length >= 1, true);
      cases++;
    } catch (error) { failures.push(error.message); }
    finally { dom.window.close(); }
  }
}
assert.equal(JSON.stringify(items), original, "Rendering never rewrites the authored menu tree");
assert.equal(failures.length, 0, failures.join("\n"));
console.log(JSON.stringify({ passed: true, cases }));
