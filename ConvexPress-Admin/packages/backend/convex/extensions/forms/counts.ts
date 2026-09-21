import { makeFunctionReference } from "convex/server";
import { v } from "convex/values";
import { internalMutation, type MutationCtx } from "../../_generated/server";
import { beginFormCountRepair, advanceFormCountRepair, type FormCountTask } from "../../helpers/formSubmissionCounts";
const pageRef=makeFunctionReference<"mutation",FormCountTask>("extensions/forms/counts:page");
const sweepRef=makeFunctionReference<"mutation",Record<string,never>>("extensions/forms/counts:sweep");
async function schedule(ctx:MutationCtx,task:FormCountTask|null){if(task)await ctx.scheduler.runAfter(0,pageRef,task);}
export const request=internalMutation({args:{formId:v.id("forms"),force:v.optional(v.boolean())},returns:v.null(),handler:async(ctx,args)=>{await schedule(ctx,await beginFormCountRepair(ctx,args.formId,args.force));return null;}});
export const page=internalMutation({args:{formId:v.id("forms"),generation:v.number(),afterTime:v.union(v.number(),v.null()),afterId:v.union(v.string(),v.null())},returns:v.null(),handler:async(ctx,args)=>{await schedule(ctx,await advanceFormCountRepair(ctx,args));return null;}});
export const sweep=internalMutation({args:{},returns:v.null(),handler:async ctx=>{
 const legacy=await ctx.db.query("forms").withIndex("by_submission_count_ready",q=>q.eq("submissionCountReady",undefined)).paginate({cursor:null,numItems:8,maximumRowsRead:8,maximumBytesRead:512*1024});
 for(const form of legacy.page)await schedule(ctx,await beginFormCountRepair(ctx,form._id));
 const pending=await ctx.db.query("formSubmissionCounts").withIndex("by_phase_updated",q=>q.eq("phase","pending")).take(8);
 for(const state of pending)await schedule(ctx,await beginFormCountRepair(ctx,state.formId));
 const stalled=await ctx.db.query("formSubmissionCounts").withIndex("by_phase_updated",q=>q.eq("phase","scanning").lte("updatedAt",Date.now()-60_000)).take(8);
 for(const state of stalled)await schedule(ctx,await beginFormCountRepair(ctx,state.formId));
 if(!legacy.isDone)await ctx.scheduler.runAfter(500,sweepRef,{});return null;
}});
