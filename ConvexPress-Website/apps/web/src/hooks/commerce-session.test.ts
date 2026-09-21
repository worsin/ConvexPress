import { expect, test } from "bun:test";
import { persistCommerceSession, resolveCommerceSession } from "./commerce-session";
function storage() { const data = new Map<string,string>(); return { getItem: (key:string) => data.get(key) ?? null, setItem: (key:string,value:string) => { data.set(key,value); } }; }
test("guest cart survives sign-in; sign-out and account switches rotate the token", () => {
  const store = storage();
  const guest = resolveCommerceSession(store, "anonymous", "site-one");
  const a = resolveCommerceSession(store, "customer-a", "site-one");
  expect(a.token).toBe(guest.token);
  expect(resolveCommerceSession(store, "customer-a", "site-one").token).toBe(a.token);
  const b = resolveCommerceSession(store, "customer-b", "site-one");
  expect(b.token).not.toBe(a.token);
  const out = resolveCommerceSession(store, "anonymous", "site-one");
  expect(out.token).not.toBe(b.token);
  expect(resolveCommerceSession(store, "anonymous", "site-one").token).toBe(out.token);
});
test("storage-disabled consumers share one in-memory token and still rotate on sign-out", () => {
  const broken = { getItem: () => { throw new Error("disabled"); }, setItem: () => { throw new Error("disabled"); } };
  const a = resolveCommerceSession(broken, "customer-a", "site-one");
  expect(resolveCommerceSession(broken, "customer-a", "site-one", a).token).toBe(a.token);
  expect(resolveCommerceSession(broken, "anonymous", "site-one", a).token).not.toBe(a.token);
});

test("site records preserve independent baskets across a shared-origin round trip", () => {
  const store = storage();
  const a = resolveCommerceSession(store, "anonymous", "source");
  const b = resolveCommerceSession(store, "anonymous", "target", a);
  expect(b.token).not.toBe(a.token);
  expect(resolveCommerceSession(store, "anonymous", "source", b)).toEqual(a);
  expect(resolveCommerceSession(store, "anonymous", "target", a)).toEqual(b);
});

test("legacy guest baskets migrate once and cannot be adopted by a second site", () => {
  const store = storage();
  store.setItem("commerce_session_token", "legacy-guest-token");
  store.setItem("commerce_session_owner", "anonymous");
  const a = resolveCommerceSession(store, "customer-a", "source");
  expect(a.token).toBe("legacy-guest-token");
  const b = resolveCommerceSession(store, "customer-a", "target");
  expect(b.token).not.toBe(a.token);
  expect(resolveCommerceSession(store, "customer-a", "source")).toEqual(a);
});

test("legacy owned baskets rotate for another shopper and cannot migrate without a durable scope claim", () => {
  const store = storage();
  store.setItem("commerce_session_token", "private-basket");
  store.setItem("commerce_session_owner", "customer-a");
  expect(resolveCommerceSession(store, "customer-b", "source").token).not.toBe("private-basket");
  const readOnly = { getItem: store.getItem, setItem() { throw Error("quota"); } };
  expect(resolveCommerceSession(readOnly, "customer-a", "target").token).not.toBe("private-basket");
});

test("corrupt and foreign scoped storage cannot override a valid scoped memory fallback", () => {
  const store = storage(), fallback = { token: "memory-token", owner: "customer-a", scope: "source" };
  for (const value of ["broken json", JSON.stringify({ ...fallback, scope: "target" }), JSON.stringify({ scope: "source", owner: "customer-a", token: 42 })]) {
    store.setItem("commerce_session_v2:source", value);
    expect(resolveCommerceSession(store, "customer-a", "source", fallback)).toEqual(fallback);
  }
  persistCommerceSession(store, { ...fallback, token: "server-settled-token" });
  expect(resolveCommerceSession(store, "customer-a", "source").token).toBe("server-settled-token");
});

test("failed storage writes cannot revive the legacy token after the server has replaced it", () => {
  const store = storage();
  store.setItem("commerce_session_token", "obsolete-legacy-token");
  store.setItem("commerce_session_owner", "anonymous");
  const quota = { getItem: store.getItem, setItem(key: string, value: string) {
    if (key.startsWith("commerce_session_v2:")) throw Error("quota exceeded");
    store.setItem(key, value);
  } };
  const proposed = resolveCommerceSession(quota, "customer-a", "source");
  const settled = { ...proposed, token: "server-replacement-token" };
  persistCommerceSession(quota, settled);
  expect(resolveCommerceSession(quota, "customer-a", "source", settled)).toEqual(settled);
});
