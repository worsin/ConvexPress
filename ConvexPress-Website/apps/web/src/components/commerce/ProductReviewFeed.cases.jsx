import { test, expect } from "bun:test";
import { createRequire } from "node:module";
import { act } from "react";
import { ConvexProvider } from "convex/react";
import { ProductReviewFeed } from "./ProductReviewFeed";
const require = createRequire(import.meta.url);
const { JSDOM } = createRequire(require.resolve("isomorphic-dompurify"))("jsdom");
async function inDom(run) {
  const dom = new JSDOM('<div id="root"></div>', { url: "https://example.test/products/notebook", pretendToBeVisual: true });
  const names = ["window", "document", "HTMLElement", "IS_REACT_ACT_ENVIRONMENT"], old = Object.fromEntries(names.map(k => [k, globalThis[k]]));
  Object.assign(globalThis, { window: dom.window, document: dom.window.document, HTMLElement: dom.window.HTMLElement, IS_REACT_ACT_ENVIRONMENT: true });
  const { createRoot } = await import("react-dom/client"), root = createRoot(document.getElementById("root"));
  try { await run(root); } finally { await act(async () => root.unmount()); dom.window.close(); Object.assign(globalThis, old); }
}
function fixture() {
  const values = new Map(), watches = []; let connection = { isWebSocketConnected: true }, onConnection = () => {};
  const key = args => `${args.productId}:${args.sortBy}:${args.paginationOpts.cursor ?? "first"}`;
  const client = { logger: { warn() {} }, connectionState: () => connection, subscribeToConnectionState(fn) { onConnection = fn; return () => {}; },
    watchQuery(fn, args) { const watch = { args, stopped: false, update: () => {} }; watches.push(watch); return { localQueryResult: () => values.get(key(args)), onUpdate(fn) { watch.update = fn; return () => { watch.stopped = true; }; } }; },
  };
  return { watches, set(sort, cursor, value, product = "product-a") { values.set(`${product}:${sort}:${cursor ?? "first"}`, value); },
    notify() { for (const w of watches) if (!w.stopped) w.update(); }, offline() { connection = { isWebSocketConnected: false }; onConnection(); },
    view(product = "product-a", session = "a") { return <ConvexProvider client={client}><ProductReviewFeed key={`${product}:${session}`} productId={product} instanceKey="site-a" renderReview={r => <article>{r.title}</article>} /></ConvexProvider>; },
  };
}
const review = (id, title) => ({ state: "review", _id: id, rating: 4, title, helpfulCount: 0, isVerifiedPurchase: false, userName: "Reader", createdAt: 1 });
const page = (items, done = true, cursor = "") => ({ page: items, isDone: done, continueCursor: cursor });
test("real paginated review hook appends pages and labels the displayed count honestly", async () => {
  const f = fixture(); f.set("newest", null, page([review("r1", "First review")], false, "next"));
  await inDom(async root => {
    await act(async () => root.render(f.view())); expect(document.body.textContent).toContain("1 review shown");
    expect(f.watches[0].args.paginationOpts.numItems).toBe(12);
    await act(async () => document.querySelector("button").click()); expect(document.querySelector("button").disabled).toBe(true);
    f.set("newest", "next", page([review("r2", "Later review")])); await act(async () => f.notify());
    expect(document.querySelectorAll("article")).toHaveLength(2); expect(document.body.textContent).toContain("2 reviews shown"); expect(document.querySelector("button")).toBeNull();
  });
});
test("sorting and product changes clear old results while empty intermediate pages can continue", async () => {
  const f = fixture(); f.set("newest", null, page([review("r1", "Old ordering")]));
  await inDom(async root => {
    await act(async () => root.render(f.view()));
    await act(async () => { const select = document.querySelector("select"); select.value = "highest"; select.dispatchEvent(new window.Event("change", { bubbles: true })); });
    expect(document.body.textContent).not.toContain("Old ordering"); expect(document.body.textContent).toContain("Loading reviews");
    f.set("highest", null, page([], false, "next")); await act(async () => f.notify());
    expect(document.body.textContent).not.toContain("No reviews yet"); expect(document.querySelector("button").textContent).toBe("Load more reviews");
    await act(async () => root.render(f.view("product-b", "b"))); expect(document.body.textContent).toContain("Loading reviews");
  });
});
test("offline and denied continuations conceal every retained review", async () => {
  const f = fixture(); f.set("newest", null, page([review("r1", "Member review")], false, "next"));
  await inDom(async root => {
    await act(async () => root.render(f.view())); await act(async () => document.querySelector("button").click());
    f.set("newest", "next", page([{ state: "unavailable" }])); await act(async () => f.notify());
    expect(document.body.textContent).toContain("Reviews are unavailable"); expect(document.querySelector("article")).toBeNull();
  });
  const offline = fixture(); offline.set("newest", null, page([review("r1", "Member review")]));
  await inDom(async root => { await act(async () => root.render(offline.view())); await act(async () => offline.offline()); expect(document.body.textContent).toContain("Reconnecting"); expect(document.querySelector("article")).toBeNull(); });
});
