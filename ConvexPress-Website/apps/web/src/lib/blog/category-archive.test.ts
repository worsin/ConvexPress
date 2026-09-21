import {test,expect} from "bun:test";
import {defaultParseSearch} from "@tanstack/react-router";
import {categoryArchiveHref,categoryArchiveSearch,bindCategoryResponse} from "./category-archive";
test("post and child pagination preserve independent JSON cursor state through the router",()=>{
 const cursor=JSON.stringify({version:1,key:["post",true,1]}),childrenCursor=JSON.stringify({version:1,termId:"child"});
 const search={cursor,childrenCursor};
 expect(categoryArchiveSearch(defaultParseSearch(new URL(categoryArchiveHref("materials",search),"https://fixture.invalid").search))).toEqual(search);
 expect(categoryArchiveSearch(defaultParseSearch(new URL(categoryArchiveHref("materials",{childrenCursor}),"https://fixture.invalid").search))).toEqual({childrenCursor});
 for(const value of [{},true,"a".repeat(4097)])expect(()=>categoryArchiveSearch({childrenCursor:value})).toThrow();
});
test("category responses cannot cross viewer, environment, slug or continuation bindings",()=>{
 const value={scope:{websiteKey:"site",instanceKey:"stage"},viewerSubject:null,slug:"materials",items:[],cursor:null,nextCursor:null,resetRequired:false};
 const expected={slug:"materials",instanceKey:"stage",viewerSubject:null};
 expect(bindCategoryResponse(value,expected)).toEqual(value);
 for(const changed of [{slug:"other"},{instanceKey:"production"},{viewerSubject:"customer"},{cursor:"other"}])expect(()=>bindCategoryResponse(value,{...expected,...changed})).toThrow("another view");
});
