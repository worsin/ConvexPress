import { test, expect } from "bun:test";
import { convexTest } from "convex-test";
import schema from "../../schema";
import { list, getTree, listPublic, getBySlug, getFeatured, getNavCategories } from "../categories";

async function fixture() {
  const t=convexTest({schema,modules:{
    "./convex/_generated/api.js":()=>import("../../_generated/api.js"),
    "./convex/_generated/server.js":()=>import("../../_generated/server.js"),
  }});
  const ids=await t.run(async ctx=>{
    const roleId=await ctx.db.insert("roles",{name:"Administrator",slug:"administrator",description:"Test",level:100,type:"internal",isDefault:false,isProtected:true,capabilities:["manage_options"],pageAccess:[],status:"active",createdAt:1,updatedAt:1});
    const user=await ctx.db.insert("users",{authSource:"local",email:"category-admin@example.invalid",emailVerified:true,roleId,status:"active",createdAt:1,updatedAt:1});
    await ctx.db.insert("settings",{section:"plugins",values:{commerceEnabled:true},updatedAt:1,updatedBy:user});
    const make=(name:string,extra:object={})=>ctx.db.insert("commerce_product_categories",{name,slug:name.toLowerCase(),productCount:1,totalProductCount:1,isVisible:true,isFeatured:true,showInNav:true,createdAt:1,updatedAt:1,...extra});
    const visible=await make("Visible"),hidden=await make("Hidden",{isVisible:false});
    const child=await make("Child",{parentId:hidden,path:[]}),grandchild=await make("Grandchild",{parentId:child,path:[visible]});
    const orphan=await make("Orphan",{parentId:await make("Deleted")});
    const orphanDoc=await ctx.db.get(orphan);await ctx.db.delete(orphanDoc!.parentId!);
    const cycle=await make("Cycle");await ctx.db.patch(cycle,{parentId:cycle});
    const leaf=await make("Leaf",{parentId:visible,path:[hidden]});
    return {user,visible,hidden,child,grandchild,orphan,cycle,leaf};
  });
  const call=(fn:any,args:object={})=>t.run(ctx=>fn._handler(ctx,args));
  return {t,ids,call};
}
test("public category reads exclude hidden ancestry, orphans and cycles regardless of stale path metadata",async()=>{
  const {call}=await fixture();
  for(const fn of [list,listPublic,getFeatured]) expect((await call(fn)).map((c:any)=>c.name).sort()).toEqual(["Leaf","Visible"]);
  for(const fn of [getTree,getNavCategories]) {
    const tree=await call(fn);expect(tree.map((c:any)=>c.name)).toEqual(["Visible"]);expect(tree[0].children.map((c:any)=>c.name)).toEqual(["Leaf"]);
  }
  for(const slug of ["hidden","child","grandchild","orphan","cycle"]) expect(await call(getBySlug,{slug})).toBeNull();
  const leaf=await call(getBySlug,{slug:"leaf"});expect(leaf.ancestors.map((c:any)=>c.name)).toEqual(["Visible"]);
  const visible=await call(getBySlug,{slug:"visible"});expect(visible.children.map((c:any)=>c.name)).toEqual(["Leaf"]);
});
test("hidden category enumeration requires management permission and hierarchy changes take effect on fresh reads",async()=>{
  const {t,ids,call}=await fixture();
  for(const fn of [list,getTree]) await expect(call(fn,{includeHidden:true})).rejects.toThrow();
  const admin=t.withIdentity({subject:ids.user,tokenIdentifier:`https://convexpress-admin.local|${ids.user}`});
  expect((await admin.run(ctx=>(list as any)._handler(ctx,{includeHidden:true}))).some((c:any)=>c.name==="Hidden")).toBe(true);
  await t.run(ctx=>ctx.db.patch(ids.hidden,{isVisible:true}));
  expect((await call(getBySlug,{slug:"grandchild"})).ancestors.map((c:any)=>c.name)).toEqual(["Hidden","Child"]);
  await t.run(ctx=>ctx.db.patch(ids.hidden,{isVisible:false}));
  expect(await call(getBySlug,{slug:"grandchild"})).toBeNull();
});
