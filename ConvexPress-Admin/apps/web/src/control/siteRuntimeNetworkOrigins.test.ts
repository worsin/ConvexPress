import { expect, test } from "bun:test";
import { siteRuntimeNetworkOrigins } from "./siteRuntimeNetworkOrigins";

test("cloud site selection permits the exact backend and independent preview website", () => {
  expect(siteRuntimeNetworkOrigins({ deploymentOrigin: "https://fictional.convex.cloud", siteOrigin: "https://studio.example/staging?mode=preview#document" })).toEqual(["https://fictional.convex.cloud", "https://studio.example"]);
});
test("switching websites changes the preview origin even with the same backend", () => {
  const deploymentOrigin = "http://192.168.1.10:4720";
  expect(siteRuntimeNetworkOrigins({ deploymentOrigin, siteOrigin: "http://localhost:4318" })).toEqual([deploymentOrigin, "http://localhost:4318"]);
  expect(siteRuntimeNetworkOrigins({ deploymentOrigin, siteOrigin: "https://new.example" })).toEqual([deploymentOrigin, "https://new.example"]);
});
test("unselected, credential-bearing and non-network addresses do not grant access", () => {
  expect(siteRuntimeNetworkOrigins(null)).toEqual([]);
  for (const siteOrigin of ["https://user:password@site.example", "file:///tmp/site", "javascript:alert(1)", "not a URL"]) {
    expect(siteRuntimeNetworkOrigins({ deploymentOrigin: "https://fictional.convex.cloud", siteOrigin })).toEqual(["https://fictional.convex.cloud"]);
  }
  expect(siteRuntimeNetworkOrigins({ deploymentOrigin: "https://site.example/backend", siteOrigin: "https://site.example/" })).toEqual(["https://site.example"]);
});
