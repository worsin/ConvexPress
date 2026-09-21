import { readContact } from "../contact";
import { publicCanonicalTree } from "../publicTree";
import { validateCanonicalTree } from "../foundation/generated/instances";
import {test,expect,setSystemTime} from "bun:test";
import {convexTest} from "convex-test";
import {makeFunctionReference} from "convex/server";
import schema from "../../schema";
import {syncContactForm} from "../contactForms";
import {parseContactDefinition} from "../foundation/contactContracts";
import {readForm} from "../form";
import {publishedFixture} from "../../syncedBlocks/__tests__/publishedFixture.test-support";
import {resolvePublishedOccurrences} from "../../syncedBlocks/occurrences";
import {RequestReadLedger} from "../../helpers/requestReadLedger";
const modules={
 "./convex/_generated/api.js":()=>import("../../_generated/api.js"),"./convex/_generated/server.js":()=>import("../../_generated/server.js"),
 "./convex/membership/policyReads.ts":()=>import("../../membership/policyReads"),
 "./convex/settings/queries.ts":()=>import("../../settings/queries"),
 "./convex/settings/internals.ts":()=>import("../../settings/internals"),
 "./convex/emails/internals.ts":()=>import("../../emails/internals"),
 "./convex/extensions/forms/notifications.ts":()=>import("../../extensions/forms/notifications"),
 "./convex/extensions/forms/confirmations.ts":()=>import("../../extensions/forms/confirmations"),
 "./convex/extensions/forms/queries.ts":()=>import("../../extensions/forms/queries"),
 "./convex/extensions/forms/mutations.ts":()=>import("../../extensions/forms/mutations"),
 "./convex/extensions/forms/spam.ts":()=>import("../../extensions/forms/spam"),
};
const ref=(name:string)=>makeFunctionReference<any,any,any>(`extensions/forms/${name}`);
async function fixture(){
 const t=convexTest({schema,modules}),attrs=parseContactDefinition({heading:"Contact",fields:[{name:"email",label:"Email",type:"email",required:true}]});
 const tree=[{id:"contact",name:"core/contact-form",version:2,attrs}];
 const ids=await t.run(async ctx=>{
  const role=await ctx.db.insert("roles",{name:"Editor",slug:"editor",description:"Fixture",level:80,type:"internal",isDefault:false,isProtected:false,capabilities:["form.create","form.update"],pageAccess:[],status:"active",createdAt:1,updatedAt:1});
  const user=await ctx.db.insert("users",{authSource:"local",email:"owner@example.invalid",roleId:role,emailVerified:true,status:"active",createdAt:1,updatedAt:1});
  const plugin=await ctx.db.insert("settings",{section:"plugins",values:{formsEnabled:true,membershipEnabled:false},updatedAt:1,updatedBy:user});
  const post=await ctx.db.insert("posts",{type:"page",title:"Contact",slug:"contact",path:"/contact",status:"publish",visibility:"public",authorId:user,commentStatus:"closed",blocksVersion:2,blocks:tree,createdAt:1,updatedAt:1});return {post,user,plugin};
 });
 const admin=t.withIdentity({subject:ids.user,tokenIdentifier:`https://convexpress-admin.local|${ids.user}`});
 const form=await admin.run(ctx=>syncContactForm(ctx,{postId:ids.post,blockId:"contact",attrs}));
 await t.run(ctx=>ctx.db.patch("forms",form,{status:"published"}));
 const stored=await t.run(ctx=>ctx.db.get("forms",form));
 const args={formId:form,values:[{fieldKey:`field_contact_${form}_email`,value:"visitor@example.invalid"}],startedAt:Date.now()-10000,honeypot:""};
 const read=(contactPassword?:string)=>t.query(ref("queries:getBySlug"),{slug:stored!.slug,contactPassword});
 const submit=(extra:Record<string,unknown>={})=>t.mutation(ref("mutations:submit"),{...args,isComplete:true,...extra});
 return {t,ids,admin,attrs,tree,form,args,read,submit};
}
test("published source accepts real entries; unpublished source blocks direct reads, embedded reads, submit, CAPTCHA mutation and draft resume",async()=>{
 const f=await fixture();expect((await f.read()).fields).toHaveLength(1);
 expect((await f.submit()).isComplete).toBe(true);
 expect(await f.t.run(async ctx=>(await ctx.db.query("fieldValues").collect()).map(value=>({name:value.fieldName,value:value.value})))).toEqual([{name:"email",value:"visitor@example.invalid"}]);
 const draft=await f.t.mutation(ref("mutations:submit"),{...f.args,isComplete:false});
 expect((await f.t.query(ref("queries:resume"),{token:draft.resumeToken})).values).toBeDefined();
 await f.t.run(ctx=>ctx.db.patch("posts",f.ids.post,{status:"draft"}));
 expect(await f.read()).toBeNull();expect((await f.t.run(ctx=>readForm(ctx,{form:f.form}))).form).toBeNull();
 expect(await f.t.query(ref("queries:resume"),{token:draft.resumeToken})).toBeNull();
 await expect(f.submit()).rejects.toThrow("not available");
 await expect(f.t.mutation(ref("mutations:submitInternal"),{...f.args,isComplete:true})).rejects.toThrow("not available");
 expect(await f.t.run(ctx=>ctx.db.query("form_submissions").collect())).toHaveLength(2);
});
test("source password is required on reads and writes, and wrong or oversized passwords never unlock it",async()=>{
 const f=await fixture();await f.t.run(ctx=>ctx.db.patch("posts",f.ids.post,{visibility:"password",password:"fixture-only"}));
 for(const password of [undefined,"wrong","x".repeat(1025)]){expect(await f.read(password)).toBeNull();await expect(f.submit({contactPassword:password})).rejects.toThrow();}
 expect((await f.read("fixture-only")).fields).toHaveLength(1);expect((await f.submit({contactPassword:"fixture-only"})).isComplete).toBe(true);
});
test("contact block and ancestor membership revoke direct forms, draft resume and final submission",async()=>{
 const f=await fixture();
 const draft=await f.t.mutation(ref("mutations:submit"),{...f.args,isComplete:false});
 await f.t.run(async ctx=>{
  await ctx.db.patch("posts",f.ids.post,{blocks:[{id:"parent",name:"core/group",version:1,attrs:{},children:f.tree}]});
  await ctx.db.patch("settings",f.ids.plugin,{values:{formsEnabled:true,membershipEnabled:true}});
 });
 for(const key of ["contact","parent","core/contact-form"]){
  const rule=await f.t.run(ctx=>ctx.db.insert("membership_restriction_rules",{resourceType:"block",resourceIdOrKey:key,ruleMode:"allow_only",planIds:[],teaserMode:"hide",loginRequired:true,createdAt:1,updatedAt:1}));
  expect(await f.read()).toBeNull();await expect(f.submit()).rejects.toThrow("not available");
  expect(await f.t.query(ref("queries:resume"),{token:draft.resumeToken})).toBeNull();
  await expect(f.t.mutation(ref("mutations:submitInternal"),{...f.args,isComplete:true})).rejects.toThrow("not available");
  await f.t.run(ctx=>ctx.db.delete("membership_restriction_rules",rule));
  expect(await f.read()).not.toBeNull();
 }
 expect(await f.t.run(ctx=>ctx.db.query("form_submissions").take(10))).toHaveLength(1);
});
test("a contact projection bound to a reusable placement requires its current published source",async()=>{
 const f=await fixture();
 const source=await f.t.run(async ctx=>{
  await ctx.db.insert("convexpress_siteIdentity",{identityKey:"site-identity",websiteKey:"contact",instanceKey:"contact-staging",environmentKind:"staging",deploymentOrigin:"https://contact.convex.cloud",managementOrigin:"https://controller.convex.cloud",siteOrigin:"https://contact.convex.site",siteContractVersion:"1",schemaVersion:"1",engineVersion:"1",managementCapabilities:[],initializedAt:1,updatedAt:1});
  const id=await publishedFixture(ctx,f.ids.user,f.tree);
  const blocks=[{id:"shared",name:"core/synced",version:1,attrs:{syncedBlock:id,revisionPolicy:"latest"}}];
  await ctx.db.patch("posts",f.ids.post,{blocks});
  const plan=await resolvePublishedOccurrences(ctx,blocks,new RequestReadLedger());
  return {id,blockId:plan.resolverTree[0]!.id};
 });
 // An old authored-ID projection must not become an alias for a reused child.
 expect(await f.read()).toBeNull();await expect(f.submit()).rejects.toThrow();
 await f.t.run(ctx=>ctx.db.patch("forms",f.form,{contactBlockId:source.blockId}));
 expect(await f.read()).not.toBeNull();expect((await f.submit()).isComplete).toBe(true);
 await f.t.run(ctx=>ctx.db.patch("syncedBlocks",source.id,{publishedRevision:undefined}));
 expect(await f.read()).toBeNull();await expect(f.submit()).rejects.toThrow();
 expect(await f.t.run(ctx=>ctx.db.query("form_submissions").take(10))).toHaveLength(1);
});
test("changed definitions, removed blocks, audience changes, disabled blocks/plugins and incomplete bindings fail closed",async()=>{
 const f=await fixture();
 for(const blocks of [[],[{...f.tree[0],attrs:{...f.attrs,recipientEmail:"changed@example.invalid"}}],[{...f.tree[0],visibility:"signedIn"}],[{id:"parent",name:"core/group",version:1,attrs:{},visibility:"signedIn",children:f.tree}]]){
  await f.t.run(ctx=>ctx.db.patch("posts",f.ids.post,{blocks}));expect(await f.read()).toBeNull();await expect(f.submit()).rejects.toThrow();
 }
 await f.t.run(ctx=>ctx.db.patch("posts",f.ids.post,{blocks:f.tree}));expect(await f.read()).not.toBeNull();
 const disabled=await f.t.run(ctx=>ctx.db.insert("settings",{section:"blocks",values:{disabledBlockNames:["core/contact-form"]},updatedAt:1,updatedBy:f.ids.user}));
 expect(await f.read()).toBeNull();await f.t.run(ctx=>ctx.db.delete("settings",disabled));
 await f.t.run(ctx=>ctx.db.patch("forms",f.form,{contactBlockId:undefined}));expect(await f.read()).toBeNull();
 await f.t.run(ctx=>ctx.db.patch("forms",f.form,{contactBlockId:"contact"}));await f.t.run(ctx=>ctx.db.patch("settings",f.ids.plugin,{values:{formsEnabled:false,membershipEnabled:false}}));expect(await f.read()).toBeNull();
 expect(await f.t.run(ctx=>ctx.db.query("form_submissions").collect())).toHaveLength(0);
});

test("current membership is enforced at the source deadline without waiting for grant maintenance",async()=>{
 const f=await fixture(),now=Date.now();
 await f.t.run(async ctx=>{
  await ctx.db.patch("settings",f.ids.plugin,{values:{formsEnabled:true,membershipEnabled:true}});
  const plan=await ctx.db.insert("membership_plans",{title:"Members",slug:"members",status:"active",grantMode:"manual",priority:1,createdAt:now,updatedAt:now});
  await ctx.db.insert("membership_grants",{userId:f.ids.user,planId:plan,sourceType:"manual",status:"active",startsAt:now-1000,endsAt:now+1000,createdAt:now,updatedAt:now});
  await ctx.db.insert("membership_restriction_rules",{resourceType:"page",resourceIdOrKey:f.ids.post,ruleMode:"allow_only",planIds:[plan],teaserMode:"hide",loginRequired:true,createdAt:now,updatedAt:now});
 });
 expect(await f.read()).toBeNull();
 const stored=await f.t.run(ctx=>ctx.db.get("forms",f.form));
 expect(await f.admin.query(ref("queries:getBySlug"),{slug:stored!.slug})).not.toBeNull();
 try {
  setSystemTime(now+1000);
  expect(await f.admin.query(ref("queries:getBySlug"),{slug:stored!.slug})).toBeNull();
  await expect(f.admin.mutation(ref("mutations:submit"),{...f.args,isComplete:true})).rejects.toThrow("not available");
 } finally {setSystemTime();}
 expect(await f.t.run(ctx=>ctx.db.query("form_submissions").collect())).toHaveLength(0);
});

test("generic field edits cannot weaken the saved block; authoring reconciliation repairs the same field ID",async()=>{
 const f=await fixture();const form=await f.t.run(ctx=>ctx.db.get("forms",f.form));
 const field=await f.t.run(ctx=>ctx.db.query("fieldDefinitions").withIndex("by_group",q=>q.eq("groupId",form!.fieldGroupId!)).first());
 await f.t.run(ctx=>ctx.db.patch("fieldDefinitions",field!._id,{required:false,defaultValue:"injected"}));
 expect(await f.read()).toBeNull();await expect(f.submit()).rejects.toThrow("not available");
 await f.admin.run(ctx=>syncContactForm(ctx,{postId:f.ids.post,blockId:"contact",attrs:f.attrs}));
 expect((await f.read()).fields[0]._id).toBe(field!._id);expect((await f.read()).fields[0].required).toBe(true);
 expect((await f.submit()).isComplete).toBe(true);
});


test("reordering and restoring contact fields keeps public access and stable answer keys",async()=>{
 const f=await fixture();
 const message={name:"message",label:"Message",type:"textarea",required:true};
 const original=parseContactDefinition({...f.attrs,fields:[f.attrs.fields[0],message]});
 const save=async(attrs:unknown)=>f.admin.run(async ctx=>{
  await syncContactForm(ctx,{postId:f.ids.post,blockId:"contact",attrs});
  await ctx.db.patch("posts",f.ids.post,{blocks:[{...f.tree[0],attrs:parseContactDefinition(attrs)}]});
 });
 await save(original);
 const first=await f.read();expect(first.fields.map((field:any)=>field.name)).toEqual(["email","message"]);
 const keys=Object.fromEntries(first.fields.map((field:any)=>[field.name,field.key]));
 await save({...original,fields:[original.fields[1],original.fields[0]]});
 const reordered=await f.read();expect(reordered).not.toBeNull();
 expect(reordered.fields.map((field:any)=>field.name)).toEqual(["message","email"]);
 await save({...original,fields:[original.fields[1]]});
 await save({...original,fields:[original.fields[1],original.fields[0]]});
 const restored=await f.read();expect(restored).not.toBeNull();
 expect(Object.fromEntries(restored.fields.map((field:any)=>[field.name,field.key]))).toEqual(keys);
 expect((await f.submit({values:[{fieldKey:keys.email,value:"visitor@example.invalid"},{fieldKey:keys.message,value:"A real message"}]})).isComplete).toBe(true);
});


test("Contact reader binds the trusted document, forwards passwords and never emits recipient metadata",async()=>{
 const f=await fixture();
 const attrs=parseContactDefinition({...f.attrs,recipientEmail:"private-recipient@example.invalid"});
 await f.admin.run(async ctx=>{
  await syncContactForm(ctx,{postId:f.ids.post,blockId:"contact",attrs});
  await ctx.db.patch("posts",f.ids.post,{visibility:"password",password:"fixture-only",blocks:[{...f.tree[0],attrs}]});
 });
 const source=await f.t.run(async ctx=>{const document=await ctx.db.get("posts",f.ids.post);return {document:document!,tree:validateCanonicalTree(document!.blocks)};});
 const read=(password?:string)=>f.t.run(ctx=>readContact(ctx,{blockId:"contact"},source,undefined,password));
 expect((await read()).form).toBeNull();expect((await read("wrong")).form).toBeNull();
 const result=await read("fixture-only");expect(result.form!._id).toBe(f.form);expect(JSON.stringify(result)).not.toContain("private-recipient");
 expect((await f.t.run(ctx=>readContact(ctx,{blockId:"missing"},source,undefined,"fixture-only"))).form).toBeNull();
 const other=await f.t.run(async ctx=>{const {_id,_creationTime,...copy}=source.document;return ctx.db.insert("posts",{...copy,slug:"other"});});
 expect((await f.t.run(ctx=>readContact(ctx,{blockId:"contact"},{...source,document:{...source.document,_id:other}},undefined,"fixture-only"))).form).toBeNull();
 const changed=validateCanonicalTree([{...source.tree[0],attrs:{...attrs,heading:"Unsaved edit"}}]);
 expect((await f.t.run(ctx=>readContact(ctx,{blockId:"contact"},{...source,tree:changed},undefined,"fixture-only"))).form).toBeNull();
 const nested=validateCanonicalTree([{id:"group",name:"core/group",version:1,attrs:{},children:source.tree}]);
 const visible=publicCanonicalTree(nested);
 expect(JSON.stringify(visible)).not.toContain("private-recipient");
 expect(JSON.stringify(nested)).toContain("private-recipient");
 expect(validateCanonicalTree(visible)).toEqual(visible);
});


test("Contact confirmation requires the submit receipt plus current source password and publication",async()=>{
 const f=await fixture();await f.t.run(ctx=>ctx.db.patch("posts",f.ids.post,{visibility:"password",password:"fixture-only"}));
 const receipt=await f.submit({contactPassword:"fixture-only"});
 const args={formId:f.form,submissionId:receipt.submissionId,confirmationToken:receipt.confirmationToken,contactPassword:"fixture-only"};
 expect((await f.t.query(ref("confirmations:resolveConfirmation"),args)).type).toBe("message");
 await expect(f.t.query(ref("confirmations:resolveConfirmation"),{...args,contactPassword:"wrong"})).rejects.toThrow("not available");
 await f.t.run(ctx=>ctx.db.patch("posts",f.ids.post,{status:"draft"}));
 await expect(f.t.query(ref("confirmations:resolveConfirmation"),args)).rejects.toThrow("not available");
});


test("saved Contact messaging keeps stable rows and notification preferences, dispatches only a configured recipient, and confirms literal success copy",async()=>{
 const f=await fixture();
 const save=async(extra:Record<string,unknown>)=>f.admin.run(async ctx=>{
  const attrs=parseContactDefinition({...f.attrs,...extra});
  await syncContactForm(ctx,{postId:f.ids.post,blockId:"contact",attrs});
  await ctx.db.patch("posts",f.ids.post,{blocks:[{...f.tree[0],attrs}]});
 });
 const form=await f.t.run(ctx=>ctx.db.get("forms",f.form));
 const dispatch=async(receipt:{submissionId:string})=>{
  const event=await f.t.run(async ctx=>(await ctx.db.query("events").withIndex("by_code",q=>q.eq("code","form.submitted")).collect()).find(row=>JSON.parse(row.payload).submissionId===receipt.submissionId));
  expect(event).toBeDefined();
  await f.t.action(ref("notifications:dispatch"),{eventId:event!._id});
  // Inspect the real queue, cancel scheduled delivery, never execute a sender.
  await f.t.run(async ctx=>{for(const job of await ctx.db.system.query("_scheduled_functions").collect())if(job.state.kind==="pending")await ctx.scheduler.cancel(job._id);});
 };
 const blank=await f.submit();await dispatch(blank);
 expect(await f.t.run(ctx=>ctx.db.query("emailQueue").collect())).toHaveLength(0);
 await save({recipientEmail:"studio@example.invalid",successMessage:"Saved <safely> {field:email}"});
 const updated=await f.t.run(ctx=>ctx.db.get("forms",f.form));
 expect(updated!.contactNotificationId).toBe(form!.contactNotificationId);expect(updated!.contactConfirmationId).toBe(form!.contactConfirmationId);
 const receipt=await f.submit();await dispatch(receipt);
 const queue=await f.t.run(ctx=>ctx.db.query("emailQueue").collect());expect(queue).toHaveLength(1);expect(queue[0].to).toBe("studio@example.invalid");expect(queue[0].bodyHtml).toContain("visitor@example.invalid");expect(queue[0].status).toBe("queued");
 const confirmation=await f.t.query(ref("confirmations:resolveConfirmation"),{formId:f.form,submissionId:receipt.submissionId,confirmationToken:receipt.confirmationToken});
 expect(confirmation.renderedMessage).toContain("&lt;safely&gt;");expect(confirmation.renderedMessage).not.toContain("visitor@example.invalid");
 await f.t.run(ctx=>ctx.db.patch("form_notifications",form!.contactNotificationId!,{enabled:false}));
 await save({recipientEmail:"new-studio@example.invalid"});
 expect((await f.t.run(ctx=>ctx.db.get("form_notifications",form!.contactNotificationId!)))!.enabled).toBe(false);
 expect(await f.t.query(ref("notifications:_enabledRowsForEvent"),{formId:f.form,triggerEventCode:"form.submitted"})).toEqual([]);
 await f.t.run(ctx=>ctx.db.patch("form_confirmations",form!.contactConfirmationId!,{content:"Tampered"}));
 expect(await f.read()).toBeNull();await expect(f.submit()).rejects.toThrow("not available");
 await save({recipientEmail:"new-studio@example.invalid"});expect(await f.read()).not.toBeNull();
});

test("native entry detail retains the submitted Contact prompt through archival and definition replacement", async () => {
 const f=await fixture(), receipt=await f.submit();
 expect(await f.t.query(ref("queries:getSubmission"),{id:receipt.submissionId})).toBeNull();
 expect(await f.admin.query(ref("queries:getSubmission"),{id:receipt.submissionId})).toBeNull();
 await f.t.run(async ctx=>{const user=await ctx.db.get("users",f.ids.user);const role=await ctx.db.get("roles",user!.roleId!);await ctx.db.patch("roles",role!._id,{capabilities:[...role!.capabilities,"form.view_entries"]});});
 expect((await f.admin.query(ref("queries:getSubmission"),{id:receipt.submissionId})).values[0].fieldLabel).toBe("Email");
 await f.admin.run(async ctx=>{const attrs={...f.attrs,fields:[]};await syncContactForm(ctx,{postId:f.ids.post,blockId:"contact",attrs});await ctx.db.patch("posts",f.ids.post,{blocks:[{...f.tree[0],attrs}]});});
 const detail=await f.admin.query(ref("queries:getSubmission"),{id:receipt.submissionId});
 expect(detail.values[0]).toMatchObject({fieldLabel:"Email",fieldType:"email",value:"visitor@example.invalid"});
 await f.t.run(async ctx=>{const form=await ctx.db.get("forms",f.form);const {_id,_creationTime,...group}= (await ctx.db.get("fieldGroups",form!.fieldGroupId!))!;const other=await ctx.db.insert("fieldGroups",{...group,key:"unrelated-history",title:"Unrelated"});const field=await ctx.db.query("fieldDefinitions").withIndex("by_key",q=>q.eq("key",f.args.values[0].fieldKey)).unique();await ctx.db.patch("fieldDefinitions",field!._id,{groupId:other,label:"Unrelated label"});});
 expect((await f.admin.query(ref("queries:getSubmission"),{id:receipt.submissionId})).values[0].fieldLabel).toBe("Email");
 await f.t.run(async ctx=>{const form=await ctx.db.get("forms",f.form);const field=await ctx.db.query("fieldDefinitions").withIndex("by_key",q=>q.eq("key",f.args.values[0].fieldKey)).unique();await ctx.db.patch("fieldDefinitions",field!._id,{groupId:form!.fieldGroupId!,label:"Live field"});});
 expect((await f.admin.query(ref("queries:getSubmission"),{id:receipt.submissionId})).values[0].fieldLabel).toBe("Email");
});
