import { streamQuery } from "convex-helpers/server/pagination";
import { getDocumentSize } from "convex/values";
import type { WithoutSystemFields } from "convex/server";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import schema from "../schema";
import type { RequestReadLedger } from "./requestReadLedger";

type Context = Pick<MutationCtx, "db">;
type Entry = Pick<Doc<"form_submissions">, "_id" | "_creationTime" | "formId" | "status">;
type State = Doc<"formSubmissionCounts">;
export type FormCountTask = { formId: Id<"forms">; generation: number; afterTime: number | null; afterId: string | null };
export const FORM_COUNT_PAGE_ROWS = 32, FORM_COUNT_PAGE_BYTES = 512 * 1024;
const taskFor = (state: Pick<State, "formId" | "generation" | "frontierTime" | "frontierId">): FormCountTask => ({formId: state.formId, generation: state.generation, afterTime: state.frontierTime, afterId: state.frontierId});
const baseline = (formId: Id<"forms">) => ({formId, phase: "pending" as const, generation: 0, count: 0, updatedAt: Date.now(), frontierTime: null, frontierId: null, horizonTime: null, horizonId: null});
async function stateFor(ctx: Pick<QueryCtx, "db">, formId: Id<"forms">, budget?: RequestReadLedger) {
 budget?.beforeRead();const state=await ctx.db.query("formSubmissionCounts").withIndex("by_form",q=>q.eq("formId",formId)).unique();budget?.record(state);return state;
}
export async function readCompletedFormCount(ctx: Pick<QueryCtx,"db">, formId:Id<"forms">, budget?:RequestReadLedger):Promise<number|null> {
 const state=await stateFor(ctx,formId,budget);
 return state?.phase==="ready" && Number.isSafeInteger(state.count) && state.count>=0 ? state.count : null;
}
/** Call only in the transaction creating a new empty form. Imported/restored
 * forms instead use the resumable scan and cannot declare their own count. */
export async function initializeEmptyFormCount(ctx:Context,formId:Id<"forms">) {
 if(await stateFor(ctx,formId))throw Error("Form count already exists");
 await ctx.db.insert("formSubmissionCounts",{...baseline(formId),phase:"ready"});
 await ctx.db.patch("forms",formId,{submissionCountReady:true});
}
function compare(entry:Entry,time:number,id:string) {
 return entry._creationTime===time ? (entry._id===id?0:entry._id<id?-1:1) : entry._creationTime<time?-1:1;
}
function included(state:State,entry:Entry|null,formId:Id<"forms">) {
 if(!entry || entry.formId!==formId || entry.status!=="complete")return 0;
 if(state.phase==="ready")return 1;
 if(state.phase!=="scanning")return 0;
 // Scanned rows and writes after the fixed horizon are already represented.
 // Remaining original rows will be counted when their page is scanned.
 return (state.frontierTime!==null && state.frontierId!==null && compare(entry,state.frontierTime,state.frontierId)<=0)
  || (state.horizonTime!==null && state.horizonId!==null && compare(entry,state.horizonTime,state.horizonId)>0) ? 1:0;
}
export async function adjustFormSubmissionCount(ctx:Context,previous:Entry|null,next:Entry|null) {
 if(previous?.formId===next?.formId && previous?.status===next?.status)return;
 const forms=new Set([previous?.formId,next?.formId].filter((id):id is Id<"forms">=>!!id));
 for(const formId of forms) {
  const state=await stateFor(ctx,formId);
  if(!state) {
   if(!await ctx.db.get("forms",formId))continue;
   await ctx.db.insert("formSubmissionCounts",baseline(formId));await ctx.db.patch("forms",formId,{submissionCountReady:false});continue;
  }
  const count=state.count+included(state,next,formId)-included(state,previous,formId);
  if(!Number.isSafeInteger(count)||count<0) {
   await ctx.db.patch("formSubmissionCounts",state._id,{phase:"pending",generation:state.generation+1,updatedAt:Date.now()});
   await ctx.db.patch("forms",formId,{submissionCountReady:false});
  } else if(count!==state.count) {
   // Preserve progress time so writes cannot indefinitely postpone recovery of
   // a lost scheduler continuation on a busy form.
   await ctx.db.patch("formSubmissionCounts",state._id,{count});
  }
 }
}
export async function insertCountedFormSubmission(ctx:Context,value:WithoutSystemFields<Doc<"form_submissions">>) {
 const id=await ctx.db.insert("form_submissions",value);const row=await ctx.db.get("form_submissions",id);
 await adjustFormSubmissionCount(ctx,null,row);return id;
}
export async function patchCountedFormSubmission(ctx:Context,id:Id<"form_submissions">,value:Partial<WithoutSystemFields<Doc<"form_submissions">>>) {
 if(!Object.prototype.hasOwnProperty.call(value,"status")&&!Object.prototype.hasOwnProperty.call(value,"formId"))return ctx.db.patch("form_submissions",id,value);
 const old=await ctx.db.get("form_submissions",id);await ctx.db.patch("form_submissions",id,value);
 await adjustFormSubmissionCount(ctx,old,old?{...old,...value}:null);
}
export async function deleteCountedFormSubmission(ctx:Context,id:Id<"form_submissions">) {
 const old=await ctx.db.get("form_submissions",id);await ctx.db.delete("form_submissions",id);await adjustFormSubmissionCount(ctx,old,null);
}
export async function beginFormCountRepair(ctx:Context,formId:Id<"forms">,force=false):Promise<FormCountTask|null> {
 const state=await stateFor(ctx,formId),form=await ctx.db.get("forms",formId);
 if(!form){if(state)await ctx.db.delete("formSubmissionCounts",state._id);return null;}
 if(state?.phase==="ready"&&form.submissionCountReady===true&&!force)return null;
 if(state?.phase==="scanning"&&!force)return taskFor(state);
 const horizon=await ctx.db.query("form_submissions").withIndex("by_form",q=>q.eq("formId",formId)).order("desc").first();
 const next={...baseline(formId),generation:(state?.generation??0)+1,phase:horizon?"scanning" as const:"ready" as const,horizonTime:horizon?._creationTime??null,horizonId:horizon?._id??null};
 if(state)await ctx.db.patch("formSubmissionCounts",state._id,next);else await ctx.db.insert("formSubmissionCounts",next);
 await ctx.db.patch("forms",formId,{submissionCountReady:!horizon});
 return horizon?taskFor(next):null;
}
/** The helper's index key includes _creationTime and _id. A fixed end key plus
 * same-transaction deltas avoids restarting a large scan when new entries arrive. */
export async function advanceFormCountRepair(ctx:Context,task:FormCountTask):Promise<FormCountTask|null> {
 const state=await stateFor(ctx,task.formId);
 if(!state||state.phase!=="scanning"||state.generation!==task.generation||state.frontierTime!==task.afterTime||state.frontierId!==task.afterId)return null;
 if(!await ctx.db.get("forms",task.formId)){await ctx.db.delete("formSubmissionCounts",state._id);return null;}
 if(state.horizonTime===null||state.horizonId===null)throw Error("Missing form count horizon");
 // At a full final batch the frontier is already the fixed end key. Do not
 // reopen that key: an equal-bound stream can yield the endpoint again.
 if(task.afterTime===state.horizonTime&&task.afterId===state.horizonId){
  await ctx.db.patch("formSubmissionCounts",state._id,{phase:"ready",updatedAt:Date.now()});
  await ctx.db.patch("forms",task.formId,{submissionCountReady:true});return null;
 }
 const iterator=streamQuery(ctx,{schema,table:"form_submissions",index:"by_form",order:"asc",
  startIndexKey:task.afterTime===null?[task.formId]:[task.formId,task.afterTime,task.afterId!],startInclusive:task.afterTime===null,
  endIndexKey:[task.formId,state.horizonTime,state.horizonId],endInclusive:true});
 let rows=0,bytes=0,count=state.count,frontierTime=state.frontierTime,frontierId=state.frontierId,done=false;
 try {while(rows<FORM_COUNT_PAGE_ROWS&&bytes<FORM_COUNT_PAGE_BYTES){
  const next=await iterator.next();if(next.done){done=true;break;}
  const entry=next.value[0];rows++;bytes+=getDocumentSize(entry);if(entry.status==="complete")count++;
  frontierTime=entry._creationTime;frontierId=entry._id;
 }}finally{await iterator.return(undefined);}
 if(!Number.isSafeInteger(count))throw Error("Form count exceeds supported integer range");
 await ctx.db.patch("formSubmissionCounts",state._id,{count,frontierTime,frontierId,phase:done?"ready":"scanning",updatedAt:Date.now()});
 if(done){await ctx.db.patch("forms",task.formId,{submissionCountReady:true});return null;}
 return taskFor({...state,frontierTime,frontierId});
}
