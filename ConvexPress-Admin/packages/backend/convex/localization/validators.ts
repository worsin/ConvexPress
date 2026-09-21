import { v } from "convex/values";
export const localeValidator = v.object({
  code: v.string(), label: v.string(), direction: v.union(v.literal("ltr"), v.literal("rtl")),
  landingPageId: v.id("posts"),
});
export const translationValidator = v.object({code: v.string(), documentId: v.id("posts")});
export const configurationValidator = v.object({enabled: v.boolean(), locales: v.array(localeValidator), revision: v.number()});
export const groupValidator = v.object({key: v.string(), revision: v.number(), translations: v.array(translationValidator)});
