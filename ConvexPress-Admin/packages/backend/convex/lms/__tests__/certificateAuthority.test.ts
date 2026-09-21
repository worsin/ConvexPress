import {test,expect} from "bun:test";
import {convexTest} from "convex-test";
import {makeFunctionReference} from "convex/server";
import schema from "../../schema";
import {insertWithMediaReferences} from "../../media/attachmentGuard";
import {insertCountedProgress} from "../progress/counts";
const modules={
 "./convex/_generated/api.js":()=>import("../../_generated/api.js"),
 "./convex/_generated/server.js":()=>import("../../_generated/server.js"),
 "./convex/lms/progress/mutations.ts":()=>import("../progress/mutations"),
 "./convex/lms/certificates/mutations.ts":()=>import("../certificates/mutations"),
 "./convex/lms/certificates/queries.ts":()=>import("../certificates/queries"),
 "./convex/lms/certificates/actions.ts":()=>import("../certificates/actions"),
 "./convex/media/internals.ts":()=>import("../../media/internals"),
 "./convex/media/referenceReads.ts":()=>import("../../media/referenceReads"),
 "./convex/membership/policyReads.ts":()=>import("../../membership/policyReads"),
};
const ref=(name:string)=>makeFunctionReference<any,any,any>(name);
async function fixture(kind?:"administrator"|"progress",revoker=false){
 const t=convexTest({schema,modules});
 const ids=await t.run(async ctx=>{
  const role=await ctx.db.insert("roles",{name:"Learner",slug:"learner",description:"Fixture",level:20,type:"customer",isDefault:true,isProtected:false,capabilities:[],pageAccess:[],status:"active",createdAt:1,updatedAt:1});
  const adminRole=await ctx.db.insert("roles",{name:"Certificate admin",slug:"certificate-admin",description:"Fixture",level:100,type:"internal",isDefault:false,isProtected:false,capabilities:["lms.certificate.manage"],pageAccess:[],status:"active",createdAt:1,updatedAt:1});
  const user=await ctx.db.insert("users",{authSource:"local",email:"learner@example.invalid",emailVerified:true,roleId:role,status:"active",createdAt:1,updatedAt:1});
  const admin=await ctx.db.insert("users",{authSource:"local",email:"cert-admin@example.invalid",emailVerified:true,roleId:adminRole,status:"active",createdAt:1,updatedAt:1});
  await ctx.db.insert("settings",{section:"plugins",values:{lmsEnabled:true,membershipEnabled:true},updatedBy:admin,updatedAt:1});
  const certificate=await insertWithMediaReferences(ctx,"lms_certificates",{title:"Completion",templateDoc:{},orientation:"landscape",isActive:true,createdBy:admin,createdAt:1,updatedAt:1});
  const course=await insertWithMediaReferences(ctx,"lms_courses",{title:"Course",slug:"course",status:"published",accessMode:"open",progressionMode:"free_form",authorId:admin,certificateId:certificate,createdAt:1,updatedAt:1});
  const lesson=await insertWithMediaReferences(ctx,"lms_nodes",{courseId:course,kind:"lesson",title:"Lesson",position:1,createdAt:1,updatedAt:1});
  await insertCountedProgress(ctx,{userId:user,courseId:course,nodeId:lesson,completed:true});
  await ctx.db.insert("lms_course_completions",{userId:user,courseId:course,completedAt:1,percent:100});
  const issue=await insertWithMediaReferences(ctx,"lms_certificate_issues",{userId:user,courseId:course,certificateId:certificate,serial:"CERT-ORIGINAL",issuedAt:1,status:"revoked",revokedAt:2,revocationKind:kind,revokedBy:revoker?admin:undefined,revocationReason:"Fixture revocation"});
  return{user,admin,course,lesson,issue};
 });
 const identity=(id:string)=>t.withIdentity({subject:id,issuer:"https://convexpress-admin.local",tokenIdentifier:"https://convexpress-admin.local|"+id});
 return{t,ids,learner:identity(ids.user),admin:identity(ids.admin),issue:()=>t.run(ctx=>ctx.db.get(ids.issue))};
}
test("administrator revocation survives completion, heartbeats and learner self-service issuance",async()=>{
 const f=await fixture("administrator",true),before=await f.issue();
 await f.learner.mutation(ref("lms/progress/mutations:markComplete"),{nodeId:f.ids.lesson});
 await f.learner.mutation(ref("lms/progress/mutations:recordHeartbeat"),{nodeId:f.ids.lesson,timeSpentSec:60});
 await expect(f.learner.mutation(ref("lms/certificates/mutations:issueCertificate"),{courseId:f.ids.course})).rejects.toThrow("Only a certificate administrator");
 expect(await f.issue()).toEqual(before);
 await expect(f.learner.mutation(ref("lms/certificates/mutations:reissueIssue"),{issueId:f.ids.issue})).rejects.toThrow();
 await f.admin.mutation(ref("lms/certificates/mutations:reissueIssue"),{issueId:f.ids.issue});
 expect(await f.issue()).toMatchObject({status:"issued"});
 expect((await f.issue())?.revocationKind).toBeUndefined();
});
test("explicit progress rollback can recover, but an admin can make that revocation final before recompletion",async()=>{
 const f=await fixture("progress");
 await f.admin.mutation(ref("lms/certificates/mutations:revokeIssue"),{issueId:f.ids.issue,reason:"Administrative review"});
 expect(await f.issue()).toMatchObject({status:"revoked",revocationKind:"administrator",revokedBy:f.ids.admin});
 await f.learner.mutation(ref("lms/progress/mutations:markComplete"),{nodeId:f.ids.lesson});
 expect((await f.issue())?.status).toBe("revoked");
 const automatic=await fixture("progress");
 await automatic.learner.mutation(ref("lms/progress/mutations:markComplete"),{nodeId:automatic.ids.lesson});
 expect(await automatic.issue()).toMatchObject({status:"issued"});
 await automatic.learner.mutation(ref("lms/progress/mutations:markIncomplete"),{nodeId:automatic.ids.lesson});
 expect(await automatic.issue()).toMatchObject({status:"revoked",revocationKind:"progress"});
});
test("legacy unknown provenance and mixed administrator metadata fail closed",async()=>{
 for(const [kind,revoker] of [[undefined,false],["progress",true]] as const){
  const f=await fixture(kind,revoker),before=await f.issue();
  await f.learner.mutation(ref("lms/progress/mutations:markComplete"),{nodeId:f.ids.lesson});
  await expect(f.learner.mutation(ref("lms/certificates/mutations:issueCertificate"),{courseId:f.ids.course})).rejects.toThrow("Only a certificate administrator");
  expect(await f.issue()).toEqual(before);
 }
});
test("learner self-service can resume explicit progress rollback and accepts only exact recorded completion",async()=>{
 const f=await fixture("progress");
 await f.learner.mutation(ref("lms/certificates/mutations:issueCertificate"),{courseId:f.ids.course});
 expect((await f.issue())?.status).toBe("issued");
 await f.t.run(async ctx=>{const rec=await ctx.db.query("lms_course_completions").first();await ctx.db.patch(rec!._id,{percent:101});});
 await expect(f.admin.mutation(ref("lms/certificates/mutations:reissueIssue"),{issueId:f.ids.issue})).rejects.toThrow("Course not completed");
});

const renderRef=ref("lms/certificates/actions:renderCertificatePdf");
const payloadRef=ref("lms/certificates/actions:getRenderPayload");
const attachRef=ref("lms/certificates/actions:attachPdfMedia");
function issuance(payload:any){
 const {serial,issuedAt,certificateId,userId,courseId}=payload;
 return {serial,issuedAt,certificateId,userId,courseId};
}
test("a PDF started before revoke and reissue cannot create media or attach to the new issuance",async()=>{
 const f=await fixture("progress");
 await f.learner.mutation(ref("lms/certificates/mutations:issueCertificate"),{courseId:f.ids.course});
 const old=await f.t.query(payloadRef,{issueId:f.ids.issue});
 const storageId=await f.t.run(ctx=>ctx.storage.store(new Blob(["old pdf"],{type:"application/pdf"})));
 await f.admin.mutation(ref("lms/certificates/mutations:revokeIssue"),{issueId:f.ids.issue});
 await f.admin.mutation(ref("lms/certificates/mutations:reissueIssue"),{issueId:f.ids.issue});
 const current=await f.t.query(payloadRef,{issueId:f.ids.issue});
 expect(current.serial).not.toBe(old.serial);
 const args={issueId:f.ids.issue,expected:issuance(old),storageId,fileSize:7,fileName:"certificate.pdf",uploadedBy:f.ids.admin};
 expect(await f.t.mutation(attachRef,args)).toBeNull();
 expect((await f.issue())?.pdfMediaId).toBeUndefined();
 expect(await f.t.run(ctx=>ctx.db.query("media").collect())).toHaveLength(0);
 const mediaId=await f.t.mutation(attachRef,{...args,expected:issuance(current)});
 expect(mediaId).toBeTruthy();
 expect((await f.issue())?.pdfMediaId).toBe(mediaId);
 expect(await f.t.mutation(attachRef,{...args,expected:issuance(current)})).toBeNull();
 expect(await f.t.run(ctx=>ctx.db.query("media").collect())).toHaveLength(1);
});
test("registered PDF action stores one PDF for the current issuance and skips repeat rendering",async()=>{
 const f=await fixture("progress");
 await f.learner.mutation(ref("lms/certificates/mutations:issueCertificate"),{courseId:f.ids.course});
 const result=await f.t.action(renderRef,{issueId:f.ids.issue});
 expect(result.ok).toBe(true);
 const pdf=await f.t.run(async ctx=>{
  const media=await ctx.db.get(result.mediaId);
  const blob=await ctx.storage.get(media!.storageId!);
  return {media,text:await blob!.text()};
 });
 expect(pdf.media).toMatchObject({mimeType:"application/pdf",status:"active"});
 expect(pdf.text.startsWith("%PDF-1.4")).toBe(true);
 expect(pdf.text.endsWith("%%EOF\n")).toBe(true);
 expect((await f.issue())?.pdfMediaId).toBe(result.mediaId);
 expect(await f.t.action(renderRef,{issueId:f.ids.issue})).toEqual({ok:false,reason:"not_renderable"});
 expect(await f.t.run(ctx=>ctx.db.query("media").collect())).toHaveLength(1);
});
test("legacy PDF attachment without issuance proof fails closed",async()=>{
 const f=await fixture("progress");
 await f.learner.mutation(ref("lms/certificates/mutations:issueCertificate"),{courseId:f.ids.course});
 expect(await f.t.mutation(attachRef,{issueId:f.ids.issue})).toBeNull();
 expect((await f.issue())?.pdfMediaId).toBeUndefined();
});

test("public code verification omits private identity data and rejects revoked or ambiguous serials",async()=>{
 const f=await fixture("progress");
 await f.learner.mutation(ref("lms/certificates/mutations:issueCertificate"),{courseId:f.ids.course});
 const issue=(await f.issue())!;
 const verify=(serial:string)=>f.t.query(ref("lms/certificates/queries:verifyPublicCode"),{serial});
 const value=await verify("  "+issue.serial.toLowerCase()+"  ");
 expect(value).toMatchObject({state:"valid",holderName:"Certificate holder",serial:issue.serial});
 expect(Object.keys(value).sort()).toEqual(["certificateTitle","courseTitle","holderName","issuedAt","pdfUrl","serial","state"]);
 expect(JSON.stringify(value)).not.toContain("learner@example.invalid");
 expect(JSON.stringify(value)).not.toContain(f.ids.user);
 expect(await verify("CERT-"+"A".repeat(1000))).toEqual({state:"unverified"});
 expect(await verify("bad code")).toEqual({state:"unverified"});
 await f.admin.mutation(ref("lms/certificates/mutations:revokeIssue"),{issueId:f.ids.issue});
 expect(await verify(issue.serial)).toEqual({state:"unverified"});
 await f.admin.mutation(ref("lms/certificates/mutations:reissueIssue"),{issueId:f.ids.issue});
 const fresh=(await f.issue())!;
 await f.t.run(async ctx=>{const {_id,_creationTime,...doc}=fresh;await insertWithMediaReferences(ctx,"lms_certificate_issues",doc);});
 expect(await verify(fresh.serial)).toEqual({state:"unverified"});
 expect(await f.t.query(ref("lms/certificates/queries:verifyBySerial"),{serial:fresh.serial})).toEqual({valid:false});
});
test("public verifier hides unavailable plugins and never exposes email-shaped display names",async()=>{
 const f=await fixture("progress");
 await f.learner.mutation(ref("lms/certificates/mutations:issueCertificate"),{courseId:f.ids.course});
 const issue=(await f.issue())!;
 await f.t.run(ctx=>ctx.db.patch(f.ids.user,{displayName:"private@example.invalid"}));
 expect(await f.t.query(ref("lms/certificates/queries:verifyPublicCode"),{serial:issue.serial})).toMatchObject({holderName:"Certificate holder"});
 expect(await f.t.query(ref("lms/certificates/queries:verifyBySerial"),{serial:issue.serial})).toMatchObject({learnerName:"Certificate holder"});
 await f.t.run(async ctx=>{const settings=await ctx.db.query("settings").first();await ctx.db.patch(settings!._id,{values:{lmsEnabled:false}});});
 expect(await f.t.query(ref("lms/certificates/queries:verifyPublicCode"),{serial:issue.serial})).toEqual({state:"unavailable"});
});
