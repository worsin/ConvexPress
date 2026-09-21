/** Public category archives and independently paginated hierarchy navigation. */
import { v } from "convex/values";
import { z } from "zod";
import { streamQuery, type IndexKey } from "convex-helpers/server/pagination";
import { sha256Hex } from "@convexpress/site-contract";
import { query, type QueryCtx } from "./_generated/server";
import type { Doc } from "./_generated/dataModel";
import schema from "./schema";
import { RequestReadLedger } from "./helpers/requestReadLedger";
import { evaluateMembershipAccess } from "./membership/access";
import { readPostArchive } from "./canonicalDocuments/postGrid";
import { CanonicalDataError, stableKey } from "./canonicalDocuments/foundation/contracts";
import { canonicalBoundary } from "./canonicalDocuments/service";

const argsValidator = { slug:v.string(), instanceKey:v.string(), cursor:v.optional(v.string()), refreshKey:v.optional(v.string()) };
const input = z.strictObject({ slug:z.string().min(1).max(256), instanceKey:z.string().min(1).max(128), cursor:z.string().min(1).max(4096).optional(), refreshKey:z.string().min(1).max(128).optional() });
const labelValidator = v.object({ id:v.id("terms"), name:v.string(), slug:v.string() });
const contextValidator = { scope:v.object({websiteKey:v.string(),instanceKey:v.string()}), viewerSubject:v.union(v.string(),v.null()), slug:v.string() };
const continuationValidator = { cursor:v.union(v.string(),v.null()), nextCursor:v.union(v.string(),v.null()), resetRequired:v.boolean() };
const cardValidator = v.object({id:v.string(),title:v.string(),href:v.string(),excerpt:v.union(v.string(),v.null()),publishedAt:v.number(),author:v.union(v.string(),v.null()),image:v.union(v.null(),v.object({src:v.string(),alt:v.string()}))});
const childCursor = z.strictObject({version:z.literal(1),binding:z.string().regex(/^[a-f0-9]{64}$/u),termId:z.string().min(1).max(256),positionHash:z.string().regex(/^[a-f0-9]{64}$/u)});
const pathFor = (slug:string) => `/category/${encodeURIComponent(slug)}`;
function label(term:Doc<"terms">){
  if(term.name.length>512 || term.slug.length>256)throw new CanonicalDataError("CATEGORY_SUMMARY_BUDGET","category","Category labels exceed their display budget");
  return {id:term._id,name:term.name,slug:term.slug};
}
async function allowed(ctx:QueryCtx,slug:string,budget:RequestReadLedger){
  return (await evaluateMembershipAccess(ctx,{resourceType:"route",resourceIdOrKey:pathFor(slug)},budget)).allowed;
}
async function context(ctx:QueryCtx,raw:unknown,budget:RequestReadLedger){
  const args=input.parse(raw);
  budget.beforeRead();const identity=budget.record(await ctx.db.query("convexpress_siteIdentity").withIndex("by_identity_key",q=>q.eq("identityKey","site-identity")).unique());
  if(!identity || identity.instanceKey!==args.instanceKey)throw new CanonicalDataError("SCOPE_MISMATCH","instanceKey","Category archive belongs to another environment");
  if(!(await allowed(ctx,args.slug,budget)))return null;
  budget.beforeRead();const term=budget.record(await ctx.db.query("terms").withIndex("by_slug_taxonomy",q=>q.eq("slug",args.slug).eq("taxonomy","category")).unique());
  if(!term)return null;
  return {args,term,binding:{scope:{websiteKey:identity.websiteKey,instanceKey:identity.instanceKey},viewerSubject:(await ctx.auth.getUserIdentity())?.subject??null,slug:args.slug}};
}
async function ancestors(ctx:QueryCtx,term:Doc<"terms">,budget:RequestReadLedger){
  const result:Array<ReturnType<typeof label>>=[];
  const seen=new Set<string>([term._id]);let parentId=term.parentId;
  while(parentId){
    if(seen.has(parentId)||seen.size>20)throw new CanonicalDataError("CATEGORY_HIERARCHY","category","Category ancestry is cyclic or exceeds its safe depth");
    seen.add(parentId);budget.beforeRead();const parent=budget.record(await ctx.db.get("terms",parentId));
    if(!parent || parent.taxonomy!=="category")throw new CanonicalDataError("CATEGORY_HIERARCHY","category","Category ancestry is invalid");
    // A denied ancestor also hides the chain above it.
    if(!(await allowed(ctx,parent.slug,budget)))break;
    result.unshift(label(parent));parentId=parent.parentId;
  }
  return result;
}

export const read = query({
  args:argsValidator,
  returns:v.union(v.null(),v.object({...contextValidator,...continuationValidator,
    category:v.object({id:v.id("terms"),name:v.string(),slug:v.string(),description:v.union(v.string(),v.null())}),
    ancestors:v.array(labelValidator),items:v.array(cardValidator),
  })),
  handler:(ctx,raw)=>canonicalBoundary(async()=>{
    const budget=new RequestReadLedger(),value=await context(ctx,raw,budget);
    if(!value)return null;
    const {args,term,binding}=value;
    const category={...label(term),description:term.description??null};
    if((category.description?.length??0)>8192)throw new CanonicalDataError("CATEGORY_SUMMARY_BUDGET","category","Category description exceeds its display budget");
    const chain=await ancestors(ctx,term,budget);
    budget.beforeRead();const reading=budget.record(await ctx.db.query("settings").withIndex("by_section",q=>q.eq("section","reading")).unique());
    const configured=(reading?.values as {postsPerPage?:unknown}|undefined)?.postsPerPage;
    const limit=configured===undefined?10:z.number().int().min(1).max(100).parse(configured);
    try{
      const page=await readPostArchive(ctx,{query:{category:term._id},limit,cursor:args.cursor??null},binding.scope,pathFor(args.slug),budget);
      return {...binding,category,ancestors:chain,...page,resetRequired:false};
    }catch(error){
      if(args.cursor && error instanceof CanonicalDataError && error.code==="POST_CURSOR_SCOPE")
        return {...binding,category,ancestors:chain,items:[],cursor:args.cursor,nextCursor:null,resetRequired:true};
      throw error;
    }
  }),
});

export const children = query({
  args:argsValidator,
  returns:v.union(v.null(),v.object({...contextValidator,...continuationValidator,items:v.array(labelValidator)})),
  handler:(ctx,raw)=>canonicalBoundary(async()=>{
    const budget=new RequestReadLedger(),value=await context(ctx,raw,budget);
    if(!value)return null;
    const {args,term,binding}=value;
    const signature=sha256Hex(stableKey({scope:binding.scope,parent:term._id,slug:args.slug}));
    const cursor=args.cursor?childCursor.parse(JSON.parse(args.cursor)):null;
    if(cursor && cursor.binding!==signature)throw new CanonicalDataError("CATEGORY_CURSOR_SCOPE","cursor","Subcategory cursor belongs to another parent or environment");
    const reset=()=>({...binding,items:[],cursor:args.cursor??null,nextCursor:null,resetRequired:true});
    const key=(child:Doc<"terms">):IndexKey=>[term._id,child.name,child._creationTime,child._id];
    const positionHash=(child:Doc<"terms">)=>sha256Hex(stableKey(key(child)));
    let resume:Doc<"terms">|null=null;
    if(cursor){
      const id=ctx.db.normalizeId("terms",cursor.termId);
      if(!id)throw new CanonicalDataError("CATEGORY_CURSOR_RANGE","cursor","Invalid subcategory position");
      budget.beforeRead();resume=budget.record(await ctx.db.get("terms",id));
      if(!resume || resume.parentId!==term._id || resume.taxonomy!=="category" || positionHash(resume)!==cursor.positionHash)return reset();
    }
    const iterator=streamQuery(ctx,{schema,table:"terms",index:"by_parent_name",order:"asc",startIndexKey:resume?key(resume):[term._id],startInclusive:!resume,endIndexKey:[term._id],endInclusive:true});
    const items:Array<ReturnType<typeof label>>=[];let position:Doc<"terms">|null=null,scanned=0,more=false;
    try{
      while(true){
        if(position && (scanned>=96 || budget.queries>=budget.limits.queries-40)){more=true;break;}
        budget.beforeRead();const next=await iterator.next();if(next.done)break;
        const child=budget.record(next.value[0]);
        if(items.length>=20){more=true;break;}
        position=child;scanned++;
        if(child.taxonomy!=="category" || !(await allowed(ctx,child.slug,budget)))continue;
        items.push(label(child));
      }
    }finally{await iterator.return(undefined);}
    return {...binding,items,cursor:args.cursor??null,nextCursor:more&&position?JSON.stringify({version:1,binding:signature,termId:position._id,positionHash:positionHash(position)}):null,resetRequired:false};
  }),
});
