import { expect, test } from "bun:test";
import { initializeProgress } from "../internals";
import { getImportStats } from "../queries";
import { createInitialProgress } from "../validators";
import { commerceHarness } from "../../commerce/__tests__/handlerHarness.test-support";

test("legacy sync jobs without optional taxonomy progress can initialize and report", async () => {
  const { categories: _categories, tags: _tags, ...legacyProgress } = createInitialProgress();
  legacyProgress.posts.imported = 2;
  const ctx = commerceHarness({ wordpressSyncJobs: [{ _id: "job", siteId: "site", status: "completed", progress: legacyProgress }] });
  const before = await (getImportStats as any)._handler(ctx, { siteId: "site" });
  expect(before.total).toBe(2);
  expect(before.categories).toBe(0);
  expect(before.tags).toBe(0);
  await (initializeProgress as any)._handler(ctx, { jobId: "job", counts: { users: 0, posts: 3, pages: 0, categories: 4, tags: 5, media: 0, comments: 0 } });
  const progress = ctx.tables.wordpressSyncJobs[0].progress;
  expect(progress.categories).toEqual({ total: 4, imported: 0, failed: 0 });
  expect(progress.tags).toEqual({ total: 5, imported: 0, failed: 0 });
  expect(progress.posts.imported).toBe(2);
});
