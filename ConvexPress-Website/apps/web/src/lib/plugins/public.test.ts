import { expect, test } from "bun:test";
import { isPublicPluginEnabled } from "./public";
test("a declared Events extension is enabled by its settings key", () => {
 expect(isPublicPluginEnabled("events", { plugins: { eventsEnabled: true } })).toBe(true);
});
test("a canonical disabled knowledge-base flag wins over its legacy alias", () => {
 expect(isPublicPluginEnabled("kb", { plugins: { knowledgeBaseEnabled: false, kbEnabled: true } })).toBe(false);
});
test("public plugin gates wait for settings and use existing platform defaults once loaded", () => {
 for (const id of ["knowledgeBase", "kb", "tickets", "recipes", "gallery"]) {
  expect(isPublicPluginEnabled(id, undefined)).toBe(false);
  expect(isPublicPluginEnabled(id, null)).toBe(false);
  expect(isPublicPluginEnabled(id, { plugins: {} })).toBe(true);
 }
});
