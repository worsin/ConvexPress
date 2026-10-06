import { mock } from "bun:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { JSDOM } from "jsdom";

const router = await import("@tanstack/react-router");
mock.module("@tanstack/react-router", () => ({
  ...router,
  Link: ({ to, params, children, ...props }) => createElement("a", {
    ...props, href: params?.slug ? to.replace("$slug", encodeURIComponent(params.slug)) : to,
  }, children),
}));
let cases = 0;
for (const pack of ["core", "journal", "depot", "aster-house"]) {
  const { default: Surface } = await import(`../../templates/packs/${pack}/surfaces/dashboard.posts.tsx`);
  for (const status of ["published", "draft", "future", "private", "trash"]) {
    const posts = [
      { _id: "post", slug: "field-note", title: "Field note", status, createdAt: 0 },
      { _id: "untitled", slug: "", title: null, status, createdAt: 0 },
    ];
    const html = renderToStaticMarkup(createElement(Surface, { data: { user: { _id: "author" }, isLoading: false, posts } }));
    const dom = new JSDOM(html);
    try {
      const links = [...dom.window.document.querySelectorAll('a[href^="/blog/"]')];
      assert.equal(links.length, status === "published" ? 1 : 0, `${pack}: ${status} must not advertise unavailable public routes`);
      if (status === "published") assert.equal(links[0].getAttribute("href"), "/blog/field-note");
      assert.ok(dom.window.document.body.textContent.includes("Field note"));
      assert.ok(dom.window.document.body.textContent.includes("(no title)"));
      cases++;
    } finally { dom.window.close(); }
  }
}
console.log(JSON.stringify({ passed: true, cases }));
