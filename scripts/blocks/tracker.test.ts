import { expect, test } from "bun:test";
import { fileURLToPath } from "node:url";
import { cp, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { discoverBlocks } from "./discovery.mjs";
import { collectTracker, parseTrackerRows, readTrackerFile, reconcileTracker, TRACKER } from "./tracker.mjs";
const root = fileURLToPath(new URL("../../", import.meta.url));
const row = (name = "events/upcoming") => ({ Name: name, Status: "In progress", "Spec Path": `blocks/${name}/block.json` });
const page = (offset: number, total: number, names: string[]) => ({
  context: { base: { id: TRACKER.baseId }, table: { id: TRACKER.tableId } },
  summary: { limit: 100, offset, matched: total, scanned: total, returned: names.length },
  records: names.map(Name => ({ id: Name, values: row(Name), fieldIds: { Name: "field-name", Status: "field-status", "Spec Path": "field-path" } })),
});
test("tracker reads complete paginated inventory and rejects foreign, truncated, duplicate or changing metadata", async () => {
  const offsets: number[] = [];
  expect((await collectTracker(async (offset: number) => { offsets.push(offset); return offset === 0 ? page(0, 2, ["core/hero"]) : page(1, 2, ["events/upcoming"]); })).length).toBe(2);
  expect(offsets).toEqual([0, 1]);
  for (const mutate of [
    (p: any) => { p.context.base.id = "wrong"; }, (p: any) => { p.context.table.id = "wrong"; },
    (p: any) => { p.summary.returned = 2; }, (p: any) => { p.summary.offset = 1; },
    (p: any) => { delete p.records[0].fieldIds.Status; }, (p: any) => { p.records[0].values.Name = ""; },
  ]) { const p = page(0, 1, ["events/upcoming"]); mutate(p); await expect(collectTracker(async () => p)).rejects.toThrow(); }
  await expect(collectTracker(async (offset: number) => offset ? page(offset, 2, []) : page(0, 2, ["core/hero"]))).rejects.toThrow("truncated");
  await expect(collectTracker(async (offset: number) => page(offset, offset ? 3 : 2, ["core/hero"]))).rejects.toThrow("changed");
  await expect(collectTracker(async (offset: number) => page(offset, 2, ["core/hero"]))).rejects.toThrow("duplicate");
  expect(() => parseTrackerRows([row(), row()])).toThrow("Duplicate");
});
test("offline verified snapshot crosschecks current spec; absent, mismatched or false Verified rows fail", async () => {
  const discovered = await discoverBlocks(root);
  const rows = await readTrackerFile(fileURLToPath(new URL("../../scripts/blocks/fixtures/inventory-2026-09-16.json", import.meta.url)));
  expect((await reconcileTracker({ root, discovered, rows })).specifications).toBe(discovered.blocks.length);
  await expect(reconcileTracker({ root, discovered, rows: [] })).rejects.toThrow("missing");
  await expect(reconcileTracker({ root, discovered, rows: rows.map((r: any) => r.Name === "events/upcoming" ? { ...r, "Spec Path": "blocks/wrong/block.json" } : r) })).rejects.toThrow("Spec Path");
  // A completed capture run must not invalidate the missing-evidence regression.
  // Keep the real local test files, but give this case its own empty output tree.
  const isolated = await mkdtemp(path.join(tmpdir(), "convexpress-tracker-missing-"));
  try {
    await cp(path.join(root, "blocks/events/upcoming"), path.join(isolated, "blocks/events/upcoming"), { recursive: true });
    await expect(reconcileTracker({ root: isolated, discovered, rows: rows.map((r: any) => ({ ...r, Status: r.Name === "events/upcoming" ? "Verified" : "In progress" })) })).rejects.toThrow("lacks a PNG screenshot");
  } finally {
    await rm(isolated, { recursive: true, force: true });
  }
  await expect(reconcileTracker({ root, discovered, rows: [...rows, { ...row("core/missing"), Status: "Verified" }] })).rejects.toThrow("no discovered specification");
});
