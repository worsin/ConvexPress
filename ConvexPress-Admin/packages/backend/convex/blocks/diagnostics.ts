import { v } from "convex/values";
import { paginationOptsValidator } from "convex/server";
import { query } from "../_generated/server";
import type { Doc } from "../_generated/dataModel";
import { requireCan } from "../helpers/permissions";
import { canEditContent } from "../helpers/publicContent";
import { RequestReadLedger } from "../helpers/requestReadLedger";
import { installation } from "../syncedBlocks/model";
import { displayContext } from "../canonicalDocuments/displayContext";
import { parseAuthoredDefinitionContent } from "../canonicalDocuments/foundation/authoredDefinitions";
import type { SyncedScope } from "../canonicalDocuments/foundation/syncedContent";
import { readUsageRecords, usageDocumentValidator } from "./usage";

const diagnosisValidator = v.object({
	state: v.union(
		v.literal("valid"),
		v.literal("invalid"),
		v.literal("legacy"),
		v.literal("unsupported"),
	),
	issue: v.union(
		v.null(),
		v.object({
			code: v.union(
				v.literal("invalid_structure"),
				v.literal("unsupported_format"),
				v.literal("usage_incomplete"),
			),
			path: v.string(),
		}),
	),
	usageComplete: v.boolean(),
});
/** Read-only structural inspection. Never execute saved definitions or resolve
 * their resources. Runtime access and approval remain the authoring service's job. */
export function diagnoseDocument(doc: Doc<"posts">, scope: SyncedScope) {
	if (doc.type !== "page" && doc.type !== "post") return null;
	const canonical = doc.blocksVersion === 2;
	let state: "valid" | "invalid" | "legacy" | "unsupported" = canonical
		? "valid"
		: "legacy";
	let issue: {
		code: "invalid_structure" | "unsupported_format" | "usage_incomplete";
		path: string;
	} | null = null;
	if (
		(doc.blocksVersion !== undefined &&
			doc.blocksVersion !== 1 &&
			!canonical) ||
		(!canonical && doc.composedDefinitions !== undefined)
	) {
		state = "unsupported";
		issue = { code: "unsupported_format", path: "blocksVersion" };
	} else if (canonical) {
		try {
			parseAuthoredDefinitionContent(
				{
					title: doc.title,
					blocks: doc.blocks,
					composedDefinitions: doc.composedDefinitions,
				},
				scope,
			);
		} catch (error) {
			state = "invalid";
			const path =
				error && typeof error === "object" && "path" in error
					? error.path
					: null;
			issue = {
				code: "invalid_structure",
				path:
					typeof path === "string" &&
					/^blocks(?:\[\d+\]|\.[A-Za-z0-9_-]+)*$/.test(path) &&
					path.length <= 180
						? path
						: "blocks",
			};
		}
	}
	const names = new Set<string>();
	const pending: { value: unknown; depth: number }[] = [
		{ value: !canonical && doc.blocks === undefined ? [] : doc.blocks, depth: 0 },
	];
	let count = 0,
		usageComplete = state !== "unsupported";
	scan: while (pending.length) {
		const { value, depth } = pending.pop()!;
		if (!Array.isArray(value) || depth > 64) {
			usageComplete = false;
			break;
		}
		for (const node of value) {
			if (
				++count > 10000 ||
				!node ||
				typeof node !== "object" ||
				Array.isArray(node)
			) {
				usageComplete = false;
				break scan;
			}
			const entry = node as Record<string, unknown>;
			if (
				typeof entry.name !== "string" ||
				!entry.name ||
				entry.name.length > 160
			) {
				usageComplete = false;
				break scan;
			}
			names.add(entry.name);
			if (names.size > 256) {
				names.delete(entry.name);
				usageComplete = false;
				break scan;
			}
			const children = canonical ? entry.children : entry.innerBlocks;
			if (children !== undefined)
				pending.push({ value: children, depth: depth + 1 });
		}
	}
	if (!usageComplete && !issue) {
		state = "invalid";
		issue = { code: "usage_incomplete", path: "blocks" };
	}
	return {
		_id: doc._id,
		title: doc.title,
		slug: doc.slug,
		type: doc.type,
		status: doc.status,
		...(doc.updatedAt !== undefined ? { updatedAt: doc.updatedAt } : {}),
		blockNames: [...names].sort(),
		diagnosis: { state, issue, usageComplete },
	};
}

export const documents = query({
	args: { paginationOpts: paginationOptsValidator },
	returns: v.object({
		page: v.array(
			v.object({
				...usageDocumentValidator.fields,
				diagnosis: diagnosisValidator,
			}),
		),
		isDone: v.boolean(),
		continueCursor: v.string(),
		splitCursor: v.optional(v.union(v.string(), v.null())),
		pageStatus: v.optional(
			v.union(
				v.literal("SplitRecommended"),
				v.literal("SplitRequired"),
				v.null(),
			),
		),
	}),
	handler: async (ctx, args) => {
		await requireCan(ctx, "manage_options");
		const result = await readUsageRecords(ctx, args.paginationOpts),
			scope = await installation(ctx);
		const page = [];
		for (const doc of result.page) {
			if (
				(doc.type !== "page" && doc.type !== "post") ||
				!(await canEditContent(ctx, doc))
			)
				continue;
			const row = diagnoseDocument(doc, scope);
			if (row) page.push(row);
		}
		return { ...result, page };
	},
});

export const readiness = query({
	args: {},
	returns: v.object({
		scope: v.object({ websiteKey: v.string(), instanceKey: v.string() }),
		presentation: v.object({ packId: v.string(), revision: v.string() }),
		policy: v.object({
			enabledPlugins: v.array(v.string()),
			capabilities: v.array(v.string()),
			disabledBlocks: v.array(v.string()),
		}),
	}),
	handler: async (ctx) => {
		const budget = new RequestReadLedger();
		await requireCan(ctx, "manage_options", budget);
		return await displayContext(ctx, budget);
	},
});
