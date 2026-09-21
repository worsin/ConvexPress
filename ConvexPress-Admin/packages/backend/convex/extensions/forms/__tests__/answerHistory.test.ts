import { expect, test } from "bun:test";
import { convexTest } from "convex-test";
import { makeFunctionReference } from "convex/server";
import schema from "../../../schema";
const modules = {
 "./convex/_generated/api.js": () => import("../../../_generated/api.js"),
 "./convex/_generated/server.js": () => import("../../../_generated/server.js"),
 "./convex/extensions/forms/mutations.ts": () => import("../mutations"),
 "./convex/extensions/forms/queries.ts": () => import("../queries"),
 "./convex/extensions/forms/spam.ts": () => import("../spam"),
 "./convex/membership/policyReads.ts": () => import("../../../membership/policyReads"),
};
const ref = (name: string) => makeFunctionReference<any, any, any>(`extensions/forms/${name}`);
async function fixture() {
 const t=convexTest({schema,modules});
 const ids=await t.run(async ctx=>{
  const role=await ctx.db.insert("roles",{name:"Administrator",slug:"administrator",description:"Fixture",level:100,type:"internal",status:"active",isDefault:false,isProtected:true,capabilities:["form.view_entries","form.edit_entry"],pageAccess:[],createdAt:1,updatedAt:1});
  const user=await ctx.db.insert("users",{email:"history@example.invalid",authSource:"local",status:"active",emailVerified:true,roleId:role,createdAt:1,updatedAt:1});
  await ctx.db.insert("settings",{section:"plugins",values:{formsEnabled:true,membershipEnabled:false},updatedAt:1,updatedBy:user});
  const group=await ctx.db.insert("fieldGroups",{title:"Fields",key:"history-fixture",locationRules:[],position:"normal",style:"default",labelPlacement:"top",instructionPlacement:"label",isActive:true,menuOrder:0,createdBy:user,createdAt:1,updatedAt:1});
  const field=await ctx.db.insert("fieldDefinitions",{groupId:group,key:"email",name:"email",label:"Your email at submission",type:"email",required:true,settings:"{}",menuOrder:0,createdAt:1,updatedAt:1});
  const form=await ctx.db.insert("forms",{title:"History",slug:"history",status:"published",fieldGroupId:group,settings:"{}",createdBy:user,createdAt:1,updatedAt:1});
  return {user,role,field,form};
 });
 const admin=t.withIdentity({subject:ids.user,issuer:"https://convexpress-admin.local"});
 const submit=(extra={})=>t.mutation(ref("mutations:submit"),{formId:ids.form,values:[{fieldKey:"email",value:"visitor@example.invalid"}],isComplete:true,startedAt:Date.now()-10000,honeypot:"",...extra});
 return {t,ids,admin,submit};
}
test("submitted answers retain their server-authored labels and types after rename and deletion",async()=>{
 const f=await fixture(),receipt=await f.submit();
 const before=await f.admin.query(ref("queries:getSubmission"),{id:receipt.submissionId});
 expect(before.values[0].fieldLabel).toBe("Your email at submission");expect(before.values[0].fieldType).toBe("email");
 const stored=await f.t.run(ctx=>ctx.db.get("fieldValues",before.values[0]._id));
 expect(stored!.formFieldSnapshot).toEqual({label:"Your email at submission",type:"email"});
 await f.t.run(ctx=>ctx.db.patch("fieldDefinitions",f.ids.field,{label:"Company name now",type:"text",name:"company"}));
 expect(await f.admin.query(ref("queries:getSubmission"),{id:receipt.submissionId})).toEqual(before);
 await f.t.run(ctx=>ctx.db.delete("fieldDefinitions",f.ids.field));
 expect(await f.admin.query(ref("queries:getSubmission"),{id:receipt.submissionId})).toEqual(before);
 expect(await f.t.query(ref("queries:getSubmission"),{id:receipt.submissionId})).toBeNull();
});
test("legacy answers use stored field names instead of inventing historical labels from mutable definitions",async()=>{
 const f=await fixture(),receipt=await f.submit();
 const row=await f.t.run(ctx=>ctx.db.query("fieldValues").withIndex("by_entity",q=>q.eq("entityType","form_submission").eq("entityId",receipt.submissionId)).unique());
 await f.t.run(ctx=>ctx.db.patch("fieldValues",row!._id,{formFieldSnapshot:undefined}));
 const before=await f.admin.query(ref("queries:getSubmission"),{id:receipt.submissionId});
 expect(before.values[0].fieldLabel).toBe("email");expect(before.values[0].fieldType).toBeUndefined();
 await f.t.run(ctx=>ctx.db.patch("fieldDefinitions",f.ids.field,{label:"Different question",type:"text"}));
 expect(await f.admin.query(ref("queries:getSubmission"),{id:receipt.submissionId})).toEqual(before);
});
test("resubmitted draft values capture current definitions without accepting client-supplied metadata",async()=>{
 const f=await fixture(),draft=await f.submit({isComplete:false});
 await f.t.run(ctx=>ctx.db.patch("fieldDefinitions",f.ids.field,{label:"Current email prompt"}));
 const complete=await f.submit({resumeToken:draft.resumeToken});expect(complete.submissionId).toBe(draft.submissionId);
 const result=await f.admin.query(ref("queries:getSubmission"),{id:complete.submissionId});expect(result.values[0].fieldLabel).toBe("Current email prompt");
 await expect(f.submit({values:[{fieldKey:"email",value:"visitor@example.invalid",formFieldSnapshot:{label:"Forged",type:"text"}}]})).rejects.toThrow();
});

test("admin corrections preserve existing prompt history and capture newly added answers", async () => {
 const f = await fixture(), receipt = await f.submit();
 const before = await f.admin.query(ref("queries:getSubmission"), {id: receipt.submissionId});
 await f.t.run(async ctx => {
  const field = (await ctx.db.get("fieldDefinitions", f.ids.field))!;
  await ctx.db.patch("fieldDefinitions", field._id, {label: "Updated email prompt", name: "new_email"});
  const {_id, _creationTime, ...definition} = field;
  await ctx.db.insert("fieldDefinitions", {...definition, key: "company", name: "company", label: "Company now", type: "text", required: false, menuOrder: 1});
 });
 await f.admin.mutation(ref("mutations:updateEntry"), {id: receipt.submissionId, values: [
  {fieldKey: "email", value: "corrected@example.invalid"}, {fieldKey: "company", value: "Example studio"},
 ]});
 const after = await f.admin.query(ref("queries:getSubmission"), {id: receipt.submissionId});
 const email = after.values.find((v: any) => v.fieldKey === "email");
 expect(email).toMatchObject({_id: before.values[0]._id, fieldName: "email", fieldLabel: "Your email at submission", fieldType: "email", value: "corrected@example.invalid"});
 expect(after.values.find((v: any) => v.fieldKey === "company")).toMatchObject({fieldLabel: "Company now", fieldType: "text", formFieldSnapshot: {label: "Company now", type: "text"}});
 await f.t.run(ctx => ctx.db.patch("fieldValues", email._id, {formFieldSnapshot: undefined}));
 await f.admin.mutation(ref("mutations:updateEntry"), {id: receipt.submissionId, values: [{fieldKey: "email", value: "legacy-correction@example.invalid"}]});
 const legacy = (await f.admin.query(ref("queries:getSubmission"), {id: receipt.submissionId})).values.find((v: any) => v.fieldKey === "email");
 expect(legacy.fieldLabel).toBe("email");
 expect(legacy.fieldType).toBeUndefined();
 expect(legacy.formFieldSnapshot).toBeUndefined();
});


test("correction eligibility follows current fields without changing historical answers", async () => {
 const f=await fixture(), receipt=await f.submit();
 const args={id:receipt.submissionId};
 const history=await f.admin.query(ref("queries:getSubmission"),args);
 const policy=()=>f.admin.query(ref("queries:getSubmissionEditing"),args);
 expect(await policy()).toEqual([{fieldKey:"email",label:"Your email at submission",type:"email",required:true,updatedAt:1,editable:true}]);
 // Archiving blocks new public submissions, not an operator's existing-entry correction.
 await f.t.run(ctx=>ctx.db.patch("forms",f.ids.form,{status:"archived"}));
 expect((await policy())[0].editable).toBe(true);
 await f.admin.mutation(ref("mutations:updateEntry"),{...args,values:[{fieldKey:"email",value:"visitor@example.invalid"}]});
 for(const type of ["calculation","message","accordion","tab"]){
  await f.t.run(ctx=>ctx.db.patch("fieldDefinitions",f.ids.field,{type,label:"Changed current question",updatedAt:2}));
  expect((await policy())[0]).toMatchObject({type,label:"Changed current question",editable:false});
  await expect(f.admin.mutation(ref("mutations:updateEntry"),{...args,values:[{fieldKey:"email",value:"changed@example.invalid"}]})).rejects.toThrow();
  expect(await f.admin.query(ref("queries:getSubmission"),args)).toEqual(history);
 }
 await f.t.run(ctx=>ctx.db.patch("fieldDefinitions",f.ids.field,{type:"text"}));
 expect((await policy())[0].editable).toBe(true);
 await f.t.run(ctx=>ctx.db.delete("fieldDefinitions",f.ids.field));
 expect(await policy()).toEqual([]);
 await expect(f.admin.mutation(ref("mutations:updateEntry"),{...args,values:[{fieldKey:"email",value:"changed@example.invalid"}]})).rejects.toThrow("Unknown field");
 expect(await f.admin.query(ref("queries:getSubmission"),args)).toEqual(history);
});

test("correction policy reauthorizes revocation and keeps read-only historical access", async () => {
 const f=await fixture(),receipt=await f.submit(),args={id:receipt.submissionId};
 const history=await f.admin.query(ref("queries:getSubmission"),args);
 expect(await f.t.query(ref("queries:getSubmissionEditing"),args)).toBeNull();
 await f.t.run(ctx=>ctx.db.patch("roles",f.ids.role,{capabilities:["form.view_entries"]}));
 expect(await f.admin.query(ref("queries:getSubmissionEditing"),args)).toBeNull();
 expect(await f.admin.query(ref("queries:getSubmission"),args)).toEqual(history);
 await expect(f.admin.mutation(ref("mutations:updateEntry"),{...args,values:[{fieldKey:"email",value:"changed@example.invalid"}]})).rejects.toThrow();
 await f.t.run(ctx=>ctx.db.patch("roles",f.ids.role,{capabilities:["form.edit_entry"]}));
 expect(await f.admin.query(ref("queries:getSubmissionEditing"),args)).toBeNull();
 await f.t.run(ctx=>ctx.db.patch("roles",f.ids.role,{capabilities:["form.view_entries","form.edit_entry"]}));
 await f.t.run(ctx=>ctx.db.patch("forms",f.ids.form,{fieldGroupId:undefined}));
 expect(await f.admin.query(ref("queries:getSubmissionEditing"),args)).toEqual([]);
 expect(await f.admin.query(ref("queries:getSubmission"),args)).toEqual(history);
 await f.t.run(ctx=>ctx.db.delete("forms",f.ids.form));
 expect(await f.admin.query(ref("queries:getSubmissionEditing"),args)).toEqual([]);
});
