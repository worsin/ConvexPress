import { mock } from "bun:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { JSDOM } from "jsdom";
const identity = { title: "Studio $& <Works>" };
mock.module("@/hooks/layout/useSiteIdentity", () => ({ useSiteIdentity: () => identity }));
mock.module("@/hooks/layout/useFooterConfig", () => ({ useFooterConfig: () => undefined }));
mock.module("@/hooks/layout/useMenuForLocation", () => ({ useMenuForLocation: () => undefined }));
mock.module("@/components/layout/SocialLinks", () => ({ SocialLinks: () => null }));
const convex = await import("convex/react");
mock.module("convex/react", () => ({ ...convex, useMutation: () => async () => {} }));
const router = await import("@tanstack/react-router");
mock.module("@tanstack/react-router", () => ({ ...router, Link: ({ to, children }) => createElement("a", { href: to }, children) }));
const { FOOTER_DEFAULTS } = await import("@/templates/sdk/chromeDefinitions");
let cases = 0;
for (const pack of ["core", "journal", "depot", "aster-house"]) {
 const { default: Surface } = await import(`../../templates/packs/${pack}/surfaces/chrome.footer.tsx`);
 for (const insertYear of [true, false]) {
  const config = structuredClone(FOOTER_DEFAULTS);
  config.rows = [{ id: "row", background: "default", padding: "normal", container: "default", columns: [{ id: "cell", cell: { type: "copyright", text: "Migrated © {year} {siteName} / {site}", insertYear } }] }];
  const dom = new JSDOM(renderToStaticMarkup(createElement(Surface, { data: { variant: "full", siteIdentity: identity, footerConfig: config } })));
  try {
   const copyright = [...dom.window.document.querySelectorAll("p")].find(p => p.textContent.startsWith("Migrated ©"));
   assert.ok(copyright,pack);
   assert.equal(copyright.textContent,`Migrated © ${insertYear ? new Date().getFullYear() : "{year}"} ${identity.title} / ${identity.title}`,pack);
   assert.equal(copyright.children.length,0,"Site names must remain escaped text");
   cases++;
  } finally { dom.window.close(); }
 }
}
console.log(JSON.stringify({ passed: true, cases }));
