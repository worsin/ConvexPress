import assert from "node:assert/strict";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { JSDOM } = createRequire(require.resolve("isomorphic-dompurify"))(
  "jsdom",
);
const dom = new JSDOM(
  "<!doctype html><html><body><div id='root'></div></body></html>",
  { pretendToBeVisual: true },
);
for (const name of [
  "window",
  "document",
  "HTMLElement",
  "Element",
  "Node",
  "navigator",
  "MutationObserver",
  "getComputedStyle",
])
  Object.defineProperty(globalThis, name, {
    configurable: true,
    value: Reflect.get(dom.window, name),
  });
Object.defineProperty(globalThis, "requestAnimationFrame", {
  configurable: true,
  value: dom.window.requestAnimationFrame.bind(dom.window),
});
Object.defineProperty(globalThis, "cancelAnimationFrame", {
  configurable: true,
  value: dom.window.cancelAnimationFrame.bind(dom.window),
});
Object.defineProperty(globalThis, "IS_REACT_ACT_ENVIRONMENT", {
  configurable: true,
  value: true,
});
const { mock } = require("bun:test") as {
  mock: { module: (id: string, factory: () => unknown) => void };
};
const roles = [
  {
    _id: "editor",
    name: "Editor",
    slug: "editor",
    type: "internal",
    status: "active",
    level: 80,
    isDefault: false,
  },
  {
    _id: "subscriber",
    name: "Subscriber",
    slug: "subscriber",
    type: "customer",
    status: "active",
    level: 0,
    isDefault: true,
  },
  {
    _id: "inactive",
    name: "Inactive",
    slug: "inactive",
    type: "customer",
    status: "inactive",
    level: 0,
    isDefault: false,
  },
];
mock.module("convex/react", () => ({
  useMutation: () => async () => ({ updated: 0, errors: [] }),
}));
mock.module("convex-helpers/react/cache", () => ({ useQuery: () => roles }));
mock.module("@backend/convex/_generated/api", () => ({
  api: {
    profiles: { mutations: { bulkChangeRole: {} } },
    registration: { mutations: { inviteUser: {} } },
    roles: { queries: { listRoles: {}, getDefaultRole: {} } },
  },
}));
const { act } = await import("react");
const { createRoot } = await import("react-dom/client");
const { RoleSelector } = await import("./role-selector");
const container = document.getElementById("root")!;
const root = createRoot(container);
let selected = "";
try {
  for (const authSource of ["clerk", undefined] as const) {
    await act(async () =>
      root.render(
        <>
          <label htmlFor="role">Role</label>
          <RoleSelector
            id="role"
            value="editor"
            assignmentTarget={{ authSource }}
            onChange={(value) => {
              selected = value;
            }}
          />
        </>,
      ),
    );
    const select = container.querySelector("select")!;
    assert.equal(container.querySelector("label")?.control, select);
    assert.equal(
      select.querySelector('option[value="editor"]')?.textContent,
      "Current role is unavailable for this account",
    );
    assert.equal(
      select.querySelector<HTMLOptionElement>('option[value="editor"]')
        ?.disabled,
      true,
    );
    assert.deepEqual(
      [...select.options]
        .filter((option) => !option.disabled)
        .map((option) => option.value),
      ["subscriber"],
    );
    assert.ok(select.getAttribute("aria-describedby"));
    assert.ok(
      document
        .getElementById(select.getAttribute("aria-describedby")!)
        ?.textContent?.includes("customer roles"),
    );
    assert.equal(selected, "");
    await act(async () => {
      select.value = "subscriber";
      select.dispatchEvent(new dom.window.Event("change", { bubbles: true }));
    });
    assert.equal(selected, "subscriber");
    selected = "";
  }
  for (const authSource of ["local", "management"] as const) {
    await act(async () =>
      root.render(
        <RoleSelector
          id="role"
          value="editor"
          assignmentTarget={{ authSource }}
          onChange={() => {}}
        />,
      ),
    );
    assert.deepEqual(
      [...container.querySelectorAll("option")].map((option) => option.value),
      ["editor", "subscriber"],
    );
    assert.equal(
      container.querySelector("select")?.getAttribute("aria-describedby"),
      null,
    );
  }
  const { InviteUserForm } = await import("../registration/InviteUserForm");
  await act(async () => root.render(<InviteUserForm />));
  assert.deepEqual(
    [...container.querySelectorAll("#invite-role option")]
      .filter((option) => !(option as HTMLOptionElement).disabled)
      .map((option) => (option as HTMLOptionElement).value),
    ["subscriber"],
  );
  assert.ok(container.textContent?.includes("customer roles"));
  const { BulkChangeRoleDialog } = await import(
    "../users/BulkChangeRoleDialog"
  );
  await act(async () =>
    root.render(
      <BulkChangeRoleDialog
        open
        onClose={() => {}}
        onComplete={() => {}}
        userIds={[]}
        assignmentTargets={[{ authSource: "local" }, { authSource: "clerk" }]}
      />,
    ),
  );
  assert.deepEqual(
    [
      ...document.querySelectorAll<HTMLOptionElement>(
        "#bulk-role-select option",
      ),
    ]
      .filter((option) => !option.disabled)
      .map((option) => option.value),
    ["subscriber"],
  );
  assert.ok(document.body.textContent?.includes("customer roles"));
  console.log(
    "role-selector: identity-filtered options, unavailable current role, explanation and actual customer selection passed",
  );
} finally {
  await act(async () => root.unmount());
  dom.window.close();
}
