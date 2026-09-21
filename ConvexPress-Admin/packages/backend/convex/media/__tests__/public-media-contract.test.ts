import { expect, test } from "bun:test";
import { commerceHarness } from "../../commerce/__tests__/handlerHarness.test-support";
import { getPublic } from "../queries";
test("public media exposes fresh rendering sizes without private metadata", async () => {
 const ctx=commerceHarness({ media:[{_id:"media1",status:"active",title:"Oak",url:"https://example.test/original.jpg",uploadedBy:"private-user",mediaType:"image"}], mediaSizes:[{_id:"size1",mediaId:"media1",sizeName:"thumbnail",url:"https://example.test/stale.jpg",storageId:"thumb-storage",width:150,height:150,fileSize:1000}] });
 ctx.storage={getUrl:async(id:string)=>`https://example.test/${id}.jpg`};
 const result=await (getPublic as any)._handler(ctx,{mediaId:"media1"});
 expect(result.sizesMap.thumbnail).toEqual({url:"https://example.test/thumb-storage.jpg",width:150,height:150});
 expect(result.uploadedBy).toBeUndefined();expect(result.sizesMap.thumbnail.fileSize).toBeUndefined();
});
