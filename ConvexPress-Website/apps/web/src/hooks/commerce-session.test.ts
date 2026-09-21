import { expect, test } from "bun:test";
import { resolveCommerceSession } from "./commerce-session";
function storage() { const data = new Map<string,string>(); return { getItem: (key:string) => data.get(key) ?? null, setItem: (key:string,value:string) => { data.set(key,value); } }; }
test("guest cart survives sign-in; sign-out and account switches rotate the token", () => {
  const store = storage();
  const guest = resolveCommerceSession(store, "anonymous");
  const a = resolveCommerceSession(store, "customer-a");
  expect(a.token).toBe(guest.token);
  expect(resolveCommerceSession(store, "customer-a").token).toBe(a.token);
  const b = resolveCommerceSession(store, "customer-b");
  expect(b.token).not.toBe(a.token);
  const out = resolveCommerceSession(store, "anonymous");
  expect(out.token).not.toBe(b.token);
  expect(resolveCommerceSession(store, "anonymous").token).toBe(out.token);
});
test("storage-disabled consumers share one in-memory token and still rotate on sign-out", () => {
  const broken = { getItem: () => { throw new Error("disabled"); }, setItem: () => { throw new Error("disabled"); } };
  const a = resolveCommerceSession(broken, "customer-a");
  expect(resolveCommerceSession(broken, "customer-a", a).token).toBe(a.token);
  expect(resolveCommerceSession(broken, "anonymous", a).token).not.toBe(a.token);
});
