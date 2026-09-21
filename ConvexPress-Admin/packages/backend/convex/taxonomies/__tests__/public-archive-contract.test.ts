import {expect,test} from "bun:test";
import {convexTest} from "convex-test";
import {makeFunctionReference} from "convex/server";
import * as endpoints from "../queries";
import schema from "../../schema";
const modules={"./convex/membership/policyReads.ts":()=>import("../../membership/policyReads"),"./convex/_generated/api.js":()=>import("../../_generated/api.js"),"./convex/_generated/server.js":()=>import("../../_generated/server.js"),"./convex/taxonomies/queries.ts":()=>import("../queries")};
test("raw taxonomy lookups and the materializing archive are no longer public endpoints",()=>{
 for(const name of ["get","getBySlug","getPostsByTerm"])expect(Object.keys(endpoints)).not.toContain(name);
});
test("editor taxonomy collections refuse anonymous, customer and inactive sessions",async()=>{
 const t=convexTest({schema,modules});
 const ids=await t.run(async ctx=>{
  const roleId=await ctx.db.insert("roles",{name:"Author",slug:"author",description:"Fixture",level:60,type:"internal",status:"active",isDefault:false,isProtected:false,capabilities:["taxonomy.assign"],pageAccess:[],createdAt:1,updatedAt:1});
  const editor=await ctx.db.insert("users",{email:"editor@example.invalid",emailVerified:true,status:"active",authSource:"local",roleId,createdAt:1,updatedAt:1});
  await ctx.db.insert("users",{email:"customer@example.invalid",emailVerified:true,status:"active",authSource:"clerk",clerkUserId:"customer",createdAt:1,updatedAt:1});
  await ctx.db.insert("terms",{name:"Editorial category",slug:"editorial",taxonomy:"category",count:1,isDefault:false,createdAt:1,updatedAt:1});
  return {editor};
 });
 const editor=t.withIdentity({issuer:"https://convexpress-admin.local",subject:ids.editor});
 const customer=t.withIdentity({issuer:"https://clerk.fixture.invalid",subject:"customer"});
 for(const caller of [t,customer]){
  expect(await caller.query(makeFunctionReference<"query">("taxonomies/queries:getCategoryTree"),{})).toEqual([]);
  expect((await caller.query(makeFunctionReference<"query">("taxonomies/queries:list"),{})).terms).toEqual([]);
  expect(await caller.query(makeFunctionReference<"query">("taxonomies/queries:counts"),{})).toEqual({categories:0,tags:0});
 }
 expect((await editor.query(makeFunctionReference<"query">("taxonomies/queries:getCategoryTree"),{}))[0].name).toBe("Editorial category");
 await t.run(ctx=>ctx.db.patch("users",ids.editor,{status:"inactive"}));
 expect(await editor.query(makeFunctionReference<"query">("taxonomies/queries:getCategoryTree"),{})).toEqual([]);
});
