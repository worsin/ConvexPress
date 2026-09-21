import { test, expect } from "bun:test";
import { CloudflareApi } from "../providerApi";
test("API token verification uses the selected official owner endpoint and preserves verified expiry", async () => {
 for (const kind of ["user", "account"] as const) {
  const expiry = new Date(Date.now() + 3600000).toISOString();
  const api = new CloudflareApi("synthetic-api-token", "a".repeat(32), async (url, init) => {
   expect(new URL(String(url)).pathname).toBe(kind === "user" ? "/client/v4/user/tokens/verify" : "/client/v4/accounts/" + "a".repeat(32) + "/tokens/verify");
   expect(init?.method).toBe("GET");
   return Response.json({ success: true, result: { id: "synthetic-token-id", status: "active", expires_on: expiry } });
  });
  expect(await api.verifyApiToken(kind)).toEqual({ expiresAt: Date.parse(expiry) });
 }
});
test("inactive, expired, future and malformed token lifetimes fail closed; no expiry is allowed", async () => {
 for (const fields of [{ status: "disabled" }, { expires_on: new Date(Date.now() - 1).toISOString() }, { not_before: new Date(Date.now() + 600000).toISOString() }, { expires_on: "not-a-date" }, { expires_on: null }]) {
  const api = new CloudflareApi("synthetic-api-token", "a".repeat(32), async () => Response.json({ success: true, result: { id: "synthetic-id", status: "active", ...fields } }));
  await expect(api.verifyApiToken("user")).rejects.toThrow();
 }
 const api = new CloudflareApi("synthetic-api-token", "a".repeat(32), async () => Response.json({ success: true, result: { id: "synthetic-id", status: "active" } }));
 expect(await api.verifyApiToken("user")).toEqual({});
});
