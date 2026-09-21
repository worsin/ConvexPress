import { expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { createRequire } from "node:module";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { MediaContinuation, MediaReadBoundary } from "./MediaPagination";
import { mediaProgressText, summarizeMediaCounts } from "./media-pagination";

test("count merging replaces duplicate IDs and never advertises partial totals as complete", () => {
  const a = { _id: "a", mediaType: "image", mine: true, unattached: true, trashed: false };
  const b = { _id: "b", mediaType: "archive", mine: false, unattached: false, trashed: false };
  const first = summarizeMediaCounts([a, a, b], "CanLoadMore");
  expect(first.counted).toBe(2);
  expect(first.complete).toBe(false);
  expect(first.counts.all).toBe(2);
  expect(first.counts.images).toBe(1);
  const changed = summarizeMediaCounts([a, b, { ...a, trashed: true }], "Exhausted");
  expect(changed.complete).toBe(true);
  expect(changed.counts).toEqual({ all: 1, images: 0, audio: 0, video: 0, documents: 0, mine: 0, unattached: 0, trashed: 1 });
  // Pagination reset supplies new results rather than appending old scope state.
  expect(summarizeMediaCounts([], "LoadingFirstPage").counted).toBe(0);
  expect(summarizeMediaCounts([{ ...a, _id: "other-site" }], "CanLoadMore").counts.all).toBe(1);
});

test("empty intermediate pages keep a usable continuation; final empty results are distinct", () => {
  const partial = renderToStaticMarkup(<MediaContinuation status="CanLoadMore" count={0} loadMore={() => {}} />);
  expect(partial).toContain("No matches in the loaded pages");
  expect(partial).toContain("Load more media");
  expect(partial).not.toContain(' disabled="');
  const final = renderToStaticMarkup(<MediaContinuation status="Exhausted" count={0} loadMore={() => {}} />);
  expect(final).toContain("No matching media found");
  expect(final).not.toContain("<button");
  expect(mediaProgressText(100, "LoadingMore", true)).toContain("totals incomplete");
  expect(mediaProgressText(205, "Exhausted", true)).toContain("counts complete");
  const loading = renderToStaticMarkup(<MediaContinuation counting status="LoadingMore" count={100} loadMore={() => {}} />);
  expect(loading).toContain(' disabled="');
  expect(loading).toContain("totals incomplete");
});

test("budget errors stay inside the media boundary without rendering exception details", () => {
  const boundary = new MediaReadBoundary({ children: <p>Library data</p> });
  expect(renderToStaticMarkup(boundary.render())).toContain("Library data");
  boundary.state = MediaReadBoundary.getDerivedStateFromError();
  const html = renderToStaticMarkup(boundary.render());
  expect(html).toContain("Retry media");
  expect(html).toContain("read budget");
  expect(html).not.toContain("Library data");
});

test("rendered continuation requests exactly one bounded page and blocks clicks while loading", async () => {
  const require = createRequire(import.meta.url);
  const { JSDOM } = createRequire(require.resolve("isomorphic-dompurify"))("jsdom");
  const dom = new JSDOM("<html><body><div id='app'></div></body></html>", { url: "http://localhost" });
  const names = ["window", "document", "HTMLElement", "Node", "IS_REACT_ACT_ENVIRONMENT"] as const;
  const old = names.map((name) => [name, Object.getOwnPropertyDescriptor(globalThis, name)] as const);
  for (const name of names) Object.defineProperty(globalThis, name, { configurable: true, writable: true, value: name === "IS_REACT_ACT_ENVIRONMENT" ? true : dom.window[name] });
  const container = document.getElementById("app")!;
  const root = createRoot(container);
  const calls: number[] = [];
  try {
    await act(async () => root.render(<MediaContinuation status="CanLoadMore" count={0} pageSize={25} loadMore={(size) => calls.push(size)} />));
    await act(async () => container.querySelector("button")!.click());
    expect(calls).toEqual([25]);
    await act(async () => root.render(<MediaContinuation status="LoadingMore" count={0} pageSize={25} loadMore={(size) => calls.push(size)} />));
    await act(async () => container.querySelector("button")!.click());
    expect(calls).toEqual([25]);
    await act(async () => root.render(<MediaContinuation status="Exhausted" count={1} pageSize={25} loadMore={(size) => calls.push(size)} />));
    expect(container.querySelector("button")).toBeNull();
    expect(container.textContent).toContain("1 matching media items loaded · complete");
  } finally {
    await act(async () => root.unmount());
    dom.window.close();
    for (const [name, descriptor] of old) {
      if (descriptor) Object.defineProperty(globalThis, name, descriptor);
      else Reflect.deleteProperty(globalThis, name);
    }
  }
});
