import { expect, test } from "bun:test";
import { exchangeOperatorCode, takeOperatorCode, takeOperatorLaunch, renewWebsiteOperator, operatorNetworkFailure } from "./websiteOperator";

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

test("desktop launch secrets are scrubbed and only a bounded loopback endpoint is accepted", () => {
  const desktop = { endpoint: "http://127.0.0.1:51234/convexpress/website-editing", key: "cd".repeat(32), expiresAt: Date.now() + 60000 };
  let scrubbed = "";
  const history = { state: null, replaceState: (_state: unknown, _title: string, url?: string | URL | null) => { scrubbed = String(url); } };
  const href = (bridge: unknown) => `https://site.example/?customize=1#${new URLSearchParams({ "cp-customize": code, "cp-desktop": JSON.stringify(bridge) })}`;
  expect(takeOperatorLaunch({ href: href(desktop) }, history)).toEqual({ code, desktop });
  expect(scrubbed).toBe("/?customize=1");
  for (const endpoint of ["https://attacker.example/convexpress/website-editing", "http://127.0.0.1:51234/other", "http://localhost:51234/convexpress/website-editing", desktop.endpoint + "?extra=1", "http://user@127.0.0.1:51234/convexpress/website-editing"]) {
    expect(() => takeOperatorLaunch({ href: href({ ...desktop, endpoint }) }, history)).toThrow();
    expect(scrubbed).toBe("/?customize=1");
  }
  expect(() => takeOperatorLaunch({ href: href({ ...desktop, expiresAt: Date.now() - 1 }) }, history)).toThrow();
});

test("renewal gets only a one-use code from the desktop and redeems against the configured site", async () => {
  const desktop = { endpoint: "http://127.0.0.1:51234/convexpress/website-editing", key: "cd".repeat(32), expiresAt: Date.now() + 60000 };
  const runtime = { convexUrl: "https://db.convex.cloud", convexSiteUrl: "https://db.convex.site", instanceKey: "staging" };
  const session = { token: "fresh", expiresAt: Date.now() + 60000, instanceKey: "staging", userId: "alice" };
  const calls: Array<{ url: string; body: unknown }> = [];
  const fetcher = (async (url: URL | RequestInfo, init?: RequestInit) => {
    expect(init?.credentials).toBe("omit"); expect(init?.redirect).toBe("error");
    calls.push({ url: String(url), body: JSON.parse(String(init?.body)) });
    return Response.json(calls.length === 1 ? { code } : session);
  }) as typeof fetch;
  expect(await renewWebsiteOperator(desktop, runtime, fetcher)).toEqual(session);
  expect(calls).toEqual([{ url: desktop.endpoint, body: { key: desktop.key, action: "renew" } }, { url: "https://db.convex.site/auth/operator-handoff", body: { code } }]);
});

test("exchange uses the selected backend without cookies, redirect or cache and validates deployment and expiry", async () => {
  const runtime = { convexUrl: "https://db.convex.cloud", convexSiteUrl: "https://db.convex.site", instanceKey: "site:staging" };
  const valid = { token: "synthetic-token", expiresAt: Date.now() + 60000, instanceKey: runtime.instanceKey };
  let captured: { url: string; init?: RequestInit } | null = null;
  const fetcher = (async (url: URL | RequestInfo, init?: RequestInit) => { captured = { url: String(url), init }; return Response.json(valid); }) as typeof fetch;
  expect(await exchangeOperatorCode(code, runtime, fetcher)).toEqual(valid);
  expect(captured).toEqual({ url: "https://db.convex.site/auth/operator-handoff", init: { method: "POST", credentials: "omit", cache: "no-store", redirect: "error", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ code }) } });
  for (const invalid of [{ ...valid, instanceKey: "other:live" }, { ...valid, expiresAt: Date.now() - 1 }, { ...valid, expiresAt: Date.now() + 600000 }, { ...valid, token: "" }, { ...valid, viewerSubject: "" }, { ...valid, viewerSubject: 42 }, { ...valid, viewerSubject: "x".repeat(201) }, null]) {
    await expect(exchangeOperatorCode(code, runtime, (async () => Response.json(invalid)) as typeof fetch)).rejects.toThrow();
  }
  await expect(exchangeOperatorCode(code, runtime, (async () => new Response(null, { status: 403 })) as typeof fetch)).rejects.toThrow();
  await expect(exchangeOperatorCode(code, runtime, (async () => { throw new TypeError("private network details"); }) as typeof fetch)).rejects.toThrow(operatorNetworkFailure);
});
