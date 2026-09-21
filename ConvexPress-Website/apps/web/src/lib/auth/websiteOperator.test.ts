import { expect, test } from "bun:test";
import { exchangeOperatorCode, takeOperatorCode, operatorNetworkFailure } from "./websiteOperator";

const code = "ab".repeat(32);
test("handoff fragments are removed while preserving router history, query and unrelated anchors", () => {
  const calls: unknown[][] = [];
  const state = { key: "router-state" };
  const history = { state, replaceState: (...args: unknown[]) => { calls.push(args); } };
  expect(takeOperatorCode({ href: `https://site.example/?customize=1#cp-customize=${code}&section=header` }, history)).toBe(code);
  expect(calls).toEqual([[state, "", "/?customize=1#section=header"]]);
  for (const hash of ["cp-customize=invalid", `cp-customize=${code}&cp-customize=${code}`]) {
    expect(() => takeOperatorCode({ href: `https://site.example/#${hash}` }, history)).toThrow();
    expect(calls.at(-1)?.[2]).toBe("/");
  }
  expect(takeOperatorCode({ href: "https://site.example/#section" }, history)).toBeNull();
});

test("exchange uses the selected backend without cookies, redirect or cache and validates deployment and expiry", async () => {
  const runtime = { convexUrl: "https://db.convex.cloud", convexSiteUrl: "https://db.convex.site", instanceKey: "site:staging" };
  const valid = { token: "synthetic-token", expiresAt: Date.now() + 60000, instanceKey: runtime.instanceKey };
  let captured: { url: string; init?: RequestInit } | null = null;
  const fetcher = (async (url: URL | RequestInfo, init?: RequestInit) => { captured = { url: String(url), init }; return Response.json(valid); }) as typeof fetch;
  expect(await exchangeOperatorCode(code, runtime, fetcher)).toEqual(valid);
  expect(captured).toEqual({ url: "https://db.convex.site/auth/operator-handoff", init: { method: "POST", credentials: "omit", cache: "no-store", redirect: "error", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ code }) } });
  for (const invalid of [{ ...valid, instanceKey: "other:live" }, { ...valid, expiresAt: Date.now() - 1 }, { ...valid, expiresAt: Date.now() + 600000 }, { ...valid, token: "" }, null]) {
    await expect(exchangeOperatorCode(code, runtime, (async () => Response.json(invalid)) as typeof fetch)).rejects.toThrow();
  }
  await expect(exchangeOperatorCode(code, runtime, (async () => new Response(null, { status: 403 })) as typeof fetch)).rejects.toThrow();
  await expect(exchangeOperatorCode(code, runtime, (async () => { throw new TypeError("private network details"); }) as typeof fetch)).rejects.toThrow(operatorNetworkFailure);
});
