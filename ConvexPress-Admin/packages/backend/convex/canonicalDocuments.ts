import { v } from "convex/values";
import {
	paginationOptsValidator,
	type PaginationOptions,
	type RegisteredQuery,
	type RegisteredMutation,
} from "convex/server";
import { query, mutation } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { canonicalStoredTreeValidator } from "./canonicalDocuments/foundation/generated/storage";
import type {
	CanonicalDocumentRead,
	CanonicalWriteReceipt,
	CanonicalRevisionPage,
	CanonicalPageOptions,
} from "./canonicalDocuments/foundation/documentContracts";
import {
	documentReadValidator,
	receiptValidator,
	revisionPageValidator,
	pageOptionsValidator,
 migrationValidator,
} from "./canonicalDocuments/validators";
import {
	canonicalBoundary,
	getDocument,
	previewDocument,
	initializeDocument,
	saveDocument,
	restoreDocument,
	pageRevisions as revisions,
	pageOptions as pages,
	type WriteArgs,
 type MigrateArgs,
 prepareMigrationDocument,
 migrateDocument,
} from "./canonicalDocuments/service";
type ReadArgs = { postId: Id<"posts"> };
type GetArgs = ReadArgs & { refreshKey?: string; request?: BlockPageRequest };
type PageArgs = ReadArgs & { paginationOpts: PaginationOptions };
type InitializeArgs = WriteArgs & { expectedAuthoringDigest: string };
type RestoreArgs = ReadArgs & {
 expectedAuthoringDigest?: string;
	revisionId: Id<"revisions">;
	expectedRevision: number;
};
const writeArgs = {
	postId: v.id("posts"),
	expectedRevision: v.number(),
	title: v.string(),
	blocks: canonicalStoredTreeValidator,
};
export const get: RegisteredQuery<
	"public",
	GetArgs,
	Promise<CanonicalDocumentRead>
> = query({
	args: { postId: v.id("posts"), refreshKey: v.optional(v.string()), request:v.optional(v.record(v.string(),v.string())) },
	returns: documentReadValidator,
	handler: (ctx, args) => canonicalBoundary(() => getDocument(ctx, args)),
});
/** Read-only authoring preview. The normal save preparation enforces current
 * revision, permissions, schemas, resources and installed template policy. */
export const previewDraft: RegisteredQuery<"public", WriteArgs & { request?: BlockPageRequest; refreshKey?: string }, Promise<CanonicalDocumentRead>> = query({
  args: { ...writeArgs, request: v.optional(v.record(v.string(), v.string())), refreshKey: v.optional(v.string()) },
  returns: documentReadValidator,
  handler: (ctx, args) => canonicalBoundary(async () => {
    const projected = await previewDocument(ctx, args, args.request);
    // A live draft remains bound to the saved base, whether changed or not.
    // Its digest identifies content; this is never a committed write receipt.
    return { ...projected, document: { ...projected.document, revision: args.expectedRevision } };
  }),
});
export const initialize: RegisteredMutation<
	"public",
	InitializeArgs,
	Promise<CanonicalWriteReceipt>
> = mutation({
	args: { ...writeArgs, expectedAuthoringDigest: v.string() },
	returns: receiptValidator,
	handler: (ctx, args) =>
		canonicalBoundary(() => initializeDocument(ctx, args)),
});
export const save: RegisteredMutation<
	"public",
	WriteArgs,
	Promise<CanonicalWriteReceipt>
> = mutation({
	args: writeArgs,
	returns: receiptValidator,
	handler: (ctx, args) => canonicalBoundary(() => saveDocument(ctx, args)),
});
export const restore: RegisteredMutation<
	"public",
	RestoreArgs,
	Promise<CanonicalWriteReceipt>
> = mutation({
	args: {
		postId: v.id("posts"),
		revisionId: v.id("revisions"),
		expectedRevision: v.number(),
    expectedAuthoringDigest: v.optional(v.string()),
	},
	returns: receiptValidator,
	handler: (ctx, args) => canonicalBoundary(() => restoreDocument(ctx, args)),
});
export const pageRevisions: RegisteredQuery<
	"public",
	PageArgs,
	Promise<CanonicalRevisionPage>
> = query({
	args: { postId: v.id("posts"), paginationOpts: paginationOptsValidator },
	returns: revisionPageValidator,
	handler: (ctx, args) => canonicalBoundary(() => revisions(ctx, args)),
});
export const pageOptions: RegisteredQuery<
	"public",
	PageArgs,
	Promise<CanonicalPageOptions>
> = query({
	args: { postId: v.id("posts"), paginationOpts: paginationOptsValidator },
	returns: pageOptionsValidator,
	handler: (ctx, args) => canonicalBoundary(() => pages(ctx, args)),
});

import type { CanonicalMigrationDto } from "./canonicalDocuments/foundation/migrationContracts";
export const prepareMigration: RegisteredQuery<"public", ReadArgs, Promise<CanonicalMigrationDto>> = query({
  args: { postId: v.id("posts") }, returns: migrationValidator,
  handler: (ctx, args) => canonicalBoundary(() => prepareMigrationDocument(ctx, args)),
});
export const migrate: RegisteredMutation<"public", MigrateArgs, Promise<CanonicalWriteReceipt>> = mutation({
  args: { postId: v.id("posts"), expectedRevision: v.number(), expectedAuthoringDigest: v.string(), expectedCandidateDigest: v.string(), expectedPresentationRevision: v.string(), preserveInactiveSettings: v.optional(v.boolean()) }, returns: receiptValidator,
  handler: (ctx, args) => canonicalBoundary(() => migrateDocument(ctx, args)),
});

import { getPublicDocument } from "./canonicalDocuments/service";
import { publicDocumentValidator } from "./canonicalDocuments/validators";
import type { PublicCanonicalDocument } from "./canonicalDocuments/foundation/publicDocumentContracts";
import type { BlockPageRequest } from "./canonicalDocuments/foundation/postGridContracts";
export const getForRender: RegisteredQuery<"public", ReadArgs & { password?: string; refreshKey?: string; request?: BlockPageRequest; recentlyViewedIds?: string[] }, Promise<PublicCanonicalDocument>> = query({
  args: { postId: v.id("posts"), password: v.optional(v.string()), refreshKey: v.optional(v.string()), request: v.optional(v.record(v.string(), v.string())), recentlyViewedIds: v.optional(v.array(v.string())) }, returns: publicDocumentValidator,
  handler: (ctx, args) => canonicalBoundary(() => getPublicDocument(ctx, args)),
});

import { setDocumentPublication, type PublicationArgs } from "./canonicalDocuments/service";
export const setPublication: RegisteredMutation<"public", PublicationArgs, Promise<CanonicalWriteReceipt>> = mutation({
  args: { postId: v.id("posts"), expectedRevision: v.number(), status: v.union(v.literal("draft"), v.literal("publish"), v.literal("future"), v.literal("private")), scheduledAt: v.optional(v.number()) }, returns: receiptValidator,
  handler: (ctx, args) => canonicalBoundary(() => setDocumentPublication(ctx, args)),
});

import { duplicateDocument, type DuplicateArgs } from "./canonicalDocuments/service";
export const duplicate: RegisteredMutation<"public", DuplicateArgs, Promise<CanonicalWriteReceipt>> = mutation({
  args: { postId: v.id("posts"), expectedRevision: v.number() },
  returns: receiptValidator,
  handler: (ctx, args) => canonicalBoundary(() => duplicateDocument(ctx, args)),
});

import { recoverLegacyDocument, type LegacyRecoveryArgs } from "./canonicalDocuments/service";
import { recoveryReceiptValidator } from "./canonicalDocuments/validators";
import type { CanonicalRecoveryReceipt } from "./canonicalDocuments/foundation/documentContracts";
export const recoverLegacy: RegisteredMutation<"public", LegacyRecoveryArgs, Promise<CanonicalRecoveryReceipt>> = mutation({
  args: { postId: v.id("posts"), revisionId: v.id("revisions"), expectedRevision: v.number() },
  returns: recoveryReceiptValidator,
  handler: (ctx, args) => canonicalBoundary(() => recoverLegacyDocument(ctx, args)),
});

import {menuOptions as menuChoices} from './canonicalDocuments/service';
import {menuOptionsValidator} from './canonicalDocuments/validators';
import type {CanonicalMenuOptions} from './canonicalDocuments/foundation/documentContracts';
export const menuOptions: RegisteredQuery<'public',PageArgs,Promise<CanonicalMenuOptions>> = query({
  args:{postId:v.id('posts'),paginationOpts:paginationOptsValidator},returns:menuOptionsValidator,
  handler:(ctx,args)=>canonicalBoundary(()=>menuChoices(ctx,args)),
});
import {termOptions as termChoices,type TermOptionsArgs} from './canonicalDocuments/service';
import {termOptionsValidator} from './canonicalDocuments/validators';
import type {CanonicalTermOptions} from './canonicalDocuments/foundation/documentContracts';
export const termOptions:RegisteredQuery<'public',TermOptionsArgs,Promise<CanonicalTermOptions>> = query({
  args:{postId:v.id('posts'),taxonomy:v.union(v.literal('category'),v.literal('tag')),paginationOpts:paginationOptsValidator},returns:termOptionsValidator,
  handler:(ctx,args)=>canonicalBoundary(()=>termChoices(ctx,args)),
});

import { authorOptions as authorChoices, type AuthorOptionsArgs } from './canonicalDocuments/service';
import { authorOptionsValidator } from './canonicalDocuments/validators';
import type { CanonicalAuthorOptions } from './canonicalDocuments/foundation/documentContracts';
export const authorOptions:RegisteredQuery<'public',AuthorOptionsArgs,Promise<CanonicalAuthorOptions>> = query({
  args:{postId:v.id('posts'),paginationOpts:paginationOptsValidator},returns:authorOptionsValidator,
  handler:(ctx,args)=>canonicalBoundary(()=>authorChoices(ctx,args)),
});
import {eventCategoryOptions as eventCategoryChoices} from './canonicalDocuments/service';
import {eventCategoryOptionsValidator} from './canonicalDocuments/validators';
import type {CanonicalEventCategoryOptions} from './canonicalDocuments/foundation/documentContracts';
export const eventCategoryOptions:RegisteredQuery<'public',PageArgs,Promise<CanonicalEventCategoryOptions>>=query({
 args:{postId:v.id('posts'),paginationOpts:paginationOptsValidator},returns:eventCategoryOptionsValidator,
 handler:(ctx,args)=>canonicalBoundary(()=>eventCategoryChoices(ctx,args)),
});

import { formOptions as formChoices } from './canonicalDocuments/service';
import { formOptionsValidator } from './canonicalDocuments/validators';
import type { CanonicalFormOptions } from './canonicalDocuments/foundation/documentContracts';
export const formOptions: RegisteredQuery<'public', PageArgs, Promise<CanonicalFormOptions>> = query({
  args: { postId: v.id('posts'), paginationOpts: paginationOptsValidator }, returns: formOptionsValidator,
  handler: (ctx, args) => canonicalBoundary(() => formChoices(ctx, args)),
});

import { productOptions as productChoices } from "./canonicalDocuments/service";
import { productOptionsValidator } from "./canonicalDocuments/validators";
import type { CanonicalProductOptions } from "./canonicalDocuments/foundation/documentContracts";
export const productOptions: RegisteredQuery<"public", PageArgs, Promise<CanonicalProductOptions>> = query({
  args: { postId: v.id("posts"), paginationOpts: paginationOptsValidator }, returns: productOptionsValidator,
  handler: (ctx, args) => canonicalBoundary(() => productChoices(ctx, args)),
});

import { productTermOptions as productTermChoices, type ProductTermOptionsArgs } from "./canonicalDocuments/service";
import { productTermOptionsValidator } from "./canonicalDocuments/validators";
import type { CanonicalProductTermOptions } from "./canonicalDocuments/foundation/documentContracts";
export const productTermOptions: RegisteredQuery<"public", ProductTermOptionsArgs, Promise<CanonicalProductTermOptions>> = query({
  args: { postId: v.id("posts"), taxonomy: v.union(v.literal("productCategory"), v.literal("productTag")), paginationOpts: paginationOptsValidator },
  returns: productTermOptionsValidator,
  handler: (ctx, args) => canonicalBoundary(() => productTermChoices(ctx, args)),
});

import { getDocumentSettings, setDocumentSettings } from "./canonicalDocuments/service";
import type { CanonicalDocumentSettings, CanonicalSettingsWrite } from "./canonicalDocuments/foundation/documentContracts";
const layoutFields = {
  pageTemplate: v.union(v.literal("default"),v.literal("full-width"),v.literal("sidebar-left"),v.literal("sidebar-right"),v.literal("no-sidebar"),v.literal("landing"),v.literal("blank")),
  hideHeader: v.boolean(), hideFooter: v.boolean(),
};
const documentVisibility = v.union(v.literal("public"), v.literal("private"), v.literal("password"));
export const getSettings: RegisteredQuery<"public",ReadArgs,Promise<CanonicalDocumentSettings>> = query({
  args:{postId:v.id("posts")},
  returns:v.object({postId:v.string(),type:v.union(v.literal("page"),v.literal("post")),revision:v.number(),settingsDigest:v.string(),slug:v.string(),path:v.string(),visibility:documentVisibility,hasPassword:v.boolean(),...layoutFields}),
  handler:(ctx,args)=>canonicalBoundary(()=>getDocumentSettings(ctx,args)),
});
export const setSettings: RegisteredMutation<"public",ReadArgs & CanonicalSettingsWrite,Promise<CanonicalWriteReceipt>> = mutation({
  args:{postId:v.id("posts"),expectedRevision:v.number(),expectedSettingsDigest:v.string(),slug:v.string(),visibility:v.optional(documentVisibility),password:v.optional(v.string()),...layoutFields},
  returns:receiptValidator,
  handler:(ctx,args)=>canonicalBoundary(()=>setDocumentSettings(ctx,args)),
});

import {recipeOptions as recipeChoices} from "./canonicalDocuments/service";
import {recipeOptionsValidator} from "./canonicalDocuments/validators";
import type {CanonicalRecipeOptions} from "./canonicalDocuments/foundation/documentContracts";
export const recipeOptions:RegisteredQuery<"public",PageArgs,Promise<CanonicalRecipeOptions>>=query({
 args:{postId:v.id("posts"),paginationOpts:paginationOptsValidator},returns:recipeOptionsValidator,
 handler:(ctx,args)=>canonicalBoundary(()=>recipeChoices(ctx,args)),
});

import {albumOptions as albumChoices} from "./canonicalDocuments/service";
import {albumOptionsValidator} from "./canonicalDocuments/validators";
import type {CanonicalAlbumOptions} from "./canonicalDocuments/foundation/documentContracts";
export const albumOptions:RegisteredQuery<"public",PageArgs,Promise<CanonicalAlbumOptions>>=query({
 args:{postId:v.id("posts"),paginationOpts:paginationOptsValidator},returns:albumOptionsValidator,
 handler:(ctx,args)=>canonicalBoundary(()=>albumChoices(ctx,args)),
});

import {membershipPlanOptions as membershipPlanChoices} from "./canonicalDocuments/service";
import {membershipPlanOptionsValidator} from "./canonicalDocuments/validators";
import type {CanonicalMembershipPlanOptions} from "./canonicalDocuments/foundation/documentContracts";
export const membershipPlanOptions:RegisteredQuery<"public",PageArgs,Promise<CanonicalMembershipPlanOptions>>=query({
 args:{postId:v.id("posts"),paginationOpts:paginationOptsValidator},returns:membershipPlanOptionsValidator,
 handler:(ctx,args)=>canonicalBoundary(()=>membershipPlanChoices(ctx,args)),
});


import {instructorOptions as instructorChoices} from "./canonicalDocuments/service";
export const instructorOptions:RegisteredQuery<'public',AuthorOptionsArgs,Promise<CanonicalAuthorOptions>>=query({
 args:{postId:v.id('posts'),paginationOpts:paginationOptsValidator},returns:authorOptionsValidator,
 handler:(ctx,args)=>canonicalBoundary(()=>instructorChoices(ctx,args)),
});

import {courseOptions as courseChoices} from "./canonicalDocuments/service";
import {courseOptionsValidator} from "./canonicalDocuments/validators";
import type {CanonicalCourseOptions} from "./canonicalDocuments/foundation/documentContracts";
export const courseOptions:RegisteredQuery<"public",PageArgs,Promise<CanonicalCourseOptions>>=query({
 args:{postId:v.id("posts"),paginationOpts:paginationOptsValidator},returns:courseOptionsValidator,
 handler:(ctx,args)=>canonicalBoundary(()=>courseChoices(ctx,args)),
});

import {kbCategoryOptions as kbCategoryChoices} from "./canonicalDocuments/service";
import {kbCategoryOptionsValidator} from "./canonicalDocuments/validators";
import type {CanonicalKbCategoryOptions} from "./canonicalDocuments/foundation/documentContracts";
export const kbCategoryOptions:RegisteredQuery<"public",PageArgs,Promise<CanonicalKbCategoryOptions>>=query({
 args:{postId:v.id("posts"),paginationOpts:paginationOptsValidator},returns:kbCategoryOptionsValidator,
 handler:(ctx,args)=>canonicalBoundary(()=>kbCategoryChoices(ctx,args)),
});

import {eventOptions as eventChoices} from "./canonicalDocuments/service";
import {eventOptionsValidator} from "./canonicalDocuments/validators";
import type {CanonicalEventOptions} from "./canonicalDocuments/foundation/documentContracts";
export const eventOptions:RegisteredQuery<"public",PageArgs,Promise<CanonicalEventOptions>>=query({
 args:{postId:v.id("posts"),paginationOpts:paginationOptsValidator},returns:eventOptionsValidator,
 handler:(ctx,args)=>canonicalBoundary(()=>eventChoices(ctx,args)),
});

import { bundleOptions as bundleChoices } from "./canonicalDocuments/service";
export const bundleOptions: RegisteredQuery<"public", PageArgs, Promise<CanonicalProductOptions>> = query({
  args: { postId: v.id("posts"), paginationOpts: paginationOptsValidator }, returns: productOptionsValidator,
  handler: (ctx, args) => canonicalBoundary(() => bundleChoices(ctx, args)),
});

import {mailingListOptions as mailingListChoices} from "./canonicalDocuments/service";
import {mailingListOptionsValidator} from "./canonicalDocuments/validators";
import type {CanonicalMailingListOptions} from "./canonicalDocuments/foundation/documentContracts";
export const mailingListOptions:RegisteredQuery<"public",PageArgs,Promise<CanonicalMailingListOptions>>=query({
 args:{postId:v.id("posts"),paginationOpts:paginationOptsValidator},returns:mailingListOptionsValidator,
 handler:(ctx,args)=>canonicalBoundary(()=>mailingListChoices(ctx,args)),
});
