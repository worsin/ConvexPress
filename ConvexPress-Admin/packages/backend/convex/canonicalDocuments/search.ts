import { matchesCurrentSearchText } from "../search/currentMatch";
import { plainSearchExcerpt } from "../search/excerpt";
import {makeFunctionReference} from "convex/server";
import type {SearchCandidateArgs,SearchCandidatePage} from "../search/candidates";
import {z} from "zod";
import {sha256Hex} from "@convexpress/site-contract";
import type {QueryCtx} from "../_generated/server";
import {RequestReadLedger} from "../helpers/requestReadLedger";
import {createPublicSearchSourceReader} from "../search/publicSource";
import {stripContentForSearch} from "../search/helpers";
import {CanonicalDataError,stableKey,type DataScope} from "./foundation/contracts";
import {searchArgsSchema,searchResultSchema,type SearchResult} from "./foundation/searchContracts";

const BATCH_SIZE=24,MAX_BATCHES=4,MAX_BLOCK_QUERIES=96;
const digest=z.string().regex(/^[a-f0-9]{64}$/);
const cursorSchema=z.strictObject({
 version:z.literal(2),binding:digest,phase:z.enum(["title","body"]),
 position:z.string().min(1).max(3500).nullable(),offset:z.number().int().min(0).max(BATCH_SIZE-1),batch:digest.nullable(),
}).refine(value=>(value.offset===0)===(value.batch===null),"Partial search batches require their identity digest");
type SearchCursor=z.infer<typeof cursorSchema>;

/** Fill visible pages from bounded batches. A partial batch carries its start
 * cursor, offset and identity digest, never hidden candidate IDs or text. If
 * ranking changes within that batch, restart instead of skipping/repeating rows.
 * Source authority is rechecked on every request, including resumed batches. */
export async function readSearch(ctx:QueryCtx,rawArgs:unknown,scope:DataScope,documentId:string,budget=new RequestReadLedger()):Promise<SearchResult>{
 const args=searchArgsSchema.parse(rawArgs);
 if(!args.query){if(args.cursor)throw new CanonicalDataError("SEARCH_CURSOR_QUERY","cursor","A search cursor requires a query");return {state:"idle",query:"",items:[],cursor:null,nextCursor:null};}
 const query=args.query.toLowerCase().replace(/\s+/g," "),kinds=[...new Set(args.kinds)].sort();
 const binding=sha256Hex(stableKey({version:2,scope,documentId,query,kinds,pageSize:args.pageSize}));
 let cursor:SearchCursor|null=args.cursor===null?{version:2,binding,phase:"title",position:null,offset:0,batch:null}:cursorSchema.parse(JSON.parse(args.cursor));
 if(cursor.binding!==binding)throw new CanonicalDataError("SEARCH_CURSOR_SCOPE","cursor","Search cursor belongs to another query, document or website environment");
 const selected=kinds.length===1?kinds[0]:null;
 const candidateRef=makeFunctionReference<"query",SearchCandidateArgs,SearchCandidatePage>("search/candidates:page");
 const readSource=createPublicSearchSourceReader(ctx,Date.now(),budget),items:SearchResult["items"]=[],seen=new Set<string>();
 const startingQueries=budget.queries;
 let batches=0,processed=0;
 const roomForCandidate=()=>budget.queries-startingQueries<MAX_BLOCK_QUERIES&&budget.limits.queries-budget.queries>=24&&budget.limits.documents-budget.documents>=64&&budget.limits.bytes-budget.bytes>=1024*1024;
 while(cursor&&items.length<args.pageSize&&batches<MAX_BATCHES){
  if(!roomForCandidate()){
   if(!processed)throw new CanonicalDataError("SEARCH_READ_BUDGET","request","Search cannot start within the remaining document read budget");
   break;
  }
  const batchStart:SearchCursor=cursor;
  budget.beforeRead();
  const page:SearchCandidatePage=await ctx.runQuery(candidateRef,{query,phase:batchStart.phase,kind:selected,cursor:batchStart.position,pageSize:BATCH_SIZE,maxBytes:budget.limits.bytes-budget.bytes,maxDocuments:budget.limits.documents-budget.documents,maxDocumentBytes:budget.limits.documentBytes});
  budget.recordPage(page);batches++;
  const batchDigest=sha256Hex(stableKey(page.page));
  if(batchStart.offset>page.page.length||(batchStart.batch!==null&&batchStart.batch!==batchDigest))throw new CanonicalDataError("SEARCH_CURSOR_STALE","cursor","Search results changed. Start again from the first results page.");
  let index=batchStart.offset;
  while(index<page.page.length&&items.length<args.pageSize&&roomForCandidate()){
   const row=page.page[index++];processed++;
   if(row.contentType==="media"||row.contentType==="comment"||(kinds.length&&!kinds.includes(row.contentType)))continue;
   if(batchStart.phase==="body"){
    budget.beforeRead();
    const title=budget.record(await ctx.db.query("searchIndex").withSearchIndex("search_title",q=>q.search("title",query).eq("status","publish").eq("contentType",row.contentType).eq("contentId",row.contentId)).first());
    if(title)continue;
   }
   const source=await readSource(row);if(!source || !matchesCurrentSearchText(query, source.title, source.content))continue;
   const key=`${row.contentType}:${row.contentId}`;if(seen.has(key))continue;seen.add(key);
   items.push({id:source.contentId,kind:row.contentType,title:source.title,href:source.url,excerpt:plainSearchExcerpt(stripContentForSearch(source.excerpt||source.content),args.query),author:source.authorName||null,publishedAt:source.publishedAt??null});
  }
  if(index<page.page.length){cursor={...batchStart,offset:index,batch:index?batchDigest:null};break;}
  if(page.isDone){cursor=batchStart.phase==="title"?{version:2,binding,phase:"body",position:null,offset:0,batch:null}:null;}
  else{
   if(page.continueCursor===batchStart.position)throw new CanonicalDataError("SEARCH_CURSOR_STALLED","cursor","Search continuation did not advance");
   cursor={...batchStart,position:page.continueCursor,offset:0,batch:null};
  }
 }
 return searchResultSchema.parse({state:"ready",query:args.query,items,cursor:args.cursor,nextCursor:cursor?JSON.stringify(cursorSchema.parse(cursor)):null});
}
