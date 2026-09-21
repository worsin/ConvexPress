/** Authenticated language administration. Public destinations use the canonical host only. */
import { query, mutation } from "./_generated/server";
import type { QueryCtx } from "./_generated/server";
import { v } from "convex/values";
import { canEditContent, canDiscoverContent } from "./helpers/publicContent";
import { requireCan } from "./helpers/permissions";
import { emitEvent } from "./helpers/events";
import { RequestReadLedger } from "./helpers/requestReadLedger";
import { SourceByteLedger } from "./canonicalDocuments/sourceBudget";
import { installation } from "./canonicalDocuments/displayContext";
import { localeCodeSchema } from "./canonicalDocuments/foundation/localeContracts";
import { localeValidator, translationValidator, configurationValidator, groupValidator } from "./localization/validators";
import { readConfiguration, validateLocales, readDocument, documentHref, groupEntries, groupKey, revision, refuse, MAX_LOCALES } from "./localization/model";
async function authorize(ctx: QueryCtx, instanceKey: string, budget: RequestReadLedger) {
  const user = await requireCan(ctx, "settings.update_general", budget);
  const scope = await installation(ctx, budget);
  if (scope.instanceKey !== instanceKey) refuse("SCOPE_MISMATCH", "Language settings belong to another site environment.");
  return user;
}
export const configuration = query({
  args: {instanceKey: v.string()}, returns: configurationValidator,
  handler: async (ctx, args) => {
    const budget = new RequestReadLedger(); await authorize(ctx, args.instanceKey, budget);
    const config = await readConfiguration(ctx, budget);
    return config ? {enabled: config.enabled, locales: config.locales, revision: config.revision} : {enabled: false, locales: [], revision: 0};
  },
});
export const saveConfiguration = mutation({
  args: {instanceKey: v.string(), expectedRevision: v.number(), enabled: v.boolean(), locales: v.array(localeValidator)},
  returns: configurationValidator,
  handler: async (ctx, args) => {
    const budget = new RequestReadLedger(), sources = new SourceByteLedger();
    const user = await authorize(ctx, args.instanceKey, budget);
    revision(args.expectedRevision); validateLocales(args.locales, args.enabled);
    const current = await readConfiguration(ctx, budget);
    if ((current?.revision ?? 0) !== args.expectedRevision) refuse("LOCALE_CONFLICT", "Languages changed in another session. Reload before saving.");
    for (const locale of args.locales) {
      const page = await readDocument(ctx, locale.landingPageId, budget, sources);
      if (!page || page.type !== "page" || page.status === "trash") refuse("LOCALE_LANDING", "Choose an existing page for each language landing page.");
      budget.beforeRead();
      const translation = budget.record(await ctx.db.query("locale_translations").withIndex("by_document", q => q.eq("documentId", page._id)).unique());
      if (translation && translation.code !== locale.code) refuse("LOCALE_DOCUMENT_LANGUAGE", "A landing page is assigned to another language in its translation group.");
    }
    const value = {enabled: args.enabled, locales: args.locales, revision: args.expectedRevision + 1};
    const stored = {...value, updatedAt: Date.now(), updatedBy: user._id};
    if (current) await ctx.db.patch("locale_routing", current._id, stored);
    else await ctx.db.insert("locale_routing", {key: "site", ...stored});
    await emitEvent(ctx, "settings.updated", "settings", {section: "localization", revision: value.revision, enabled: value.enabled, localeCount: value.locales.length, updatedBy: user._id});
    return value;
  },
});
export const translationGroup = query({
  args: {instanceKey: v.string(), documentId: v.optional(v.id("posts")), key: v.optional(v.string())}, returns: v.union(v.null(), groupValidator),
  handler: async (ctx, args) => {
    const budget = new RequestReadLedger(); await authorize(ctx, args.instanceKey, budget);
    if ((args.documentId === undefined) === (args.key === undefined)) refuse("LOCALE_GROUP_SELECTION", "Choose a document or a group key.");
    let group;
    if (args.key !== undefined) {
      groupKey(args.key); budget.beforeRead();
      group = budget.record(await ctx.db.query("locale_translation_groups").withIndex("by_key", q => q.eq("key", args.key!)).unique());
      if (!group) return null;
    } else {
      budget.beforeRead();
      const entry = budget.record(await ctx.db.query("locale_translations").withIndex("by_document", q => q.eq("documentId", args.documentId!)).unique());
      if (!entry) return null;
      budget.beforeRead(); group = budget.record(await ctx.db.get("locale_translation_groups", entry.groupId));
      if (!group) refuse("LOCALE_GROUP_MISSING", "Translation group metadata is missing.");
    }
    const entries = await groupEntries(ctx, group._id, budget);
    return {key: group.key, revision: group.revision, translations: entries.map(row => ({code: row.code, documentId: row.documentId}))};
  },
});
export const saveTranslations = mutation({
  args: {instanceKey: v.string(), key: v.string(), expectedRevision: v.number(), configurationRevision: v.number(), translations: v.array(translationValidator)},
  returns: groupValidator,
  handler: async (ctx, args) => {
    const budget = new RequestReadLedger(), sources = new SourceByteLedger();
    const user = await authorize(ctx, args.instanceKey, budget);
    groupKey(args.key); revision(args.expectedRevision); revision(args.configurationRevision);
    if (args.translations.length > MAX_LOCALES) refuse("LOCALE_GROUP_LIMIT", "A translation group supports up to 24 languages.");
    if (new Set(args.translations.map(row => row.code)).size !== args.translations.length ||
        new Set(args.translations.map(row => row.documentId)).size !== args.translations.length)
      refuse("LOCALE_DUPLICATE", "Choose one distinct document per language.");
    const config = await readConfiguration(ctx, budget);
    if (!config || config.revision !== args.configurationRevision) refuse("LOCALE_CONFLICT", "Language configuration changed. Reload before saving translations.");
    budget.beforeRead();
    const group = budget.record(await ctx.db.query("locale_translation_groups").withIndex("by_key", q => q.eq("key", args.key)).unique());
    if ((group?.revision ?? 0) !== args.expectedRevision) refuse("LOCALE_CONFLICT", "This translation group changed in another session. Reload before saving.");
    const existing = group ? await groupEntries(ctx, group._id, budget) : [];
    let type: "post" | "page" | null = null;
    for (const row of args.translations) {
      if (!localeCodeSchema.safeParse(row.code).success || !config.locales.some(locale => locale.code === row.code))
        refuse("LOCALE_NOT_CONFIGURED", "Configure each language before assigning translations.");
      const document = await readDocument(ctx, row.documentId, budget, sources);
      if (!document || document.status === "trash") refuse("LOCALE_DOCUMENT_MISSING", "Choose existing documents for translations.");
      if (type && type !== document.type) refuse("LOCALE_DOCUMENT_TYPE", "A translation group must contain only pages or only posts.");
      type = document.type;
      if (config.locales.some(locale => locale.landingPageId === row.documentId && locale.code !== row.code))
        refuse("LOCALE_DOCUMENT_LANGUAGE", "This page is the landing page for another language.");
      budget.beforeRead();
      const assigned = budget.record(await ctx.db.query("locale_translations").withIndex("by_document", q => q.eq("documentId", row.documentId)).unique());
      if (assigned && assigned.groupId !== group?._id) refuse("LOCALE_DOCUMENT_ASSIGNED", "A document already belongs to another translation group. Remove that assignment first.");
    }
    const value = {key: args.key, revision: args.expectedRevision + 1, translations: args.translations};
    const metadata = {revision: value.revision, updatedBy: user._id, updatedAt: Date.now()};
    const id = group?._id ?? await ctx.db.insert("locale_translation_groups", {key: args.key, ...metadata});
    if (group) await ctx.db.patch("locale_translation_groups", id, metadata);
    for (const row of existing) await ctx.db.delete("locale_translations", row._id);
    for (const row of args.translations) await ctx.db.insert("locale_translations", {groupId: id, ...row});
    // Empty groups retain their revision to prevent stale sessions recreating removed mappings.
    await emitEvent(ctx, "settings.updated", "settings", {section: "localization.translations", groupKey: args.key, revision: value.revision, translationCount: args.translations.length, updatedBy: user._id});
    return value;
  },
});

const documentOption = v.object({id:v.id("posts"),title:v.string(),type:v.union(v.literal("page"),v.literal("post")),status:v.string(),href:v.string()});
export const document = query({
  args:{instanceKey:v.string(),documentId:v.id("posts")}, returns:v.union(v.null(),documentOption),
  handler:async(ctx,args)=>{
    const budget=new RequestReadLedger();await authorize(ctx,args.instanceKey,budget);
    const post=await readDocument(ctx,args.documentId,budget,new SourceByteLedger());
    if(!post || post.status==="trash" || !(await canEditContent(ctx,post,budget) || await canDiscoverContent(ctx,post,budget)))return null;
    return {id:post._id,title:post.title,type:post.type,status:post.status,href:documentHref(post)};
  },
});
export const documents = query({
  args:{instanceKey:v.string(),type:v.union(v.literal("page"),v.literal("post")),search:v.string(),cursor:v.union(v.null(),v.string())},
  returns:v.object({items:v.array(documentOption),cursor:v.union(v.null(),v.string())}),
  handler:async(ctx,args)=>{
    const budget=new RequestReadLedger();await authorize(ctx,args.instanceKey,budget);
    if(args.search.length>120 || (args.cursor?.length??0)>8192)refuse("LOCALE_SEARCH_INPUT","Document search exceeds its supported size.");
    const search=args.search.trim();budget.beforeRead();
    const page=await (search?ctx.db.query("posts").withSearchIndex("search_posts",q=>q.search("title",search).eq("type",args.type)):ctx.db.query("posts").withIndex("by_type_created",q=>q.eq("type",args.type)).order("desc")).paginate({numItems:4,cursor:args.cursor});
    const sources=new SourceByteLedger(),items=[];
    for(const post of page.page){budget.record(post);sources.record("post",post);if(post.type!==args.type || post.status==="trash" || !(await canEditContent(ctx,post,budget)||await canDiscoverContent(ctx,post,budget)))continue;items.push({id:post._id,title:post.title,type:post.type,status:post.status,href:documentHref(post)});}
    return {items,cursor:page.isDone?null:page.continueCursor};
  },
});
