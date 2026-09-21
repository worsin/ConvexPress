import { z } from "zod";
const id = z.string().min(1).max(256), slug = z.string().min(1).max(200);
export const knowledgeSearchArgsSchema = z.strictObject({ category: id.optional() });
export const knowledgeCategorySchema = z.strictObject({ id, name: z.string().min(1).max(256), slug });
export const knowledgeArticleSchema = z.strictObject({
  id, title: z.string().min(1).max(500), slug, excerpt: z.string().max(1000),
  categorySlug: slug, categoryName: z.string().max(256).nullable(),
  href: z.string().min(1).max(2048),
}).refine(article => article.href === `/help/${encodeURIComponent(article.categorySlug)}/${encodeURIComponent(article.slug)}`, "Knowledge-base route mismatch");
export const knowledgeSearchResultSchema = z.strictObject({
  available: z.boolean(), category: knowledgeCategorySchema.nullable(), articles: z.array(knowledgeArticleSchema).max(6),
}).superRefine((result, ctx) => {
  if (!result.available && (result.category || result.articles.length)) ctx.addIssue({code:"custom",message:"Unavailable help must not expose articles or categories"});
  if (new Set(result.articles.map(article=>article.id)).size!==result.articles.length) ctx.addIssue({code:"custom",message:"Duplicate help article"});
  if (result.category && result.articles.some(article=>article.categorySlug!==result.category!.slug)) ctx.addIssue({code:"custom",message:"Help article category mismatch"});
});
export type KnowledgeSearchArgs = z.infer<typeof knowledgeSearchArgsSchema>;
export type KnowledgeSearchResult = z.infer<typeof knowledgeSearchResultSchema>;
export function knowledgeSearchMatchesArgs(args:KnowledgeSearchArgs,result:KnowledgeSearchResult) {
  return result.available ? (args.category ? result.category?.id===args.category : result.category===null) : result.category===null;
}
