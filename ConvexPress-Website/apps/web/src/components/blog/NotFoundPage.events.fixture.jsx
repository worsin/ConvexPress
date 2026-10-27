import { mock } from "bun:test";
import { JSDOM } from "jsdom";
import assert from "node:assert/strict";

// The in-layout 404 logs the address the visitor asked for, query string as written.
const dom = new JSDOM('<!doctype html><div id="root"></div>', { url: "https://example.test/page/missing?utm_source=mail" });
Object.assign(globalThis, { window: dom.window, document: dom.window.document, navigator: dom.window.navigator, HTMLElement: dom.window.HTMLElement, IS_REACT_ACT_ENVIRONMENT: true });
const { act, createElement } = await import("react");
let location = { pathname: "/page/missing", search: { utm_source: "mail" }, searchStr: "?utm_source=mail" };
const logged = [];
mock.module("@tanstack/react-router", () => ({ useLocation: () => location, Link: ({ to, children, ...props }) => createElement("a", { ...props, href: to }, children) }));
mock.module("convex/react", () => ({ useMutation: () => async (args) => { logged.push(args); } }));
mock.module("./SearchForm", () => ({ SearchForm: () => null }));
const { createRoot } = await import("react-dom/client");
const { NotFoundPage } = await import("./NotFoundPage");
const { renderToStaticMarkup } = await import("react-dom/server");
const { NotFoundTemplate } = await import("../../templates/packs/core/parts/not-found");

const show = async () => {
  const root = createRoot(document.getElementById("root"));
  await act(async () => root.render(createElement(NotFoundPage)));
  const heading = document.querySelector("h1")?.textContent;
  await act(async () => root.unmount());
  return heading;
};

assert.equal(await show(), "Page Not Found");
location = { pathname: "/blog/gone", search: {}, searchStr: "" };
await show();
assert.deepEqual(logged.map((entry) => entry.url), ["/page/missing?utm_source=mail", "/blog/gone"]);

// The bare 404 outside the site's layout names the page in its heading, not only "404".
const bare = new JSDOM(renderToStaticMarkup(createElement(NotFoundTemplate))).window.document;
assert.deepEqual([...bare.querySelectorAll("h1")].map((h1) => h1.textContent), ["Page not found"]);

dom.window.close();
console.log(JSON.stringify({ logged: logged.length, heading: true }));
