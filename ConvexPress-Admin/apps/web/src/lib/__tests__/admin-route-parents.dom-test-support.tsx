import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { mock } = require("bun:test") as {
  mock: { module: (name: string, factory: () => unknown) => void };
};
const { JSDOM } = createRequire(require.resolve("isomorphic-dompurify"))(
  "jsdom",
);
const dom = new JSDOM(
  "<!doctype html><html><body><div id='app'></div></body></html>",
  { url: "http://localhost" },
);
for (const name of [
  "window",
  "document",
  "HTMLElement",
  "Element",
  "Node",
  "MutationObserver",
  "getComputedStyle",
  "navigator",
]) {
  Object.defineProperty(globalThis, name, {
    configurable: true,
    writable: true,
    value: Reflect.get(dom.window, name),
  });
}
Object.defineProperty(globalThis, "IS_REACT_ACT_ENVIRONMENT", {
  configurable: true,
  value: true,
});
// Isolate routing from live plugin settings; the actual PluginGuard still decides whether children render.
let enabled = true;
mock.module("@/hooks/usePluginSettings", () => ({
  usePluginSettings: () => ({
    isLoading: false,
    plugins: [
      { id: "commerceReturns", title: "Returns" },
      { id: "tickets", title: "Tickets" },
    ],
    isEnabled: () => enabled,
  }),
}));
const { act } = await import("react"),
  { createRoot } = await import("react-dom/client");
const {
  createRootRoute,
  createRoute,
  createRouter,
  createMemoryHistory,
  RouterProvider,
  Outlet,
} = await import("@tanstack/react-router");
const entries = [
  {
    path: "/commerce/attributes",
    route: (
      await import("../../routes/_authenticated/_admin/commerce/attributes")
    ).Route,
    alias: "AuthenticatedAdminCommerceAttributesRoute",
    index: "commerce/attributes.index",
    children: ["/$attributeId"],
  },
  {
    path: "/commerce/customers",
    route: (
      await import("../../routes/_authenticated/_admin/commerce/customers")
    ).Route,
    alias: "AuthenticatedAdminCommerceCustomersRoute",
    index: "commerce/customers.index",
    children: ["/$userId/store-credit"],
  },
  {
    path: "/commerce/orders",
    route: (await import("../../routes/_authenticated/_admin/commerce/orders"))
      .Route,
    alias: "AuthenticatedAdminCommerceOrdersRoute",
    index: "commerce/orders.index",
    children: ["/abandoned", "/$orderId"],
  },
  {
    path: "/commerce/returns",
    route: (await import("../../routes/_authenticated/_admin/commerce/returns"))
      .Route,
    alias: "AuthenticatedAdminCommerceReturnsRoute",
    index: "commerce/returns.index",
    children: ["/settings", "/reasons", "/$returnId"],
  },
  {
    path: "/membership/plans",
    route: (await import("../../routes/_authenticated/_admin/membership/plans"))
      .Route,
    alias: "AuthenticatedAdminMembershipPlansRoute",
    index: "membership/plans.index",
    children: ["/$planId/edit"],
  },
];
for (const name of ["orders", "customers"]) {
  const route =
    name === "orders"
      ? (await import("../../routes/_authenticated/_admin/commerce/orders"))
          .Route
      : (await import("../../routes/_authenticated/_admin/commerce/customers"))
          .Route;
  const validator = route.options.validateSearch;
  assert.ok(validator && "safeParse" in validator);
  assert.equal(
    validator.safeParse({ search: "forest", page: 2, perPage: 25 }).success,
    true,
  );
  assert.equal(validator.safeParse({ page: 0, perPage: 101 }).success, false);
}
const generated = readFileSync(
  new URL("../../routeTree.gen.ts", import.meta.url),
  "utf8",
);
const updates = [
  ...generated.matchAll(
    /const (\w+)\s*=\s*(\w+)\.update\(\s*\{([\s\S]*?)\}\s*as any\s*,?\s*\)/g,
  ),
];
const container = document.getElementById("app")!;
const root = createRoot(container);
try {
  for (const entry of entries) {
    const generatedChildren = updates
      .filter((m) => m[3].includes(`getParentRoute: () => ${entry.alias},`))
      .map((m) => /path: '([^']+)'/.exec(m[3])?.[1]);
    assert.deepEqual(
      generatedChildren.sort(),
      ["/", ...entry.children].sort(),
      `${entry.path} must retain all generated child paths plus a real index`,
    );
    assert.ok(
      generated.includes(
        `from './routes/_authenticated/_admin/${entry.index}'`,
      ),
    );
    const top = createRootRoute({ component: Outlet });
    const parent = createRoute({
      getParentRoute: () => top,
      path: entry.path,
      component: entry.route.options.component,
    });
    const index = createRoute({
      getParentRoute: () => parent,
      path: "/",
      component: () => <h1>List index only</h1>,
    });
    const children = entry.children.map((path) =>
      createRoute({
        getParentRoute: () => parent,
        path,
        component: () => <h1>Visible child {path}</h1>,
      }),
    );
    const router = createRouter({
      routeTree: top.addChildren([parent.addChildren([index, ...children])]),
      history: createMemoryHistory({ initialEntries: [entry.path] }),
      defaultPendingMinMs: 0,
    });
    await router.load();
    await act(async () => root.render(<RouterProvider router={router} />));
    assert.equal(container.textContent, "List index only");
    for (const path of entry.children) {
      await act(async () =>
        router.navigate({
          to: entry.path + path.replace(/\$[A-Za-z]+/g, "fixture"),
        }),
      );
      await act(async () => router.load());
      assert.equal(container.textContent, `Visible child ${path}`);
      assert.equal(container.textContent?.includes("List index only"), false);
    }
    await act(async () => router.navigate({ to: entry.path }));
    await act(async () => router.load());
    assert.equal(container.textContent, "List index only");
    if (entry.path === "/commerce/returns") {
      enabled = false;
      await act(async () =>
        root.render(<RouterProvider key="disabled" router={router} />),
      );
      await act(async () =>
        router.navigate({ to: "/commerce/returns/settings" }),
      );
      await act(async () => router.load());
      assert.equal(container.textContent?.includes("Returns Disabled"), true);
      assert.equal(container.textContent?.includes("Visible child"), false);
      enabled = true;
    }
  }
  const { Route: support } = await import(
      "../../routes/_authenticated/_admin/support"
    ),
    { Route: supportIndex } = await import(
      "../../routes/_authenticated/_admin/support.index"
    );
  const top = createRootRoute({ component: Outlet }),
    parent = createRoute({
      getParentRoute: () => top,
      path: "/support",
      component: support.options.component,
    }),
    index = createRoute({
      getParentRoute: () => parent,
      path: "/",
      component: supportIndex.options.component,
    }),
    analytics = createRoute({
      getParentRoute: () => parent,
      path: "/analytics",
      component: () => <h1>Support analytics target</h1>,
    });
  const router = createRouter({
    routeTree: top.addChildren([parent.addChildren([index, analytics])]),
    history: createMemoryHistory({ initialEntries: ["/support"] }),
    defaultPendingMinMs: 0,
  });
  enabled = false;
  await router.load();
  await act(async () => root.render(<RouterProvider router={router} />));
  assert.equal(router.state.location.pathname, "/support");
  assert.equal(container.textContent?.includes("Tickets Disabled"), true);
  assert.equal(
    container.textContent?.includes("Support analytics target"),
    false,
  );
  enabled = true;
  await act(async () =>
    root.render(<RouterProvider key="support-enabled" router={router} />),
  );
  await act(async () => {
    await router.load();
  });
  assert.equal(router.state.location.pathname, "/support/analytics");
  assert.equal(container.textContent, "Support analytics target");
  const { Route: kb } = await import(
    "../../routes/_authenticated/_admin/kb/$articleId"
  );
  const kbTop = createRootRoute({ component: Outlet }),
    kbParent = createRoute({
      getParentRoute: () => kbTop,
      path: "/kb/$articleId",
      component: kb.options.component,
      beforeLoad: (context) => {
        if (kb.options.beforeLoad)
          Reflect.apply(kb.options.beforeLoad, undefined, [context]);
      },
    }),
    kbChild = createRoute({
      getParentRoute: () => kbParent,
      path: "/edit",
      component: () => <h1>Article editor</h1>,
    });
  const kbRouter = createRouter({
    routeTree: kbTop.addChildren([kbParent.addChildren([kbChild])]),
    history: createMemoryHistory({ initialEntries: ["/kb/fixture"] }),
    defaultPendingMinMs: 0,
  });
  await kbRouter.load();
  await act(async () => root.render(<RouterProvider router={kbRouter} />));
  assert.equal(kbRouter.state.location.pathname, "/kb/fixture/edit");
  assert.equal(container.textContent, "Article editor");
  console.log(
    "admin-route-parents: five generated layouts/indexes and eight child paths render; returns guard retained; support and KB defaults redirect",
  );
} finally {
  await act(async () => root.unmount());
  dom.window.close();
}
