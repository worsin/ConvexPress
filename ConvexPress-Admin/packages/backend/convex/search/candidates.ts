import {v,getDocumentSize} from "convex/values";
import type {Doc} from "../_generated/dataModel";
import {internalQuery} from "../_generated/server";
import {searchableContentTypeValidator} from "../schema/search";
import {searchQuerySchema,searchKindSchema} from "../canonicalDocuments/foundation/searchContracts";
export type SearchCandidateArgs={query:string;phase:"title"|"body";kind:"post"|"page"|"product"|"course"|"event"|null;cursor:string|null;pageSize:number;maxBytes:number;maxDocuments:number;maxDocumentBytes:number};
export type SearchCandidatePage={page:Array<Pick<Doc<"searchIndex">,"contentType"|"contentId">>;isDone:boolean;continueCursor:string;rows:number;bytes:number};
/** Exactly one paginated stream per internal query. The caller's current viewer
 * is inherited; candidate text and private cache metadata never leave this query. */
export const page=internalQuery({
 args:{query:v.string(),phase:v.union(v.literal("title"),v.literal("body")),kind:v.union(v.literal("post"),v.literal("page"),v.literal("product"),v.literal("course"),v.literal("event"),v.null()),cursor:v.union(v.string(),v.null()),pageSize:v.number(),maxBytes:v.number(),maxDocuments:v.number(),maxDocumentBytes:v.number()},
 returns:v.object({page:v.array(v.object({contentType:searchableContentTypeValidator,contentId:v.string()})),isDone:v.boolean(),continueCursor:v.string(),rows:v.number(),bytes:v.number()}),
 handler:async(ctx,args):Promise<SearchCandidatePage>=>{
  searchQuerySchema.parse(args.query);if(args.kind)searchKindSchema.parse(args.kind);
  for(const [value,max] of [[args.pageSize,48],[args.maxBytes,8*1024*1024],[args.maxDocuments,2048],[args.maxDocumentBytes,512*1024]])if(!Number.isSafeInteger(value)||value<1||value>max)throw Error("Invalid search candidate budget");
  const stream=args.phase==="title"?ctx.db.query("searchIndex").withSearchIndex("search_title",q=>{const s=q.search("title",args.query).eq("status","publish");return args.kind?s.eq("contentType",args.kind):s;}):ctx.db.query("searchIndex").withSearchIndex("search_all",q=>{const s=q.search("content",args.query).eq("status","publish");return args.kind?s.eq("contentType",args.kind):s;});
  const result=await stream.paginate({cursor:args.cursor,numItems:Math.min(args.pageSize,args.maxDocuments),maximumRowsRead:Math.min(args.pageSize,args.maxDocuments),maximumBytesRead:Math.min(1024*1024,args.maxBytes)});
  let bytes=0;for(const row of result.page){const size=getDocumentSize(row);if(size>args.maxDocumentBytes)throw Error("Search candidate exceeds document read budget");bytes+=size;}
  if(bytes>args.maxBytes||result.page.length>args.maxDocuments)throw Error("Search candidates exceed page read budget");
  return {page:result.page.map(({contentType,contentId})=>({contentType,contentId})),isDone:result.isDone,continueCursor:result.continueCursor,rows:result.page.length,bytes};
 },
});
