import { expect, test } from "bun:test";
import { isAppRendererSender, isTrustedDesktopSender } from "./setupSender";

test("production sender policy never accepts the development origin", () => {
  for (const url of [
    "http://localhost:4105/",
    "http://localhost:4105/untrusted.html",
    "https://remote.example/",
  ]) {
    expect(isAppRendererSender(url)).toBe(false);
    expect(isTrustedDesktopSender(url, { wizardIndexPath: "/app/wizard/index.html" })).toBe(false);
  }
  expect(isAppRendererSender("convexpress-app://shell/index.html#/dashboard")).toBe(true);
});
