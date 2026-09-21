import {test,expect} from "bun:test";
import {readLeadMagnet} from "../leadMagnet";
import {fixture} from "../../leadMagnets/__tests__/fixture.test";
test("canonical lead offers belong to the saved current document and never an unsaved preview",async()=>{
 const {t,ids}=await fixture();
 const read=(change:"none"|"title"|"tree"|"source"="none")=>t.run(async ctx=>{
  const post=await ctx.db.get("posts",ids.post);if(!post)throw Error("Missing fixture");
  const tree=structuredClone(post.blocks);
  if(change==="tree")(tree as Array<{attrs:{title:string}}>)[0].attrs.title="Unsaved title";
  return readLeadMagnet(ctx,{blockId:"guide"},{document:{...post,...(change==="title"?{title:"Unsaved page"}:{}),...(change==="source"?{_id:ids.user as typeof ids.post}:{})},tree});
 });
 expect((await read()).offer?.postId).toBe(ids.post);
 for(const change of ["title","tree","source"] as const)expect(await read(change)).toEqual({blockId:"guide",offer:null});
 await t.run(ctx=>ctx.db.patch("posts",ids.post,{status:"draft"}));expect((await read()).offer).toBeNull();
});
test("filtered public siblings do not revoke a published offer, but altered or omitted offer nodes cannot borrow it",async()=>{
 const {t,ids}=await fixture();
 await t.run(async ctx=>{
  const post=(await ctx.db.get("posts",ids.post))!;
  await ctx.db.patch("posts",ids.post,{blocks:[...(post.blocks as object[]),{id:"restricted-sibling",name:"core/paragraph",version:2,attrs:{}}]});
 });
 const read=(change:"none"|"alter"|"omit"="none")=>t.run(async ctx=>{
  const post=(await ctx.db.get("posts",ids.post))!;
  const tree=structuredClone(post.blocks as Array<{id:string;attrs:{title?:string}}>).filter(node=>node.id!=="restricted-sibling");
  if(change==="alter")tree[0]!.attrs.title="Unsaved offer";
  return readLeadMagnet(ctx,{blockId:"guide"},{document:post,tree:change==="omit"?[]:tree,authoringTree:post.blocks});
 });
 expect((await read()).offer?.postId).toBe(ids.post);
 expect((await read("alter")).offer).toBeNull();
 expect((await read("omit")).offer).toBeNull();
});
