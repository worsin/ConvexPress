import { expect, test } from "bun:test";
import { commerceHarness } from "../../commerce/__tests__/handlerHarness.test-support";
import { begin, step } from "../reverseBackfill";
import { MEDIA_REVERSE_EPOCH_VARIABLE } from "../reverseIndexVersion";

test("registered backfill splits exact cursor ranges without skipping either half and ignores inert split cursors", async () => {
  const previous = process.env[MEDIA_REVERSE_EPOCH_VARIABLE];
  process.env[MEDIA_REVERSE_EPOCH_VARIABLE] = "range_fixture_epoch_2026";
  try {
    const ctx = commerceHarness();
    const progress = await (begin as any)._handler(ctx, {});
    const state = ctx.tables.media_reference_state[0];
    const calls: unknown[] = [];
    const original = ctx.db.query;
    let page = 0;
    ctx.db.query = (table: string) => {
      const query = original(table);
      if (table === progress.owner) query.paginate = async (args: unknown) => {
        calls.push(args);
        if (page++ === 0) return { page: [], isDone: false, continueCursor: "unsafe", pageStatus: "SplitRequired", splitCursor: "middle" };
        if (page === 2) return { page: [], isDone: false, continueCursor: "middle", pageStatus: null, splitCursor: "inert" };
        return { page: [], isDone: true, continueCursor: "end", pageStatus: null, splitCursor: "inert" };
      };
      return query;
    };
    const run = () => (step as any)._handler(ctx, { generation: progress.generation, expectedSequence: state.sequence });
    await run(); expect(state.cursor).toBeNull(); expect(state.endCursor).toBe("middle"); expect(state.pendingRanges).toEqual([{ cursor: "middle", endCursor: null }]); expect(state.ownerIndex).toBe(0);
    await run(); expect(state.cursor).toBe("middle"); expect(state.endCursor).toBeNull(); expect(state.ownerIndex).toBe(0);
    await run(); expect(state.ownerIndex).toBe(1); expect(state.pendingRanges).toEqual([]);
    expect(calls).toMatchObject([{ cursor: null, endCursor: null }, { cursor: null, endCursor: "middle" }, { cursor: "middle", endCursor: null }]);
  } finally { if (previous === undefined) delete process.env[MEDIA_REVERSE_EPOCH_VARIABLE]; else process.env[MEDIA_REVERSE_EPOCH_VARIABLE] = previous; }
});
