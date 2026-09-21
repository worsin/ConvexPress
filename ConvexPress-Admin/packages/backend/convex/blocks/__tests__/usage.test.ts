import { expect, test } from "bun:test";
import { commerceHarness } from "../../commerce/__tests__/handlerHarness.test-support";
import * as queries from "../queries";
const run = (name: string, ctx: any, args: any = {}) =>
	(queries as any)[name]._handler(ctx, args);
const block = (id: string, name = "core/paragraph", innerBlocks?: any[]) => ({
	id,
	name,
	version: 1,
	attrs: { body: "Private prose must not be projected" },
	...(innerBlocks ? { innerBlocks } : {}),
});
function fixture(count = 63) {
	const ctx = commerceHarness({
		posts: Array.from({ length: count }, (_, i) => ({
			_id: `doc-${i}`,
			type: i % 2 ? "page" : "post",
			title: `Document ${i}`,
			slug: `doc-${i}`,
			status: i % 3 ? "draft" : "publish",
			updatedAt: i,
			blocks: [block("a"), block("b", "core/group", [block("c"), block("d")])],
		})),
	});
	const query = ctx.db.query;
	const pages: any[] = [];
	ctx.db.query = (table: string) => {
		const result = query(table);
		if (table === "posts") {
			result.collect = () => {
				throw Error("Unbounded post read forbidden");
			};
			const paginate = result.paginate;
			result.paginate = (args: any) => {
				pages.push(args);
				return paginate(args);
			};
		}
		return result;
	};
	return { ctx, pages };
}
test("actual usage handler scans multiple bounded pages and projects unique nested block names per document", async () => {
	const { ctx, pages } = fixture();
	const rows: any[] = [];
	let cursor = null;
	let done = false;
	while (!done) {
		const result = await run("usageDocuments", ctx, {
			paginationOpts: {
				cursor,
				numItems: 20,
				maximumRowsRead: 999999,
				maximumBytesRead: 99999999,
			},
		});
		rows.push(...result.page);
		cursor = result.continueCursor;
		done = result.isDone;
	}
	expect(pages).toHaveLength(4);
	expect(rows).toHaveLength(63);
	expect(new Set(rows.map((row) => row._id)).size).toBe(63);
	expect(
		rows.every(
			(row) => row.blockNames.join(",") === "core/group,core/paragraph",
		),
	).toBe(true);
	expect(JSON.stringify(rows)).not.toContain("Private prose");
	expect(
		pages.every(
			(page) =>
				page.maximumRowsRead === 25 &&
				page.maximumBytesRead === 2 * 1024 * 1024,
		),
	).toBe(true);
});
test("usage page sizes and RBAC reject before a post scan, legacy exports refuse partial totals", async () => {
	for (const numItems of [0, -1, 26, 1.5, NaN, Infinity]) {
		const { ctx, pages } = fixture();
		await expect(
			run("usageDocuments", ctx, {
				paginationOpts: { cursor: null, numItems },
			}),
		).rejects.toBeDefined();
		expect(pages).toHaveLength(0);
	}
	for (const invalid of ["anonymous", "inactive", "capability"]) {
		const { ctx, pages } = fixture();
		if (invalid === "anonymous") ctx.auth.getUserIdentity = async () => null;
		if (invalid === "inactive") ctx.tables.users[0].status = "suspended";
		if (invalid === "capability") ctx.tables.roles[0].capabilities = [];
		await expect(
			run("usageDocuments", ctx, {
				paginationOpts: { cursor: null, numItems: 10 },
			}),
		).rejects.toBeDefined();
		expect(pages).toHaveLength(0);
	}
	for (const name of ["usageSummary", "usageByBlockName"])
		await expect(
			run(
				name,
				fixture().ctx,
				name === "usageSummary" ? {} : { name: "core/paragraph" },
			),
		).rejects.toMatchObject({ data: { code: "PAGINATION_REQUIRED" } });
});
test("legacy complete results count documents instead of occurrences and do not include non-content records", async () => {
	const { ctx } = fixture(2);
	ctx.tables.posts.push({
		_id: "attachment",
		type: "attachment",
		blocks: [block("attachment")],
	});
	expect(await run("usageSummary", ctx)).toEqual([
		{ name: "core/group", count: 2 },
		{ name: "core/paragraph", count: 2 },
	]);
	const detail = await run("usageByBlockName", ctx, {
		name: "core/paragraph",
		limit: 1,
	});
	expect(detail.count).toBe(2);
	expect(detail.publishedCount).toBe(1);
	expect(detail.recent).toHaveLength(1);
	for (const limit of [0, -1, 51, 1.5])
		await expect(
			run("usageByBlockName", ctx, { name: "core/paragraph", limit }),
		).rejects.toBeDefined();
});

test("empty projected pages keep continuation and split metadata, corrupt trees do not produce false totals", async () => {
	const { ctx } = fixture(1);
	ctx.tables.posts.push(
		...Array.from({ length: 3 }, (_, i) => ({
			_id: `attachment-${i}`,
			type: "attachment",
		})),
	);
	const query = ctx.db.query;
	ctx.db.query = (table: string) => {
		const result = query(table);
		if (table === "posts") {
			const paginate = result.paginate;
			result.paginate = async (args: any) => ({
				...(await paginate(args)),
				splitCursor: "test-split",
				pageStatus: "SplitRecommended",
			});
		}
		return result;
	};
	const first = await run("usageDocuments", ctx, {
		paginationOpts: { cursor: null, numItems: 3 },
	});
	expect(first.page).toHaveLength(0);
	expect(first.isDone).toBe(false);
	expect(first.splitCursor).toBe("test-split");
	expect(first.pageStatus).toBe("SplitRecommended");
	const last = await run("usageDocuments", ctx, {
		paginationOpts: { cursor: first.continueCursor, numItems: 3 },
	});
	expect(last.page).toHaveLength(1);
	expect(last.isDone).toBe(true);
	ctx.tables.posts[0].blocks = [
		{ name: "core/paragraph", innerBlocks: "corrupt" },
	];
	await expect(
		run("usageDocuments", ctx, {
			paginationOpts: { cursor: first.continueCursor, numItems: 3 },
		}),
	).rejects.toMatchObject({ data: { code: "INVALID_BLOCK_USAGE" } });
});
