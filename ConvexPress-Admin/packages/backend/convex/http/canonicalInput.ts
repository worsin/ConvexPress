import { ConvexError } from "convex/values";
import type { Id } from "../_generated/dataModel";
import type { ApiDocumentInput } from "../canonicalDocuments/service";
import {
	errorResponse,
	getHttpErrorCode,
	getHttpErrorMessage,
} from "./helpers";

export function canonicalHttpInput(
	body: Record<string, unknown>,
	keyId: string,
	page = false,
): ApiDocumentInput {
	const result: ApiDocumentInput = { keyId: keyId as Id<"apiKeys"> };
	const strings = {
		title: "title",
		content: "content",
		excerpt: "excerpt",
		status: "status",
		slug: "slug",
		...(page
			? {
					page_template: "pageTemplate",
					visibility: "visibility",
					password: "password",
					comment_status: "commentStatus",
				}
			: {}),
	};
	for (const [external, internal] of Object.entries(strings))
		if (body[external] !== undefined) {
			if (typeof body[external] !== "string")
				throw new ConvexError({
					code: "INVALID_REQUEST",
					message: `${external} must be a string.`,
				});
			Object.assign(result, { [internal]: body[external] });
		}
 for(const [field,allowed] of Object.entries({status:["draft","publish","future","private"],...(page?{visibility:["public","private","password"],comment_status:["open","closed"]}:{})})) {
  if(body[field]!==undefined && !allowed.includes(body[field] as string)) throw new ConvexError({code:"INVALID_REQUEST",message:`${field} is unsupported.`});
 }
	if (body.blocks !== undefined) result.blocks = body.blocks;
	for (const [external, internal] of Object.entries({
		scheduled_at: "scheduledAt",
		...(page ? { menu_order: "menuOrder" } : {}),
	}))
		if (body[external] !== undefined) {
			if (
				typeof body[external] !== "number" ||
				!Number.isSafeInteger(body[external])
			)
				throw new ConvexError({
					code: "INVALID_REQUEST",
					message: `${external} must be an integer.`,
				});
			Object.assign(result, { [internal]: body[external] });
		}
	if (page && body.parent_id !== undefined) {
		if (body.parent_id !== null && typeof body.parent_id !== "string")
			throw new ConvexError({
				code: "INVALID_REQUEST",
				message: "parent_id must be a page ID or null.",
			});
		result.parentId = body.parent_id as Id<"posts"> | null;
	}
	return result;
}
export function canonicalHttpRevision(body: Record<string, unknown>): number {
	const value = body.expected_revision;
	if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 1)
		throw new ConvexError({
			code: "REVISION_REQUIRED",
			message:
				"Read the document and supply its blocks_revision as expected_revision.",
		});
	return value;
}
export function canonicalHttpError(error: unknown, fallback: string) {
	const code = getHttpErrorCode(error, "SERVER_ERROR");
	const status =
		code === "FORBIDDEN"
			? 403
			: code === "NOT_FOUND"
				? 404
				: code === "CONFLICT"
					? 409
					: code === "REVISION_REQUIRED"
						? 428
						: code === "SERVER_ERROR"
							? 500
							: 400;
	return errorResponse(getHttpErrorMessage(error, fallback), code, status);
}
