import type { QueryCtx } from "../_generated/server";
import { RequestReadLedger } from "../helpers/requestReadLedger";
import { createPublicKbAccess } from "../kb/publicAccess";
import { knowledgeSearchArgsSchema, knowledgeSearchResultSchema, type KnowledgeSearchResult } from "./foundation/knowledgeBaseContracts";

/** A small public reading list, ordered by views. Article bodies never enter the DTO. */
export async function readKnowledgeSearch(ctx:QueryCtx, rawArgs:unknown, budget=new RequestReadLedger()):Promise<KnowledgeSearchResult> {
  const args=knowledgeSearchArgsSchema.parse(rawArgs),access=createPublicKbAccess(ctx,budget);
  const unavailable:KnowledgeSearchResult={available:false,category:null,articles:[]};
  if (!await access.available() || !await access.allowedRoute("/help/search")) return unavailable;
  const categoryId=args.category?ctx.db.normalizeId("kb_categories",args.category):null;
  if(args.category&&!categoryId)return unavailable;
  const category=categoryId?await access.category(categoryId):null;
  if(categoryId&&(!category?.isPublished||!await access.allowedRoute(`/help/${encodeURIComponent(category.slug)}`)))return unavailable;
  budget.beforeRead();
  const candidates=await (categoryId
    ? ctx.db.query("kb_articles").withIndex("by_category_status_views",q=>q.eq("categoryId",categoryId).eq("status","published"))
    : ctx.db.query("kb_articles").withIndex("by_status_views",q=>q.eq("status","published")))
    .order("desc").take(24);
  candidates.forEach(article=>budget.record(article));
  const articles=[];
  for(const article of candidates){
    const visible=await access.article(article);if(!visible)continue;
    articles.push({id:article._id,title:article.title,slug:article.slug,excerpt:article.excerpt,categorySlug:visible.category?.slug??"uncategorized",categoryName:visible.category?.name??null,href:visible.href});
    if(articles.length===6)break;
  }
  return knowledgeSearchResultSchema.parse({available:true,category:category?{id:category._id,name:category.name,slug:category.slug}:null,articles});
}
