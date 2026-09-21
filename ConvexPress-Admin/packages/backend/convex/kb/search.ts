/**
 * Knowledge Base System - Search Functions
 *
 * Convex-native full-text search:
 *   search - Search published articles via Convex searchIndex
 *
 * For search analytics logging, use trackSearch in kb/analytics.ts.
 */

import { query } from "../_generated/server";
import { searchArticlesArgs } from "./validators";
import { v, ConvexError } from "convex/values";
import { createPublicKbAccess } from "./publicAccess";
import { RequestReadLedger } from "../helpers/requestReadLedger";

const searchResult = v.object({
  _id: v.id("kb_articles"), title: v.string(), slug: v.string(), excerpt: v.string(),
  categoryId: v.optional(v.id("kb_categories")), categoryName: v.union(v.string(), v.null()),
  categorySlug: v.union(v.string(), v.null()), viewCount: v.number(),
  readingTimeMinutes: v.number(), publishedAt: v.optional(v.number()),
});

// ─── Search ─────────────────────────────────────────────────────────────────

export const search: import("convex/server").RegisteredQuery<"public", { query: string; limit?: number; categoryId?: import("../_generated/dataModel").Id<"kb_categories"> }, { results: Array<Pick<import("../_generated/dataModel").Doc<"kb_articles">, "_id" | "title" | "slug" | "excerpt" | "categoryId" | "viewCount" | "readingTimeMinutes" | "publishedAt"> & { categoryName: string | null; categorySlug: string | null }>; total: number } | null> = query({
  args: searchArticlesArgs,
  returns: v.union(v.null(), v.object({ results: v.array(searchResult), total: v.number() })),
  handler: async (ctx, args) => {
    if (args.query.length > 500 || (args.limit !== undefined && (!Number.isSafeInteger(args.limit) || args.limit < 1 || args.limit > 100))) {
      throw new ConvexError({ code: "INVALID_SEARCH", message: "Search accepts up to 500 characters and a limit between 1 and 100." });
    }
    const budget = new RequestReadLedger();
    const access = createPublicKbAccess(ctx, budget);
    if (!await access.available() || !await access.allowedRoute("/help/search")) return null;
    const limit = args.limit ?? 20;

    if (!args.query.trim()) return { results: [], total: 0 };

    budget.beforeRead();
    const results = await ctx.db
      .query("kb_articles")
      .withSearchIndex("search_articles", (q) => {
        let sq = q.search("contentPlainText", args.query.trim());
        sq = sq.eq("status", "published");
        if (args.categoryId) {
          sq = sq.eq("categoryId", args.categoryId);
        }
        return sq;
      })
      .take(limit);

    const enriched = await Promise.all(
      results.map(async (article) => {
        budget.record(article);
        const visible = await access.article(article);
        if (!visible) return null;
        const category = visible.category;
        return {
          _id: article._id,
          title: article.title,
          slug: article.slug,
          excerpt: article.excerpt,
          categoryId: article.categoryId,
          categoryName: category?.name ?? null,
          categorySlug: category?.slug ?? null,
          viewCount: article.viewCount,
          readingTimeMinutes: article.readingTimeMinutes,
          publishedAt: article.publishedAt,
        };
      }),
    );

    const visible = enriched.filter((row): row is NonNullable<typeof row> => row !== null);
    return { results: visible, total: visible.length };
  },
});


import { paginationOptsValidator, type RegisteredQuery, type PaginationOptions } from "convex/server";
import type { Doc } from "../_generated/dataModel";
type SearchItem=Pick<Doc<"kb_articles">,"_id"|"title"|"slug"|"excerpt"|"categoryId"|"viewCount"|"readingTimeMinutes"|"publishedAt">&{categoryName:string|null;categorySlug:string|null};
type SearchPage={page:SearchItem[];isDone:boolean;continueCursor:string};
/** Pagination advances over the underlying ranked results even when a page is
 * entirely hidden by current access rules. A cursor never grants access. */
export const searchPage:RegisteredQuery<"public",{query:string;categorySlug?:string;paginationOpts:PaginationOptions},SearchPage>=query({
 args:{query:v.string(),categorySlug:v.optional(v.string()),paginationOpts:paginationOptsValidator},
 returns:v.object({page:v.array(searchResult),isDone:v.boolean(),continueCursor:v.string()}),
 handler:async(ctx,args)=>{
  const query=args.query.trim(),categorySlug=args.categorySlug??null;
  if(args.query.length>500||(categorySlug!==null&&(!categorySlug||categorySlug.length>200))||!Number.isSafeInteger(args.paginationOpts.numItems)||args.paginationOpts.numItems<1)throw new ConvexError({code:"INVALID_SEARCH",message:"Enter a search of up to 500 characters and a valid page size."});
  let cursor:string|null=null;
  if(args.paginationOpts.cursor){
   try{if(args.paginationOpts.cursor.length>4096)throw Error();const value:unknown=JSON.parse(args.paginationOpts.cursor);if(!value||typeof value!=="object"||!("query"in value)||!("category"in value)||!("cursor"in value)||value.query!==query||value.category!==categorySlug||typeof value.cursor!=="string"||!value.cursor)throw Error();cursor=value.cursor;}
   catch{throw new ConvexError({code:"INVALID_SEARCH_CURSOR",message:"This result page belongs to another search. Start the search again."});}
  }
  const empty:SearchPage={page:[],isDone:true,continueCursor:""};if(!query)return empty;
  const budget=new RequestReadLedger(),access=createPublicKbAccess(ctx,budget);
  if(!await access.available()||!await access.allowedRoute("/help/search"))return empty;
  let categoryId:Doc<"kb_categories">["_id"]|undefined;
  if(categorySlug){
   budget.beforeRead();const category=budget.record(await ctx.db.query("kb_categories").withIndex("by_slug",q=>q.eq("slug",categorySlug)).unique());
   if(!category?.isPublished||!await access.allowedRoute(`/help/${encodeURIComponent(categorySlug)}`))return empty;
   categoryId=category._id;
  }
  budget.beforeRead();const result=await ctx.db.query("kb_articles").withSearchIndex("search_articles",q=>{const search=q.search("contentPlainText",query).eq("status","published");return categoryId?search.eq("categoryId",categoryId):search;}).paginate({numItems:Math.min(20,args.paginationOpts.numItems),cursor,maximumRowsRead:20,maximumBytesRead:512*1024});
  const page:SearchItem[]=[];
  for(const article of result.page){budget.record(article);const visible=await access.article(article);if(!visible)continue;
   page.push({_id:article._id,title:article.title,slug:article.slug,excerpt:article.excerpt,categoryId:article.categoryId,categoryName:visible.category?.name??null,categorySlug:visible.category?.slug??null,viewCount:article.viewCount,readingTimeMinutes:article.readingTimeMinutes,publishedAt:article.publishedAt});
  }
  const next=result.isDone?"":JSON.stringify({query,category:categorySlug,cursor:result.continueCursor});
  if(next.length>4096)throw new ConvexError({code:"INVALID_SEARCH_CURSOR",message:"This search cannot continue. Try a more specific query."});
  return {page,isDone:result.isDone,continueCursor:next};
 },
});
