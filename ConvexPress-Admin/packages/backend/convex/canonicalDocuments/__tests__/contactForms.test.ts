import {test,expect} from "bun:test";
import {convexTest} from "convex-test";
import schema from "../../schema";
import {syncContactForm} from "../contactForms";
const modules={"./convex/_generated/api.js":()=>import("../../_generated/api.js"),"./convex/_generated/server.js":()=>import("../../_generated/server.js")};
async function fixture(){
 const t=convexTest({schema,modules});
 const ids=await t.run(async ctx=>{
  const role=await ctx.db.insert("roles",{name:"Form editor",slug:"editor",description:"Fixture",level:80,type:"internal",isDefault:false,isProtected:false,capabilities:["form.create","form.update"],pageAccess:[],status:"active",createdAt:1,updatedAt:1});
  const user=await ctx.db.insert("users",{authSource:"local",email:"editor@example.invalid",roleId:role,emailVerified:true,status:"active",createdAt:1,updatedAt:1});
  const plugin=await ctx.db.insert("settings",{section:"plugins",values:{formsEnabled:true,membershipEnabled:false},updatedAt:1,updatedBy:user});
  const post=await ctx.db.insert("posts",{type:"page",title:"Contact",slug:"contact",status:"draft",visibility:"public",authorId:user,commentStatus:"closed",createdAt:1,updatedAt:1});
  return {user,post,plugin};
 });
 const admin=t.withIdentity({subject:ids.user,tokenIdentifier:`https://convexpress-admin.local|${ids.user}`});
 return {t,ids,save:(attrs:unknown,blockId="contact")=>admin.run(ctx=>syncContactForm(ctx,{postId:ids.post,blockId,attrs}))};
}
const email={name:"email",label:"Email",type:"email",required:true};
const message={name:"message",label:"Message",type:"textarea",required:true};
test("Forms projection is stable, isolated per block, and preserves removed-field definitions for existing answers",async()=>{
 const f=await fixture(),attrs={heading:"Write to the studio",fields:[email,message]};
 const id=await f.save(attrs);expect(await f.save(attrs)).toBe(id);expect(await f.save(attrs,"second")).not.toBe(id);
 const before=await f.t.run(async ctx=>{const form=await ctx.db.get("forms",id);return {form,fields:await ctx.db.query("fieldDefinitions").withIndex("by_group",q=>q.eq("groupId",form!.fieldGroupId!)).collect()};});
 expect(before.form!.status).toBe("draft");expect(before.form!.submissionCountReady).toBe(true);expect(before.fields).toHaveLength(2);
 const old=before.fields.find(field=>field.name==="message")!;
 await f.save({...attrs,fields:[email]});
 const retired=await f.t.run(ctx=>ctx.db.get("fieldDefinitions",old._id));expect(retired!.groupId).not.toBe(before.form!.fieldGroupId);expect(retired!.key).toBe(old.key);
 await f.save({...attrs,fields:[email,{...message,label:"Tell us more"}]});
 const restored=await f.t.run(ctx=>ctx.db.get("fieldDefinitions",old._id));expect(restored!.groupId).toBe(before.form!.fieldGroupId);expect(restored!.label).toBe("Tell us more");
 expect(await f.t.run(ctx=>ctx.db.query("form_notifications").collect())).toHaveLength(2);
});
test("unauthorized, disabled-plugin and invalid configurations create no Forms records",async()=>{
 const f=await fixture();
 await expect(f.t.run(ctx=>syncContactForm(ctx,{postId:f.ids.post,blockId:"contact",attrs:{fields:[email]}}))).rejects.toThrow();
 await expect(f.save({fields:[email,email]})).rejects.toThrow();
 await f.t.run(ctx=>ctx.db.patch("settings",f.ids.plugin,{values:{formsEnabled:false}}));
 await expect(f.save({fields:[email]})).rejects.toThrow();
 expect(await f.t.run(ctx=>ctx.db.query("forms").collect())).toHaveLength(0);
});
