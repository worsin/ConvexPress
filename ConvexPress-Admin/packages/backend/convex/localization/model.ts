import { ConvexError } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import type { QueryCtx } from "../_generated/server";
import { RequestReadLedger } from "../helpers/requestReadLedger";
import { SourceByteLedger } from "../canonicalDocuments/sourceBudget";
import { createContentDiscoveryEvaluator } from "../helpers/publicContent";
import { localeCodeSchema, localeLabelSchema, localeResultSchema, type LocaleResult } from "../canonicalDocuments/foundation/localeContracts";
import type { NavigationSource } from "../canonicalDocuments/navigation";
export const MAX_LOCALES = 24;
export function refuse(code: string, message: string): never {throw new ConvexError({code, message});}
export function revision(value: number) {
  if (!Number.isSafeInteger(value) || value < 0) refuse("LOCALE_REVISION", "Invalid language configuration revision.");
}
export function groupKey(value: string) {
  if (!/^[a-z0-9][a-z0-9-]{0,79}$/.test(value)) refuse("LOCALE_GROUP_KEY", "Use a group name of up to 80 lowercase letters, numbers and hyphens.");
}
export async function readConfiguration(ctx: QueryCtx, budget = new RequestReadLedger()) {
  budget.beforeRead();
  return budget.record(await ctx.db.query("locale_routing").withIndex("by_key", q => q.eq("key", "site")).unique());
}
export function validateLocales(locales: Doc<"locale_routing">["locales"], enabled: boolean) {
  if (locales.length > MAX_LOCALES || (enabled && locales.length < 2))
    refuse("LOCALE_COUNT", "Configure between two and 24 languages before enabling language routing.");
  for (const locale of locales) {
    if (!localeCodeSchema.safeParse(locale.code).success || !localeLabelSchema.safeParse(locale.label).success || locale.label.trim() !== locale.label)
      refuse("LOCALE_LABEL", "Use a language tag such as en, es, en-US or zh-Hant and a plain native-language label.");
  }
  if (new Set(locales.map(locale => locale.code)).size !== locales.length ||
      new Set(locales.map(locale => locale.landingPageId)).size !== locales.length)
    refuse("LOCALE_DUPLICATE", "Each language needs a distinct language tag and landing page.");
}
/** Fetch one full source at a time and charge its bytes before reading another. */
export async function readDocument(ctx: QueryCtx, id: Id<"posts">, budget: RequestReadLedger, sources: SourceByteLedger) {
  budget.beforeRead(); sources.beforeRead();
  const post = budget.record(await ctx.db.get("posts", id));
  if (post) sources.record("post", post);
  return post;
}
export function documentHref(post: NavigationSource["document"]) {
  return post.type === "post" ? `/blog/${encodeURIComponent(post.slug)}` : `/page${post.path ?? `/${encodeURIComponent(post.slug)}`}`;
}
export async function groupEntries(ctx: QueryCtx, id: Id<"locale_translation_groups">, budget = new RequestReadLedger()) {
  budget.beforeRead();
  const entries = await ctx.db.query("locale_translations").withIndex("by_group", q => q.eq("groupId", id)).take(MAX_LOCALES + 1);
  for (const entry of entries) budget.record(entry);
  if (entries.length > MAX_LOCALES) refuse("LOCALE_GROUP_LIMIT", "This translation group exceeds its language limit.");
  return entries;
}
/** Only the host may supply the already-authorized current document. No public ID resolver. */
export async function readLocaleDestinations(ctx: QueryCtx, document: NavigationSource["document"],
  budget = new RequestReadLedger(), sources = new SourceByteLedger()): Promise<LocaleResult> {
  const config = await readConfiguration(ctx, budget);
  if (!config?.enabled) return {enabled: false, currentLocale: null, items: []};
  validateLocales(config.locales, true);
  budget.beforeRead();
  const membership = budget.record(await ctx.db.query("locale_translations").withIndex("by_document", q => q.eq("documentId", document._id)).unique());
  const entries = membership ? await groupEntries(ctx, membership.groupId, budget) : [];
  const configured = new Set(config.locales.map(locale => locale.code));
  const currentLocale = membership && configured.has(membership.code) ? membership.code :
    config.locales.find(locale => locale.landingPageId === document._id)?.code ?? null;
  const canDiscover = createContentDiscoveryEvaluator(ctx, budget);
  const items: LocaleResult["items"] = [];
  // A mapped but inaccessible translation is omitted. Falling back to its
  // landing page would disguise the withdrawal of access to that translation.
  for (const locale of config.locales) {
    const translation = entries.find(entry => entry.code === locale.code);
    const id = translation?.documentId ?? locale.landingPageId;
    const post = await readDocument(ctx, id, budget, sources);
    if (!post || post.publishedAt === undefined || post.publishedAt > Date.now() || !await canDiscover(post)) continue;
    const href = documentHref(post);
    // Malformed historic routes are not links, and cannot poison other locales.
    const item = {code: locale.code, label: locale.label, direction: locale.direction,
      href, current: id === document._id, destination: translation ? "translation" as const : "landing" as const};
    if (!localeResultSchema.shape.items.element.safeParse(item).success) continue;
    if (items.some(existing => existing.href === href)) continue;
    items.push(item);
  }
  return localeResultSchema.parse({enabled: true, currentLocale, items});
}
