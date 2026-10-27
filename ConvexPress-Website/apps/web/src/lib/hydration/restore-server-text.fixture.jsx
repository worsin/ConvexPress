import assert from "node:assert/strict";
import { act, createElement } from "react";
import { renderToString } from "react-dom/server";
import { JSDOM } from "jsdom";

import { restoreServerText } from "./restore-server-text";

const ADDRESS = "info@example.com";

function Page() {
  return createElement(
    "main",
    null,
    // Text beside an element, as rich text renders it: React hydrates it as its own text node.
    createElement("p", null, `Tell us right away by email at ${ADDRESS} or by phone at `, createElement("strong", null, "(555) 010-0100"), "."),
    createElement("p", null, createElement("a", { href: `mailto:${ADDRESS}` }, ADDRESS)),
    // React's own neighbouring text: kept apart by a comment marker.
    createElement("p", null, "Open cases: ", 3),
  );
}

/** What the page holds once Cloudflare's decoder has run: each address its own text node. */
function asDecodedByCloudflare(document) {
  const walker = document.createTreeWalker(document.body, 4 /* NodeFilter.SHOW_TEXT */);
  const texts = [];
  for (let node = walker.nextNode(); node; node = walker.nextNode()) texts.push(node);
  let split = 0;
  for (const text of texts) {
    const at = text.data.indexOf(ADDRESS);
    if (at > 0) {
      text.splitText(at).splitText(ADDRESS.length);
      split++;
    }
  }
  return split;
}

async function hydrate({ restore }) {
  const dom = new JSDOM(`<!doctype html><html><body><div id="root">${renderToString(createElement(Page))}</div></body></html>`, { url: "https://example.test" });
  const previous = { window: globalThis.window, document: globalThis.document };
  Object.assign(globalThis, { window: dom.window, document: dom.window.document, IS_REACT_ACT_ENVIRONMENT: true });
  try {
    const document = dom.window.document;
    assert.equal(asDecodedByCloudflare(document), 1);
    const reactMarkers = document.body.innerHTML.split("<!-- -->").length - 1;
    if (restore) restoreServerText(document.body);
    // React's markers and text survive the merge.
    assert.equal(document.body.innerHTML.split("<!-- -->").length - 1, reactMarkers);
    const { hydrateRoot } = await import("react-dom/client");
    const errors = [];
    let root;
    await act(async () => {
      root = hydrateRoot(document.getElementById("root"), createElement(Page), {
        onRecoverableError: (error) => errors.push(error.message),
      });
    });
    const text = document.body.textContent;
    await act(async () => root.unmount());
    return { errors, text };
  } finally {
    Object.assign(globalThis, previous);
  }
}

// As served through Cloudflare, hydration fails: the case this guards.
const broken = await hydrate({ restore: false });
assert.ok(broken.errors.length > 0, "expected the split text to fail hydration");

const restored = await hydrate({ restore: true });
assert.deepEqual(restored.errors, []);
assert.ok(restored.text.includes(`Tell us right away by email at ${ADDRESS} or by phone at (555) 010-0100.`));
assert.ok(restored.text.includes("Open cases: 3"));

console.log(JSON.stringify({ broken: broken.errors.length, restored: restored.errors.length }));
