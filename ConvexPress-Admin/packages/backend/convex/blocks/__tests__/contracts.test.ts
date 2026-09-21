import { expect, test } from "bun:test";
import { commerceHarness } from "../../commerce/__tests__/handlerHarness.test-support";
import { replaceBlocks, replaceBlocksFromAi, insertBlock, duplicateBlock, updateBlockAttrs, moveBlock } from "../mutations";
import { BLOCK_CATALOG, buildBlockCatalogPrompt, extractJson, validateAttrsForCatalogEntry } from "../aiPromptBuilder";
const run = (fn: any, ctx: any, args: any) => fn._handler(ctx, args);
const block = (name = "core/paragraph", attrs: any = { body: "Original" }, id = "one") => ({ id, name, attrs, version: 1 });
function harness(blocks: any[] = [], disabled: string[] = []) {
 const ctx = commerceHarness({ posts: [{ _id: "post", authorId: "admin", type: "page", status: "auto-draft", title: "Page", blocks, blocksRevision: 0 }] });
 ctx.tables.roles[0].capabilities.push("page.update", "blocks.ai");
 ctx.handlers["settings/internals:getInternal"] = () => ({ disabledBlockNames: disabled });
 return ctx;
}
test("real block write rejects unknown root/nested names and malformed known attrs before storage", async () => {
 for (const bad of [block("evil/unknown"),block("__proto__"), {...block(),innerBlocks:[block("evil/nested",{},"child")]},block("core/list",{items:[{text:123}]}),block("reference/field-guide",{count:900})]) {
  const ctx=harness(); await expect(run(replaceBlocks,ctx,{postId:"post",blocks:[bad],expectedRevision:0})).rejects.toBeDefined();
  expect(ctx.tables.posts[0].blocks).toEqual([]); expect(ctx.tables.posts[0].blocksRevision).toBe(0);
 }
});
test("portable schemas and AI metadata are available and disabled names excluded",()=>{
 expect(validateAttrsForCatalogEntry("commerce/product-showcase",{count:4}).ok).toBe(true);
 expect(validateAttrsForCatalogEntry("commerce/product-showcase",{count:200}).ok).toBe(false);
 expect(buildBlockCatalogPrompt()).toContain("## commerce/product-showcase");
 expect(buildBlockCatalogPrompt()).toContain("homepage featured products");
 expect(buildBlockCatalogPrompt(["commerce/product-showcase"])).not.toContain("## commerce/product-showcase");
});
test("duplication cannot introduce a disabled descendant through an enabled parent", async()=>{
 const blocks=[{...block(),innerBlocks:[block("core/heading",{text:"Child"},"child")]}];
 const ctx=harness(blocks,["core/heading"]);
 await expect(run(duplicateBlock,ctx,{postId:"post",blockId:"one",expectedRevision:0})).rejects.toBeDefined();
 expect(ctx.tables.posts[0].blocks).toEqual(blocks);
});
test("existing disabled blocks remain editable and movable under the documented policy",async()=>{
 const ctx=harness([block(),block("core/paragraph",{body:"Second"},"two")],["core/paragraph"]);
 await run(updateBlockAttrs,ctx,{postId:"post",blockId:"one",attrs:{body:"Edited"},expectedRevision:0});
 await run(moveBlock,ctx,{postId:"post",blockId:"one",toIndex:1,expectedRevision:1});
 expect(ctx.tables.posts[0].blocks[1].attrs.body).toBe("Edited");
});
test("AI JSON extraction treats brackets and escaped quotes inside copy as text",()=>{
 const value=[{name:"core/paragraph",attrs:{body:'A ] bracket, a } brace and \\"quoted\\" text.'}}];
 expect(extractJson("Here is your page: "+JSON.stringify(value)+" End.")).toEqual(value);
 expect(extractJson("Here is [a note] followed by "+JSON.stringify(value))).toEqual(value);
});

test("canonical page/post create and update cannot bypass block contracts or disabled-add policy",async()=>{
 const pages=await import('../../pages/mutations'); const posts=await import('../../posts/mutations');
 for(const [kind, methods] of [['page',pages],['post',posts]] as const) {
  for(const blocks of [[block('unregistered/block')],[block('core/paragraph')]]) {
   const ctx=harness([],['core/paragraph']); ctx.tables.posts[0].type=kind;ctx.tables.posts[0].authorId='admin';
   ctx.tables.roles[0].capabilities.push('page.create','post.create','post.update');
   await expect(run(methods.create,ctx,{title:'New page',status:'draft',blocks})).rejects.toMatchObject({data:{code:"VALIDATION_ERROR"}});
   expect(ctx.tables.posts).toHaveLength(1);
   await expect(run(methods.update,ctx,{[kind==='page'?'pageId':'postId']:'post',blocks})).rejects.toBeDefined();
   expect(ctx.tables.posts[0].blocks).toEqual([]);
  }
 }
});

test("AI page generation rejects unsupported nesting instead of silently losing content",async()=>{
 const {generatePageDraft}=await import('../ai'); const ctx=harness();
 ctx.handlers['blocks/queries:getEditableDocumentForAi']=()=>structuredClone(ctx.tables.posts[0]);
 ctx.handlers['ai/internals:generateWithClaude']=()=>JSON.stringify([{...block(),innerBlocks:[block('core/paragraph',{body:'Must survive'},'child')]}]);
 await expect(run(generatePageDraft,ctx,{postId:'post',prompt:'A page'})).rejects.toBeDefined();
});
test("AI page replacement writes once and uses the revision from before generation",async()=>{
 const {generatePage}=await import('../ai'); const ctx=harness([block()]);
 ctx.handlers['blocks/queries:getEditableDocumentForAi']=()=>structuredClone(ctx.tables.posts[0]);
 ctx.handlers['ai/internals:generateWithClaude']=()=>JSON.stringify([block('commerce/product-showcase',{count:4})]);
 ctx.handlers['blocks/mutations:replaceBlocksFromAi']=replaceBlocksFromAi;
 ctx.handlers['blocks/mutations:insertBlock']=insertBlock;
 const result=await run(generatePage,ctx,{postId:'post',prompt:'A page'});
 expect(result.blocksGenerated).toBe(1);
 expect(ctx.calls.filter((c:any)=>c.name.startsWith('blocks/mutations:'))).toHaveLength(1);
 expect(ctx.tables.posts[0].blocks[0].name).toBe('commerce/product-showcase');
 ctx.handlers['ai/internals:generateWithClaude']=()=>{
  ctx.tables.posts[0].blocksRevision++;
  ctx.tables.posts[0].blocks=[block('core/paragraph',{body:'Concurrent editor'})];
  return JSON.stringify([block()]);
 };
 await expect(run(generatePage,ctx,{postId:'post',prompt:'A page'})).rejects.toBeDefined();
 expect(ctx.tables.posts[0].blocks[0].attrs.body).toBe('Concurrent editor');
});

test("all AI examples validate; saved nested attrs are normalized by the canonical schemas",async()=>{
 for(const entry of BLOCK_CATALOG) expect(validateAttrsForCatalogEntry(entry.name,entry.example).ok).toBe(true);
 const ctx=harness();
 await run(replaceBlocks,ctx,{postId:'post',blocks:[block('core/list',{items:[{text:'Visible',unexpected:'Do not store'}],unexpected:'Do not store'})]});
 expect(ctx.tables.posts[0].blocks[0].attrs).toEqual({style:'bullet',items:[{text:'Visible'}]});
});
test("disabled blocks reject AI regeneration and variants before spending provider calls",async()=>{
 const {regenerateBlock,generateVariants}=await import('../ai');
 for(const method of [regenerateBlock,generateVariants]) {
  const ctx=harness([block()],['core/paragraph']);
  ctx.handlers['blocks/queries:getEditableDocumentForAi']=()=>structuredClone(ctx.tables.posts[0]);
  await expect(run(method,ctx,{postId:'post',blockId:'one'})).rejects.toMatchObject({data:{code:'VALIDATION_ERROR'}});
  expect(ctx.calls.filter((c:any)=>c.name==='ai/internals:generateWithClaude')).toHaveLength(0);
 }
});


test("AI mutations recheck revoked authority and disablement after the provider returns", async () => {
 const {generatePage,regenerateBlock}=await import('../ai');
 const {getEditableDocumentForAi}=await import('../queries');
 const {updateBlockAttrsFromAi}=await import('../mutations');
 for(const method of [generatePage,regenerateBlock]) for(const change of ['permission','disabled','revision']) {
  const ctx=harness([block()]);
  ctx.handlers['blocks/queries:getEditableDocumentForAi']=getEditableDocumentForAi;
  ctx.handlers['blocks/mutations:replaceBlocksFromAi']=replaceBlocksFromAi;
  ctx.handlers['blocks/mutations:updateBlockAttrsFromAi']=updateBlockAttrsFromAi;
  ctx.handlers['ai/internals:generateWithClaude']=()=>{
   if(change==='permission')ctx.tables.roles[0].capabilities=ctx.tables.roles[0].capabilities.filter((cap:string)=>cap!=='blocks.ai');
   if(change==='disabled')ctx.handlers['settings/internals:getInternal']=()=>({disabledBlockNames:['core/paragraph']});
   if(change==='revision')ctx.tables.posts[0].blocksRevision++;
   return JSON.stringify(method===generatePage?[block()]:{body:'AI text'});
  };
  await expect(run(method,ctx,{postId:'post',blockId:'one',prompt:'A page'})).rejects.toBeDefined();
  expect(ctx.tables.posts[0].blocks[0].attrs.body).toBe('Original');
 }
});

test("AI proposals recheck access after generation and before every additional variant call", async () => {
 const {generatePageDraft,generateVariants,swapBlockType}=await import('../ai');
 const {getEditableDocumentForAi}=await import('../queries');
 for(const method of [generatePageDraft,generateVariants,swapBlockType]) {
  const ctx=harness([block()]);let providerCalls=0;
  ctx.handlers['blocks/queries:getEditableDocumentForAi']=getEditableDocumentForAi;
  ctx.handlers['ai/internals:generateWithClaude']=()=>{
   providerCalls++;ctx.tables.roles[0].capabilities=ctx.tables.roles[0].capabilities.filter((cap:string)=>cap!=='blocks.ai');
   return JSON.stringify(method===generatePageDraft?[block()]:{body:'Private generated text'});
  };
  await expect(run(method,ctx,{postId:'post',blockId:'one',prompt:'A page',targetBlockName:'core/paragraph',count:3})).rejects.toBeDefined();
  expect(providerCalls).toBe(1);
 }
});
