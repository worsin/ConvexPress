import { expect, test } from "bun:test";
import { commerceHarness } from "../../commerce/__tests__/handlerHarness.test-support";
import { BLOCK_CATALOG, buildBlockCatalogPrompt, extractJson, validateAttrsForCatalogEntry } from "../aiPromptBuilder";
const run = (fn: any, ctx: any, args: any) => fn._handler(ctx, args);
const block = (name = "core/paragraph", attrs: any = { body: "Original" }, id = "one") => ({ id, name, attrs, version: 1 });
function harness(blocks: any[] = [], disabled: string[] = []) {
 const ctx = commerceHarness({ posts: [{ _id: "post", authorId: "admin", type: "page", status: "auto-draft", title: "Page", blocks, blocksRevision: 0 }] });
 ctx.tables.roles[0].capabilities.push("page.update", "blocks.ai");
 ctx.handlers["settings/internals:getInternal"] = () => ({ disabledBlockNames: disabled });
 return ctx;
}
test("portable schemas and AI metadata are available and disabled names excluded",()=>{
 expect(validateAttrsForCatalogEntry("commerce/product-showcase",{count:4}).ok).toBe(true);
 expect(validateAttrsForCatalogEntry("commerce/product-showcase",{count:200}).ok).toBe(false);
 expect(buildBlockCatalogPrompt()).toContain("## commerce/product-showcase");
 expect(buildBlockCatalogPrompt()).toContain("homepage featured products");
 expect(buildBlockCatalogPrompt(["commerce/product-showcase"])).not.toContain("## commerce/product-showcase");
});

test("AI JSON extraction treats brackets and escaped quotes inside copy as text",()=>{
 const value=[{name:"core/paragraph",attrs:{body:'A ] bracket, a } brace and \\"quoted\\" text.'}}];
 expect(extractJson("Here is your page: "+JSON.stringify(value)+" End.")).toEqual(value);
 expect(extractJson("Here is [a note] followed by "+JSON.stringify(value))).toEqual(value);
});

test("generic page/post updates cannot bypass block contracts or disabled-add policy",async()=>{
 const pages=await import('../../pages/mutations'); const posts=await import('../../posts/mutations');
 for(const [kind, methods] of [['page',pages],['post',posts]] as const) {
  for(const blocks of [[block('unregistered/block')],[block('core/paragraph')]]) {
   const ctx=harness([],['core/paragraph']); ctx.tables.posts[0].type=kind;ctx.tables.posts[0].authorId='admin';
   ctx.tables.roles[0].capabilities.push('page.create','post.create','post.update');
   expect(ctx.tables.posts).toHaveLength(1);
   await expect(run(methods.update,ctx,{[kind==='page'?'pageId':'postId']:'post',blocks})).rejects.toBeDefined();
   expect(ctx.tables.posts[0].blocks).toEqual([]);
  }
 }
});

test("all catalog AI examples validate against their declared schemas",async()=>{
 for(const entry of BLOCK_CATALOG) expect(validateAttrsForCatalogEntry(entry.name,entry.example).ok).toBe(true);

});
