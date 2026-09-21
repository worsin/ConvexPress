import { expect, test } from "bun:test";
import { commerceHarness } from "../../commerce/__tests__/handlerHarness.test-support";
import * as queries from "../queries";

function fixture(count = 205) {
  const ctx = commerceHarness({
    roles: [{ _id: "role", type: "internal", status: "active", capabilities: ["media.read"] }],
    media: Array.from({ length: count }, (_, i) => ({ _id: `m${i}`, _creationTime: i, title: "Shared title", fileName: `${i}.jpg`, slug: `image-${i}`, uploadedBy: "admin", status: i < 100 ? "trashed" : "active", mediaType: "image", mimeType: "image/jpeg", createdAt: i, updatedAt: i, fileSize: 10, url: "https://example.invalid/a" })),
  });
  ctx.storage = { getUrl: async () => "https://example.invalid/fresh" };
  const pages: any[] = [];
  const base = ctx.db.query;
  ctx.db.query = (table: string) => {
    const q = base(table);
    if (table === "media") {
      q.collect = async () => { throw new Error("Unbounded media collect forbidden"); };
      const paginate = q.paginate;
      q.paginate = async (opts: any) => { pages.push(opts); const result = await paginate({ ...opts, cursor: opts.cursor?.replace("fixture-cursor:", "") ?? null }); return { ...result, continueCursor: `fixture-cursor:${result.continueCursor}` }; };
      // Only the DB search builder is adapted. Production handler/filter logic runs.
      q.withSearchIndex = (_name: string, callback: any) => {
        const search: any = { search: () => search, eq: () => search };
        callback(search);
        return q;
      };
    }
    return q;
  };
  return { ctx, pages };
}

async function errorCode(fn: () => Promise<unknown>) {
  try { await fn(); return null; } catch (error: any) { return error.data?.code ?? error.message; }
}

for (const search of [undefined, "Shared"]) {
  test(`list traverses an empty filtered page without collecting (${search ?? "indexed"})`, async () => {
    const { ctx, pages } = fixture();
    const first = await (queries.list as any)._handler(ctx, { search, orderDir: "asc", paginationOpts: { numItems: 100, cursor: null, maximumRowsRead: 99999, maximumBytesRead: 99999 } });
    expect(first.page).toEqual([]);
    expect(first.isDone).toBe(false);
    const second = await (queries.list as any)._handler(ctx, { search, orderDir: "asc", paginationOpts: { numItems: 100, cursor: first.continueCursor } });
    expect(second.page.length).toBe(100);
    expect(second.page.every((row: any) => row.status === "active")).toBe(true);
    expect(pages.every((page) => page.maximumRowsRead === 256 && page.maximumBytesRead === 512 * 1024)).toBe(true);
  });
}

test("every supplied filter applies together in search and indexed listing", async () => {
  for (const search of [undefined, "Shared"]) {
    const { ctx } = fixture(4);
    ctx.tables.media.forEach((row: any) => { row.status = "active"; });
    ctx.tables.media[1].attachedTo = "post1";
    ctx.tables.media[2].mimeType = "application/pdf";
    ctx.tables.media[3].status = "failed";
    const result = await (queries.list as any)._handler(ctx, { search, mediaType: "image", uploadedBy: "admin", status: "active", mimeType: "image/jpeg", unattached: true, dateFrom: 0, dateTo: 3, paginationOpts: { numItems: 10, cursor: null } });
    expect(result.page.map((row: any) => row._id)).toEqual(["m0"]);
  }
});

test("countDocuments pages compact evidence; legacy counts refuses incomplete totals", async () => {
  const { ctx, pages } = fixture();
  const seen: any[] = [];
  let cursor = null;
  while (true) {
    const result = await (queries as any).countDocuments._handler(ctx, { paginationOpts: { numItems: 100, cursor } });
    seen.push(...result.page);
    cursor = result.continueCursor;
    if (result.isDone) break;
  }
  expect(seen.length).toBe(205);
  expect(new Set(seen.map((row) => row._id)).size).toBe(205);
  expect(Object.keys(seen[0]).sort()).toEqual(["_id", "mediaType", "mine", "trashed", "unattached"]);
  expect(seen.filter((row) => !row.trashed).length).toBe(105);
  expect(pages.length).toBe(3);
  expect(await errorCode(() => (queries.counts as any)._handler(ctx, {}))).toBe("PAGINATION_REQUIRED");
  const small = fixture(2);
  expect(await (queries.counts as any)._handler(small.ctx, {})).toEqual({ all: 0, images: 0, video: 0, audio: 0, documents: 0, mine: 0, unattached: 0, trashed: 2 });
});

test("invalid sizes/search/batches refuse before media reads; batch order and nulls survive", async () => {
  const { ctx, pages } = fixture(2);
  for (const numItems of [0, -1, 1.5, 101]) {
    expect(await errorCode(() => (queries.list as any)._handler(ctx, { paginationOpts: { numItems, cursor: null } }))).toBe("VALIDATION_ERROR");
    expect(await errorCode(() => (queries as any).countDocuments._handler(ctx, { paginationOpts: { numItems, cursor: null } }))).toBe("VALIDATION_ERROR");
  }
  expect(await errorCode(() => (queries.list as any)._handler(ctx, { search: "x".repeat(257), paginationOpts: { numItems: 10, cursor: null } }))).toBe("VALIDATION_ERROR");
  expect(pages.length).toBe(0);
  expect(await errorCode(() => (queries.getByIds as any)._handler(ctx, { mediaIds: Array(101).fill("m0") }))).toBe("VALIDATION_ERROR");
  expect((await (queries.getByIds as any)._handler(ctx, { mediaIds: ["m1", "missing", "m1"] })).map((row: any) => row?._id ?? null)).toEqual(["m1", null, "m1"]);
});

test("oversized raw page refuses before uploader/storage enrichment; required splits remain incomplete", async () => {
  const { ctx } = fixture(1);
  ctx.tables.media[0].description = "x".repeat(512 * 1024);
  let storageReads = 0;
  ctx.storage.getUrl = async () => { storageReads++; return null; };
  expect(await errorCode(() => (queries.list as any)._handler(ctx, { search: "Shared", paginationOpts: { numItems: 1, cursor: null } }))).toBe("MEDIA_PAGE_BUDGET");
  expect(storageReads).toBe(0);
  expect(await errorCode(() => (queries as any).countDocuments._handler(ctx, { paginationOpts: { numItems: 1, cursor: null } }))).toBe("MEDIA_PAGE_BUDGET");
  ctx.tables.media[0].description = "small";
  const base = ctx.db.query;
  ctx.db.query = (table: string) => {
    const q = base(table);
    if (table === "media") q.paginate = async () => ({ page: ctx.tables.media, isDone: false, continueCursor: "end", splitCursor: "middle", pageStatus: "SplitRequired" });
    return q;
  };
  const split = await (queries.list as any)._handler(ctx, { paginationOpts: { numItems: 1, cursor: null, endCursor: "end" } });
  expect(split).toEqual({ page: [], isDone: false, continueCursor: "end", splitCursor: "middle", pageStatus: "SplitRequired" });
  expect(storageReads).toBe(0);
  expect(await errorCode(() => (queries.counts as any)._handler(ctx, {}))).toBe("PAGINATION_REQUIRED");
});


test("non-progress split cursors refuse rather than repeatedly requesting the same range", async () => {
  for (const pageStatus of ["SplitRequired", "SplitRecommended"]) for (const splitCursor of ["start", "end", "continue", null]) {
    const { ctx } = fixture(1);
    const base = ctx.db.query;
    ctx.db.query = (table: string) => {
      const q = base(table);
      if (table === "media") q.paginate = async () => ({ page: [], isDone: false, continueCursor: "continue", splitCursor, pageStatus });
      return q;
    };
    expect(await errorCode(() => (queries.list as any)._handler(ctx, { paginationOpts: { numItems: 1, cursor: "start", endCursor: "end" } }))).toBe("MEDIA_PAGE_BUDGET");
    expect(await errorCode(() => (queries as any).countDocuments._handler(ctx, { paginationOpts: { numItems: 1, cursor: "start", endCursor: "end" } }))).toBe("MEDIA_PAGE_BUDGET");
  }
});
