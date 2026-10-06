import { expect, test } from "bun:test";
import { createRequire } from "node:module";
import { renderToStaticMarkup } from "react-dom/server";
import { createMemoryHistory, createRootRoute, createRouter, RouterProvider } from "@tanstack/react-router";
import { InlineActions } from "./InlineActions";

const require = createRequire(import.meta.url);
const { JSDOM } = createRequire(require.resolve("isomorphic-dompurify"))("jsdom");

test("published Website actions open separately while editor actions stay in Admin", async () => {
  const route = createRootRoute({ component: () => <InlineActions row={{}} actions={[
    { key: "edit", label: "Edit", type: "link", href: () => "/pages/id/edit" },
    { key: "view", label: "View", type: "link", href: () => "http://localhost:4328/page/the-house", external: true },
  ]} /> });
  const router = createRouter({ routeTree: route, history: createMemoryHistory({ initialEntries: ["/"] }) });
  await router.load();
  const dom = new JSDOM(renderToStaticMarkup(<RouterProvider router={router} />));
  try {
    const [edit, view] = dom.window.document.querySelectorAll("a");
    expect(edit.getAttribute("href")).toBe("/pages/id/edit");
    expect(edit.getAttribute("target")).toBeNull();
    expect(view.getAttribute("href")).toBe("http://localhost:4328/page/the-house");
    expect(view.getAttribute("target")).toBe("_blank");
    expect(view.getAttribute("rel")).toBe("noopener noreferrer");
  } finally {
    dom.window.close();
  }
});
