import { expect, test } from "bun:test";
import { removeFromArticle, addToArticle } from "../tags";
import { commerceHarness } from "../../commerce/__tests__/handlerHarness.test-support";

test("untagging deletes only the article-tag link and decrements its count", async () => {
 const ctx=commerceHarness({
  settings:[{_id:"plugins",section:"plugins",values:{knowledgeBaseEnabled:true}}],
  roles:[{_id:"role",slug:"author",type:"internal",status:"active",capabilities:["kb.editOwn"]}],
  kb_articles:[{_id:"article",authorId:"admin"}],
  kb_articleTags:[{_id:"link",articleId:"article",tagId:"tag"}],
  kb_tags:[{_id:"tag",articleCount:1}],
  kb_bookmarks:[{_id:"bookmark",articleId:"article",userId:"admin"}],
 });
 // Convex's two-argument DB API checks that the ID belongs to the supplied table.
 const deleteRow=ctx.db.delete;
 ctx.db.delete=async(table:string,id:string)=>{
  if(!ctx.tables[table]?.some((row:any)=>row._id===id)) throw new Error("Document ID does not belong to the specified table");
  return deleteRow(table,id);
 };
 const result=await (removeFromArticle as any)._handler(ctx,{articleId:"article",tagId:"tag"});
 expect(result).toBe("link");expect(ctx.tables.kb_articleTags).toHaveLength(0);expect(ctx.tables.kb_tags[0].articleCount).toBe(0);expect(ctx.tables.kb_bookmarks).toHaveLength(1);
 expect(await (removeFromArticle as any)._handler(ctx,{articleId:"article",tagId:"tag"})).toBeNull();expect(ctx.tables.kb_tags[0].articleCount).toBe(0);
});

test("a signed-in customer cannot change another author's article tags", async () => {
 const ctx=commerceHarness({
  settings:[{_id:"plugins",section:"plugins",values:{knowledgeBaseEnabled:true}}],
  users:[{_id:"customer",authSource:"local",status:"active",email:"customer@example.test",roleId:"customer-role"}],
  roles:[{_id:"customer-role",slug:"customer",type:"customer",status:"active",capabilities:[]}],
  kb_articles:[{_id:"article",authorId:"author"}],kb_tags:[{_id:"tag",articleCount:1}],
  kb_articleTags:[{_id:"link",articleId:"article",tagId:"tag"}],
 },"customer");
 for(const handler of [addToArticle,removeFromArticle]) await expect((handler as any)._handler(ctx,{articleId:"article",tagId:"tag"})).rejects.toThrow();
 expect(ctx.tables.kb_articleTags).toHaveLength(1);expect(ctx.tables.kb_tags[0].articleCount).toBe(1);
});
