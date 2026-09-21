import { v } from "convex/values";
import { paginationOptsValidator } from "convex/server";
import { query } from "../_generated/server";
import * as choices from "../canonicalDocuments/service";
import * as validators from "../canonicalDocuments/validators";

const owner = { syncedBlockId: v.id("syncedBlocks"), expectedGeneration: v.number(), paginationOpts: paginationOptsValidator };

export const pageOptions = query({
  args: { ...owner }, returns: validators.pageOptionsValidator,
  handler: (ctx, args) => choices.canonicalBoundary(() => choices.pageOptions(ctx, args)),
});

export const menuOptions = query({
  args: { ...owner }, returns: validators.menuOptionsValidator,
  handler: (ctx, args) => choices.canonicalBoundary(() => choices.menuOptions(ctx, args)),
});

export const termOptions = query({
  args: { ...owner, taxonomy: v.union(v.literal("category"), v.literal("tag")) }, returns: validators.termOptionsValidator,
  handler: (ctx, args) => choices.canonicalBoundary(() => choices.termOptions(ctx, args)),
});

export const authorOptions = query({
  args: { ...owner }, returns: validators.authorOptionsValidator,
  handler: (ctx, args) => choices.canonicalBoundary(() => choices.authorOptions(ctx, args)),
});

export const eventCategoryOptions = query({
  args: { ...owner }, returns: validators.eventCategoryOptionsValidator,
  handler: (ctx, args) => choices.canonicalBoundary(() => choices.eventCategoryOptions(ctx, args)),
});

export const formOptions = query({
  args: { ...owner }, returns: validators.formOptionsValidator,
  handler: (ctx, args) => choices.canonicalBoundary(() => choices.formOptions(ctx, args)),
});

export const productOptions = query({
  args: { ...owner }, returns: validators.productOptionsValidator,
  handler: (ctx, args) => choices.canonicalBoundary(() => choices.productOptions(ctx, args)),
});

export const productTermOptions = query({
  args: { ...owner, taxonomy: v.union(v.literal("productCategory"), v.literal("productTag")) }, returns: validators.productTermOptionsValidator,
  handler: (ctx, args) => choices.canonicalBoundary(() => choices.productTermOptions(ctx, args)),
});

export const recipeOptions = query({
  args: { ...owner }, returns: validators.recipeOptionsValidator,
  handler: (ctx, args) => choices.canonicalBoundary(() => choices.recipeOptions(ctx, args)),
});

export const albumOptions = query({
  args: { ...owner }, returns: validators.albumOptionsValidator,
  handler: (ctx, args) => choices.canonicalBoundary(() => choices.albumOptions(ctx, args)),
});

export const membershipPlanOptions = query({
  args: { ...owner }, returns: validators.membershipPlanOptionsValidator,
  handler: (ctx, args) => choices.canonicalBoundary(() => choices.membershipPlanOptions(ctx, args)),
});

export const instructorOptions = query({
  args: { ...owner }, returns: validators.authorOptionsValidator,
  handler: (ctx, args) => choices.canonicalBoundary(() => choices.instructorOptions(ctx, args)),
});

export const courseOptions = query({
  args: { ...owner }, returns: validators.courseOptionsValidator,
  handler: (ctx, args) => choices.canonicalBoundary(() => choices.courseOptions(ctx, args)),
});

export const kbCategoryOptions = query({
  args: { ...owner }, returns: validators.kbCategoryOptionsValidator,
  handler: (ctx, args) => choices.canonicalBoundary(() => choices.kbCategoryOptions(ctx, args)),
});

export const eventOptions = query({
  args: { ...owner }, returns: validators.eventOptionsValidator,
  handler: (ctx, args) => choices.canonicalBoundary(() => choices.eventOptions(ctx, args)),
});

export const bundleOptions = query({
  args: { ...owner }, returns: validators.productOptionsValidator,
  handler: (ctx, args) => choices.canonicalBoundary(() => choices.bundleOptions(ctx, args)),
});

export const mailingListOptions = query({
  args: { ...owner }, returns: validators.mailingListOptionsValidator,
  handler: (ctx, args) => choices.canonicalBoundary(() => choices.mailingListOptions(ctx, args)),
});
