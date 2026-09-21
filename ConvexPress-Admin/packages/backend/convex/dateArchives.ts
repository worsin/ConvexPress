import { v } from "convex/values";
import { z } from "zod";
import { query } from "./_generated/server";
import { RequestReadLedger } from "./helpers/requestReadLedger";
import { evaluateMembershipAccess } from "./membership/access";
import { canonicalBoundary } from "./canonicalDocuments/service";
import { CanonicalDataError } from "./canonicalDocuments/foundation/contracts";
import { archiveYearSchema,archiveMonthSchema,dateArchiveResultSchema } from "./canonicalDocuments/foundation/archiveContracts";
import { archiveTimeZone,readDateArchiveGroups,readDateArchivePosts } from "./canonicalDocuments/dateArchive";
const input=z.strictObject({instanceKey:z.string().min(1).max(128),year:archiveYearSchema.optional(),month:archiveMonthSchema.optional(),cursor:z.string().min(1).max(4096).optional(),refreshKey:z.string().min(1).max(128).optional()}).refine(args=>args.month===undefined||args.year!==undefined,"A month requires a year");
const nullableString=v.union(v.string(),v.null());
export const read=query({
 args:{instanceKey:v.string(),year:v.optional(v.number()),month:v.optional(v.number()),cursor:v.optional(v.string()),refreshKey:v.optional(v.string())},
 returns:v.union(v.null(),v.object({scope:v.object({websiteKey:v.string(),instanceKey:v.string()}),viewerSubject:nullableString,year:v.union(v.number(),v.null()),month:v.union(v.number(),v.null()),timeZone:v.string(),groups:v.array(v.object({year:v.number(),month:v.union(v.number(),v.null()),href:v.string()})),items:v.array(v.object({id:v.string(),title:v.string(),href:v.string(),excerpt:nullableString,publishedAt:v.number(),image:v.union(v.null(),v.object({src:v.string(),alt:v.string()}))})),cursor:nullableString,nextCursor:nullableString,resetRequired:v.boolean()})),
 handler:(ctx,raw)=>canonicalBoundary(async()=>{
  const args=input.parse(raw),budget=new RequestReadLedger();
  budget.beforeRead();const identity=budget.record(await ctx.db.query("convexpress_siteIdentity").withIndex("by_identity_key",q=>q.eq("identityKey","site-identity")).unique());
  if(!identity||identity.instanceKey!==args.instanceKey)throw new CanonicalDataError("SCOPE_MISMATCH","instanceKey","Archive belongs to another environment");
  if(!(await evaluateMembershipAccess(ctx,{resourceType:"route",resourceIdOrKey:"/archive"},budget)).allowed)return null;
  const common={scope:{websiteKey:identity.websiteKey,instanceKey:identity.instanceKey},viewerSubject:(await ctx.auth.getUserIdentity())?.subject??null,year:args.year??null,month:args.month??null,cursor:args.cursor??null};
  try {
   if(args.year===undefined){const result=await readDateArchiveGroups(ctx,{groupBy:"month",limit:24,cursor:args.cursor??null},common.scope,"/archive",budget);return dateArchiveResultSchema.parse({...common,timeZone:result.timeZone,groups:result.items,items:[],nextCursor:result.nextCursor,resetRequired:false});}
   budget.beforeRead();const reading=budget.record(await ctx.db.query("settings").withIndex("by_section",q=>q.eq("section","reading")).unique());
   const limit=z.number().int().min(1).max(48).parse(Math.min(48,typeof reading?.values.postsPerPage==="number"?reading.values.postsPerPage:10));
   const result=await readDateArchivePosts(ctx,{year:args.year,month:args.month??null,cursor:args.cursor??null,limit},common.scope,budget);
   return dateArchiveResultSchema.parse({...common,timeZone:result.timeZone,groups:[],items:result.items,nextCursor:result.nextCursor,resetRequired:false});
  }catch(error){if(args.cursor&&error instanceof CanonicalDataError&&error.code==="ARCHIVE_CURSOR_SCOPE")return {...common,timeZone:await archiveTimeZone(ctx,budget),groups:[],items:[],nextCursor:null,resetRequired:true};throw error;}
 }),
});
