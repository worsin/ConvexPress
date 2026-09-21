import { expect, test } from "bun:test";
import { commerceHarness } from "../../commerce/__tests__/handlerHarness.test-support";
import { purgeAllContent } from "../../_devPurge";
import { currentReferenceGeneration, requireReferenceIndexReady } from "../reverseIndex";
import { MEDIA_REVERSE_EPOCH_VARIABLE } from "../reverseIndexVersion";
import { referenceTables } from "../referenceScan";

test("actual disabled-by-default purge closes index readiness before any raw storage delete", async () => {
  const epoch = process.env[MEDIA_REVERSE_EPOCH_VARIABLE], enabled = process.env.CONVEXPRESS_ENABLE_DEV_INTERNALS;
  process.env[MEDIA_REVERSE_EPOCH_VARIABLE] = "purge_fixture_epoch_2026";
  try {
    const ctx = commerceHarness({ media: [{ _id: "m1", storageId: "blob" }], media_reference_state: [{ _id: "index", key: "active", ...currentReferenceGeneration()!, status: "ready", ownerIndex: referenceTables.length, cursor: null, endCursor: null, pendingRanges: [], sequence: 10, pages: 30, documents: 40, startedAt: 1, updatedAt: 1 }] });
    let calls = 0;
    ctx.storage = { delete: async () => { calls++; expect(ctx.tables.media_reference_state[0].status).toBe("blocked"); expect(ctx.tables.media_reference_state[0].errorCode).toBe("MEDIA_INDEX_INVALIDATED"); throw new Error("historical missing blob"); } };
    delete process.env.CONVEXPRESS_ENABLE_DEV_INTERNALS;
    await expect((purgeAllContent as any)._handler(ctx, { confirm: "YES_PURGE_ALL_CONTENT" })).rejects.toThrow("disabled");
    expect(calls).toBe(0); expect(ctx.tables.media_reference_state[0].status).toBe("ready");
    process.env.CONVEXPRESS_ENABLE_DEV_INTERNALS = "true";
    await (purgeAllContent as any)._handler(ctx, { confirm: "YES_PURGE_ALL_CONTENT" });
    expect(calls).toBe(1); expect(ctx.tables.media_reference_state[0].ownerIndex).toBe(0); expect(ctx.tables.media_reference_state[0].sequence).toBe(11);
    await expect(requireReferenceIndexReady(ctx)).rejects.toThrow("indexing must complete");
  } finally {
    if (epoch === undefined) delete process.env[MEDIA_REVERSE_EPOCH_VARIABLE]; else process.env[MEDIA_REVERSE_EPOCH_VARIABLE] = epoch;
    if (enabled === undefined) delete process.env.CONVEXPRESS_ENABLE_DEV_INTERNALS; else process.env.CONVEXPRESS_ENABLE_DEV_INTERNALS = enabled;
  }
});
