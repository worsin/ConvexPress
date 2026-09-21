import { expect, test } from "bun:test";
import { commerceHarness } from "../../commerce/__tests__/handlerHarness.test-support";
import { documents, diagnoseDocument } from "../diagnostics";
import { encodeComposedDefinition } from "../../canonicalDocuments/foundation/composedDefinitions";
const scope = {
	websiteKey: "diagnostics",
	instanceKey: "staging",
	deploymentOrigin: "https://diagnostics.convex.cloud",
};
const node = { id: "heading", name: "core/heading", version: 1, attrs: {} };
const doc = (id: string, extra: Record<string, unknown> = {}) => ({
	_id: id,
	authorId: "admin",
	title: id,
	slug: id,
	type: "page",
	status: "draft",
	blocksVersion: 2,
	blocks: [node],
	...extra,
});
function fixture(posts: any[]) {
	const ctx = commerceHarness({
		posts,
		convexpress_siteIdentity: [
			{ _id: "site", identityKey: "site-identity", ...scope },
		],
		roles: [
			{
				_id: "role",
				slug: "administrator",
				type: "internal",
				status: "active",
				level: 100,
				capabilities: ["manage_options", "page.update", "post.update"],
			},
		],
	});
	const original = ctx.db.query,
		scans: any[] = [];
	ctx.db.query = (table: string) => {
		const builder = original(table);
		if (table === "posts") {
			builder.collect = () => {
				throw Error("Unbounded scan");
			};
			const paginate = builder.paginate;
			builder.paginate = (args: any) => {
				scans.push(args);
				return paginate(args);
			};
		}
		return builder;
	};
	for (const operation of ["insert", "patch", "delete"])
		ctx.db[operation] = () => {
			throw Error("Diagnostics must not write");
		};
	return { ctx, scans };
}
const run = (ctx: any, cursor: string | null = null, numItems = 25) =>
	(documents as any)._handler(ctx, {
		paginationOpts: {
			cursor,
			numItems,
			maximumRowsRead: 99999,
			maximumBytesRead: 99999999,
		},
	});

test("missing or null canonical trees cannot be reported as complete zero usage", () => {
	for (const blocks of [undefined, null, "malformed"]) {
		const result = diagnoseDocument(doc("broken", { blocks }) as any, scope)!;
		expect(result.diagnosis.state).toBe("invalid");
		expect(result.diagnosis.usageComplete).toBe(false);
	}
	expect(diagnoseDocument(doc("empty", { blocks: [] }) as any, scope)!.diagnosis).toEqual({ state: "valid", issue: null, usageComplete: true });
});
test("diagnostics continue across malformed documents with closed projections and bounded pagination", async () => {
	const rows = Array.from({ length: 28 }, (_, i) => doc(`page-${i}`));
	rows[5] = doc("invalid", {
		blocks: [
			{ ...node, attrs: { level: 99, private: "Never project this prose" } },
		],
	});
	rows[7] = doc("corrupt", {
		blocks: [{ ...node, children: "Never project malformed content" }],
	});
	rows[9] = doc("future", { blocksVersion: 3 });
	rows[11] = doc("legacy", { blocksVersion: 1 });
	const { ctx, scans } = fixture(rows),
		snapshot = JSON.stringify(ctx.tables.posts);
	const first = await run(ctx),
		second = await run(ctx, first.continueCursor),
		all = [...first.page, ...second.page];
	expect(first.isDone).toBe(false);
	expect(second.isDone).toBe(true);
	expect(all).toHaveLength(28);
	expect(all.find((x) => x._id === "invalid").diagnosis).toMatchObject({
		state: "invalid",
		usageComplete: true,
	});
	expect(all.find((x) => x._id === "corrupt").diagnosis).toMatchObject({
		state: "invalid",
		usageComplete: false,
	});
	expect(all.find((x) => x._id === "future").diagnosis.state).toBe(
		"unsupported",
	);
	expect(all.find((x) => x._id === "legacy").diagnosis.state).toBe("legacy");
	expect(JSON.stringify(all)).not.toContain("Never project");
	expect(JSON.stringify(all)).not.toContain('"attrs"');
	expect(
		scans.every(
			(x) => x.maximumRowsRead === 25 && x.maximumBytesRead === 2 * 1024 * 1024,
		),
	).toBe(true);
	expect(JSON.stringify(ctx.tables.posts)).toBe(snapshot);
});
test("structural validation recognizes exact custom definitions and rejects foreign snapshots", () => {
	const encoded = encodeComposedDefinition({
		spec: {
			name: "composed/welcome",
			title: "Welcome",
			description: "A welcome",
			category: "text",
			role: "content",
			version: 1,
			keywords: [],
			ai: { useFor: "Introduction", avoid: "Navigation" },
			fields: [
				{
					id: "title",
					type: "text",
					default: "Private definition text",
					max: 80,
				},
			],
			supports: {
				children: false,
				styles: false,
				layout: [],
				anchor: true,
				visibility: false,
			},
			data: null,
			preview: "{title}",
			examples: [{}],
		},
		composition: { version: 1, root: { el: "Heading", bind: "attrs.title" } },
	});
	const value = doc("custom", {
		blocks: [{ ...node, name: "composed/welcome" }],
		composedDefinitions: {
			scope,
			definitions: [
				{
					name: "composed/welcome",
					version: 1,
					digest: encoded.digest,
					definitionJson: encoded.json,
				},
			],
		},
	});
	const valid = diagnoseDocument(value as any, scope)!;
	expect(valid.diagnosis.state).toBe("valid");
	expect(valid.blockNames).toEqual(["composed/welcome"]);
	expect(JSON.stringify(valid)).not.toContain("Private definition");
	expect(
		diagnoseDocument(value as any, { ...scope, instanceKey: "production" })!
			.diagnosis.state,
	).toBe("invalid");
	(value as any).composedDefinitions.definitions[0].digest = "0".repeat(64);
	expect(diagnoseDocument(value as any, scope)!.diagnosis.state).toBe(
		"invalid",
	);
});
test("unauthorized callers cannot scan; managers without editorial access receive no document metadata", async () => {
	for (const mode of ["anonymous", "suspended", "no-capability"]) {
		const { ctx, scans } = fixture([doc("secret")]);
		if (mode === "anonymous") ctx.auth.getUserIdentity = async () => null;
		if (mode === "suspended") ctx.tables.users[0].status = "suspended";
		if (mode === "no-capability")
			ctx.tables.roles[0].capabilities = ["page.update"];
		await expect(run(ctx)).rejects.toBeDefined();
		expect(scans).toHaveLength(0);
	}
	const { ctx } = fixture([doc("secret")]);
	ctx.tables.roles[0].capabilities = ["manage_options"];
	expect((await run(ctx)).page).toEqual([]);
	ctx.tables.roles[0].capabilities.push("page.update");
	ctx.tables.roles[0].level = 10;
	ctx.tables.posts[0].authorId = "another-author";
	expect((await run(ctx)).page).toEqual([]);
});
test("empty attachment pages retain continuation and invalid sizes never scan", async () => {
	const { ctx, scans } = fixture([
		doc("page"),
		doc("file", { type: "attachment" }),
	]);
	const first = await run(ctx, null, 1);
	expect(first.page).toEqual([]);
	expect(first.isDone).toBe(false);
	const next = await run(ctx, first.continueCursor, 1);
	expect(next.page).toHaveLength(1);
	scans.length = 0;
	for (const size of [0, 26, 1.5])
		await expect(run(ctx, null, size)).rejects.toBeDefined();
	expect(scans).toHaveLength(0);
});
