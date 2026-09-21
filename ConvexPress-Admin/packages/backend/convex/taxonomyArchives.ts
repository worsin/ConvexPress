/** Public tag archive. The cursor changes position, never identity or access. */
import { v } from "convex/values";
import { z } from "zod";
import { query } from "./_generated/server";
import { RequestReadLedger } from "./helpers/requestReadLedger";
import { evaluateMembershipAccess } from "./membership/access";
import { readPostArchive } from "./canonicalDocuments/postGrid";
import { CanonicalDataError } from "./canonicalDocuments/foundation/contracts";
import { canonicalBoundary } from "./canonicalDocuments/service";
const input = z.strictObject({ slug:z.string().min(1).max(256), instanceKey:z.string().min(1).max(128), cursor:z.string().min(1).max(4096).optional(),refreshKey:z.string().min(1).max(128).optional() });
const image = v.union(v.null(),v.object({src:v.string(),alt:v.string()}));
export const tag = query({
  args:{slug:v.string(),instanceKey:v.string(),cursor:v.optional(v.string()),refreshKey:v.optional(v.string())},
  returns:v.union(v.null(),v.object({
    scope:v.object({websiteKey:v.string(),instanceKey:v.string()}),viewerSubject:v.union(v.string(),v.null()),slug:v.string(),
    tag:v.union(v.null(),v.object({id:v.id("terms"),name:v.string(),slug:v.string(),description:v.union(v.string(),v.null())})),
    items:v.array(v.object({id:v.string(),title:v.string(),href:v.string(),excerpt:v.union(v.string(),v.null()),publishedAt:v.number(),author:v.union(v.string(),v.null()),image})),
    cursor:v.union(v.string(),v.null()),nextCursor:v.union(v.string(),v.null()),resetRequired:v.boolean(),
  })),
  handler:(ctx,raw)=>canonicalBoundary(async()=>{
    const args=input.parse(raw),budget=new RequestReadLedger();
    budget.beforeRead();const identity=budget.record(await ctx.db.query("convexpress_siteIdentity").withIndex("by_identity_key",q=>q.eq("identityKey","site-identity")).unique());
    if(!identity || identity.instanceKey!==args.instanceKey) throw new CanonicalDataError("SCOPE_MISMATCH","instanceKey","This archive belongs to another site environment");
    const viewerSubject=(await ctx.auth.getUserIdentity())?.subject??null;
    const scope={websiteKey:identity.websiteKey,instanceKey:identity.instanceKey};
    const path=`/tag/${encodeURIComponent(args.slug)}`;
    if(!(await evaluateMembershipAccess(ctx,{resourceType:"route",resourceIdOrKey:path},budget)).allowed)return null;
    budget.beforeRead();const term=budget.record(await ctx.db.query("terms").withIndex("by_slug_taxonomy",q=>q.eq("slug",args.slug).eq("taxonomy","post_tag")).unique());
    if(!term)return null;
    budget.beforeRead();const reading=budget.record(await ctx.db.query("settings").withIndex("by_section",q=>q.eq("section","reading")).unique());
    const configured=(reading?.values as {postsPerPage?:unknown}|undefined)?.postsPerPage;
    const limit=configured===undefined?10:z.number().int().min(1).max(100).parse(configured);
    try {
      const page=await readPostArchive(ctx,{query:{tag:term._id},limit,cursor:args.cursor??null},scope,path,budget);
      // On scan-only/end pages there is no evidence of a currently accessible
      // story, so do not disclose term metadata just because a cursor exists.
      const summary=page.items.length?{id:term._id,name:term.name,slug:term.slug,description:term.description??null}:null;
      if(summary && (summary.name.length>512 || (summary.description?.length??0)>8192))throw new CanonicalDataError("ARCHIVE_SUMMARY_BUDGET","tag","The tag summary exceeds its display budget");
      return {scope,viewerSubject,slug:args.slug,tag:summary,...page,resetRequired:false};
    } catch(error) {
      if(args.cursor && error instanceof CanonicalDataError && error.code==="POST_CURSOR_SCOPE")
        return {scope,viewerSubject,slug:args.slug,tag:null,items:[],cursor:args.cursor,nextCursor:null,resetRequired:true};
      throw error;
    }
  }),
});
