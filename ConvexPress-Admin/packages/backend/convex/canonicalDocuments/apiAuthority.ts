/** HTTP actions authenticate the bearer token; these internal boundaries recheck
 * its current database authority atomically with content access. No native
 * session or management identity is fabricated for an API-key request. */
import { ConvexError } from "convex/values";
import type { QueryCtx } from "../_generated/server";
import type { Doc, Id } from "../_generated/dataModel";
import { credentialBelongsToEnvironment } from "../auth/environmentBinding";
import { resolveUserRole, userCan } from "../helpers/permissions";
import type { Capability } from "../types/capabilities";

export async function apiContentActor(
	ctx: QueryCtx,
	keyId: Id<"apiKeys">,
	scope: "read:posts" | "write:posts",
) {
	const key = await ctx.db.get("apiKeys", keyId);
	if (
		!key ||
		key.status !== "active" ||
		!credentialBelongsToEnvironment(key.environmentBinding) ||
		(key.expiresAt !== undefined && key.expiresAt <= Date.now()) ||
		!key.scopes.includes(scope)
	)
		throw new ConvexError({
			code: "FORBIDDEN",
			message: "The API key no longer authorizes this operation.",
		});
	const id = ctx.db.normalizeId("users", key.userId),
		user = id ? await ctx.db.get("users", id) : null;
	if (!user || user.status !== "active" || user.authSource === "management")
		throw new ConvexError({
			code: "FORBIDDEN",
			message: "The API key owner is not an active site user.",
		});
	return user;
}
export async function requireApiCapability(
	ctx: QueryCtx,
	user: Doc<"users">,
	capability: Capability,
) {
	if (!(await userCan(ctx, user._id, capability)))
		throw new ConvexError({
			code: "FORBIDDEN",
			message: "The API key owner lacks the required content capability.",
		});
}
export async function apiCanEdit(
	ctx: QueryCtx,
	user: Doc<"users">,
	post: Doc<"posts">,
) {
	return (
		(await userCan(
			ctx,
			user._id,
			post.type === "page" ? "page.update" : "post.update",
		)) &&
		(post.authorId === user._id ||
			((await resolveUserRole(ctx, user))?.level ?? 0) >= 80)
	);
}
