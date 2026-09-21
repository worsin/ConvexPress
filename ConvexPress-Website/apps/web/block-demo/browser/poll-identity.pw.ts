import { test, expect } from "@playwright/test";
import { fileURLToPath } from "node:url";
const clientModule = `/@fs${fileURLToPath(new URL("../../src/templates/sdk/block-renderer/poll-client.ts", import.meta.url))}`;
for (const mode of ["locks", "indexeddb"]) test(`simultaneous poll tabs share one persistent identity using ${mode}`, async ({ page, context }) => {
  const second = await context.newPage();
  await Promise.all([page.goto("/", { waitUntil: "networkidle" }), second.goto("/", { waitUntil: "networkidle" })]);
  const key = `synthetic-poll-concurrency-${mode}-${Date.now()}`;
  const invoke = (tab: typeof page) => tab.evaluate(async ({ key, mode, source }) => {
    const { ensurePollVisitorAcrossTabs } = await import(source);
    if (mode === "locks" && !navigator.locks) throw Error("Web Locks unavailable in test browser");
    return ensurePollVisitorAcrossTabs(localStorage, key, crypto, mode === "locks" ? { locks: navigator.locks } : { indexedDB });
  }, { key, mode, source: clientModule });
  const tokens = await Promise.all(Array.from({ length: 12 }, (_, index) => invoke(index % 2 ? second : page)));
  expect(new Set(tokens).size).toBe(1); expect(tokens[0]).toMatch(/^[a-f0-9]{64}$/);
  await second.reload({ waitUntil: "networkidle" }); expect(await invoke(second)).toBe(tokens[0]);
  await second.close();
});
