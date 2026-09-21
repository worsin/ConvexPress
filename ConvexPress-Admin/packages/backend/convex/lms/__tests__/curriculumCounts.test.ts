import { expect, test } from "bun:test";
import { convexTest } from "convex-test";
import schema from "../../schema";
import { readCurriculumCounts } from "../curriculumCounts";
import { rebuildCurriculumCounts } from "../curriculumCountRecovery";
import { RequestReadLedger } from "../../helpers/requestReadLedger";
import {
  insertWithMediaReferences, patchWithMediaReferences, replaceWithMediaReferences, deleteWithMediaReferences,
  insertDynamicWithMediaReferences, patchDynamicWithMediaReferences, deleteDynamicWithMediaReferences,
} from "../../media/attachmentGuard";
import { write as writePromoted } from "../../contentPromotion/shared";
const modules = { "./convex/_generated/api.js": () => import("../../_generated/api.js"), "./convex/_generated/server.js": () => import("../../_generated/server.js") };
async function fixture() {
  const t = convexTest({schema,modules});
  const ids = await t.run(async ctx => {
    const user = await ctx.db.insert("users", {authSource:"local",email:"curriculum@example.invalid",emailVerified:true,status:"active",createdAt:1,updatedAt:1});
    const course = await insertWithMediaReferences(ctx,"lms_courses",{title:"Studio",slug:"studio",status:"published",authorId:user,createdAt:1,updatedAt:1});
    const other = await insertWithMediaReferences(ctx,"lms_courses",{title:"Other",slug:"other",status:"published",authorId:user,createdAt:1,updatedAt:1});
    return {user,course,other};
  });
  return {t,ids,node:(kind:"lesson"|"topic"|"section_heading"="lesson")=>({courseId:ids.course,kind,title:"Lesson",position:1,createdAt:1,updatedAt:1})};
}

test("legacy recovery refuses partial denominators, resumes across concurrent mutations and is idempotent",async()=>{
 const {t,ids,node}=await fixture();
 const old=await t.run(async ctx=>{
  const rows=[];for(let i=0;i<27;i++)rows.push(await ctx.db.insert("lms_nodes",{...node(i%3===0?"topic":"lesson"),position:i}));
  return rows;
 });
 expect(await t.run(ctx=>readCurriculumCounts(ctx,ids.course))).toEqual({state:"preparing"});
 expect(await t.run(rebuildCurriculumCounts)).toEqual({processed:10,done:false});
 await t.run(ctx=>patchWithMediaReferences(ctx,"lms_nodes",old[11],{kind:"topic"}));
 await t.run(ctx=>deleteWithMediaReferences(ctx,"lms_nodes",old[20]));
 await t.run(ctx=>insertWithMediaReferences(ctx,"lms_nodes",node()));
 expect(await t.run(ctx=>readCurriculumCounts(ctx,ids.course))).toEqual({state:"preparing"});
 while(!(await t.run(rebuildCurriculumCounts)).done){}
 const actual=await t.run(async ctx=>{
  const nodes=await ctx.db.query("lms_nodes").withIndex("by_course",q=>q.eq("courseId",ids.course)).collect();
  const counts=await readCurriculumCounts(ctx,ids.course);
  return {counts,lessons:nodes.filter(n=>n.kind==="lesson").length,topics:nodes.filter(n=>n.kind==="topic").length,course:await ctx.db.get(ids.course)};
 });
 expect(actual.counts).toMatchObject({state:"ready",lessons:actual.lessons,topics:actual.topics});
 expect(actual.course).toMatchObject({lessonCount:actual.lessons,topicCount:actual.topics});
 expect(await t.run(rebuildCurriculumCounts)).toEqual({processed:0,done:true});
 expect(await t.run(ctx=>readCurriculumCounts(ctx,ids.course))).toEqual(actual.counts);
});

test("typed, dynamic and promotion writes count local contributions rather than copied markers",async()=>{
 const {t,ids,node}=await fixture();
 const id=await t.run(ctx=>insertWithMediaReferences(ctx,"lms_nodes",{...node(),curriculumCountVersion:1}));
 await t.run(ctx=>patchWithMediaReferences(ctx,"lms_nodes",id,{title:"Rename only"}));
 await t.run(ctx=>replaceWithMediaReferences(ctx,"lms_nodes",id,{...node("topic"),courseId:ids.other}));
 expect(await t.run(ctx=>readCurriculumCounts(ctx,ids.course))).toMatchObject({lessons:0,topics:0});
 expect(await t.run(ctx=>readCurriculumCounts(ctx,ids.other))).toMatchObject({lessons:0,topics:1});
 const dynamic=await t.run(ctx=>insertDynamicWithMediaReferences(ctx,"lms_nodes",{...node(),curriculumCountVersion:1}));
 await t.run(ctx=>patchDynamicWithMediaReferences(ctx,dynamic,{kind:"section_heading",curriculumCountVersion:undefined}));
 const promoted=await t.run(ctx=>writePromoted(ctx,"courseNode",null,{...node(),curriculumCountVersion:1}));
 await t.run(ctx=>writePromoted(ctx,"courseNode",promoted,{kind:"topic"}));
 expect(await t.run(ctx=>readCurriculumCounts(ctx,ids.course))).toMatchObject({lessons:0,topics:1});
 await t.run(ctx=>deleteDynamicWithMediaReferences(ctx,dynamic));
 await t.run(ctx=>deleteDynamicWithMediaReferences(ctx,promoted));
 await t.run(ctx=>deleteWithMediaReferences(ctx,"lms_nodes",id));
 expect(await t.run(ctx=>readCurriculumCounts(ctx,ids.course))).toMatchObject({lessons:0,topics:0});
 expect(await t.run(ctx=>readCurriculumCounts(ctx,ids.other))).toMatchObject({lessons:0,topics:0});
});

test("large ready curricula use two queries without reading lesson bodies and cannot accept imported cached counts",async()=>{
 const {t,ids,node}=await fixture();
 for(let batch=0;batch<10;batch++)await t.run(async ctx=>{
  for(let i=0;i<100;i++)await insertWithMediaReferences(ctx,"lms_nodes",{...node(),position:batch*100+i,bodyDoc:{text:"x".repeat(2000)}});
 });
 const ledger=new RequestReadLedger({queries:2,documents:2,bytes:1024,documentBytes:1024});
 expect(await t.run(ctx=>readCurriculumCounts(ctx,ids.course,ledger))).toMatchObject({state:"ready",lessons:1000,topics:0});
 expect(ledger.documents).toBe(1);
 await t.run(ctx=>patchWithMediaReferences(ctx,"lms_courses",ids.course,{lessonCount:99999,topicCount:123}));
 expect(await t.run(ctx=>ctx.db.get(ids.course))).toMatchObject({lessonCount:1000,topicCount:0});
});

test("missing or inconsistent aggregate state rolls a source edit back instead of publishing negative totals",async()=>{
 const {t,ids,node}=await fixture();
 const id=await t.run(ctx=>insertWithMediaReferences(ctx,"lms_nodes",node()));
 await t.run(async ctx=>{const row=await ctx.db.query("lms_curriculum_counts").first();await ctx.db.delete(row!._id);});
 expect(await t.run(ctx=>readCurriculumCounts(ctx,ids.course))).toEqual({state:"preparing"});
 await expect(t.run(ctx=>deleteWithMediaReferences(ctx,"lms_nodes",id))).rejects.toThrow("Curriculum counts require repair");
 expect(await t.run(ctx=>ctx.db.get(id))).not.toBeNull();
});


test("heading-only and empty curricula distinguish zero lessons from missing derived state",async()=>{
 const {t,ids,node}=await fixture();
 expect(await t.run(ctx=>readCurriculumCounts(ctx,ids.course))).toMatchObject({state:"ready",lessons:0,topics:0});
 const heading=await t.run(ctx=>insertWithMediaReferences(ctx,"lms_nodes",node("section_heading")));
 expect(await t.run(ctx=>readCurriculumCounts(ctx,ids.course))).toMatchObject({state:"ready",lessons:0,topics:0});
 await t.run(ctx=>deleteWithMediaReferences(ctx,"lms_nodes",heading));
 expect(await t.run(ctx=>readCurriculumCounts(ctx,ids.course))).toMatchObject({state:"ready",lessons:0,topics:0});
});
