import { v } from "convex/values";
import {
	postStatusValidator,
	postVisibilityValidator,
	commentStatusValidator,
} from "../schema/posts";
/** Blocks are validated by the version-aware canonical service, not a second
 * handwritten block schema. HTTP callers cannot supply definition registries. */
export const apiDocumentInput = {
	keyId: v.id("apiKeys"),
	title: v.optional(v.string()),
	content: v.optional(v.string()),
	blocks: v.optional(v.any()),
	excerpt: v.optional(v.string()),
	status: v.optional(postStatusValidator),
	scheduledAt: v.optional(v.number()),
	slug: v.optional(v.string()),
};
export const apiPageInput = {
	parentId: v.optional(v.union(v.id("posts"), v.null())),
	menuOrder: v.optional(v.number()),
	pageTemplate: v.optional(v.string()),
	visibility: v.optional(postVisibilityValidator),
	password: v.optional(v.string()),
	commentStatus: v.optional(commentStatusValidator),
};

const relatedPage = { _id:v.id("posts"), title:v.string(), slug:v.string(), path:v.optional(v.string()) };
export const apiDocumentRead = v.union(v.null(),v.object({
 _id:v.id("posts"),type:v.union(v.literal("post"),v.literal("page")),title:v.string(),slug:v.string(),status:postStatusValidator,
 excerpt:v.optional(v.string()),path:v.optional(v.string()),parentId:v.optional(v.id("posts")),depth:v.optional(v.number()),menuOrder:v.optional(v.number()),pageTemplate:v.optional(v.string()),
 visibility:postVisibilityValidator,commentStatus:commentStatusValidator,isPasswordProtected:v.boolean(),
 blocks:v.any(),blocksVersion:v.literal(2),blocksRevision:v.number(),createdAt:v.number(),updatedAt:v.number(),publishedAt:v.optional(v.number()),
 author:v.optional(v.union(v.null(),v.object({_id:v.id("users"),displayName:v.string(),bio:v.optional(v.string()),avatarUrl:v.optional(v.string()),slug:v.optional(v.string())}))),
 parent:v.optional(v.union(v.null(),v.object(relatedPage))),children:v.optional(v.array(v.object({...relatedPage,status:v.string(),menuOrder:v.optional(v.number())}))),
}));
