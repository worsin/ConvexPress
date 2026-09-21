import {test,expect} from "bun:test";
import {readTagArchive,tagArchiveSearch,tagArchiveCards,type TagArchiveResult} from "./tag-archive";
const ready={scope:{websiteKey:"site",instanceKey:"stage"},viewerSubject:null,slug:"making",tag:null,items:[],cursor:null,nextCursor:null,resetRequired:false} satisfies NonNullable<TagArchiveResult>;
const binding={slug:"making",instanceKey:"stage",viewerSubject:null};
test("archive display refuses stale viewer, installation, slug and cursor before rendering",()=>{
 expect(readTagArchive(ready,binding)).toEqual(ready);expect(readTagArchive(null,binding)).toBeNull();
 for(const mismatch of [{viewerSubject:"previous-viewer"},{instanceKey:"production"},{slug:"different"},{cursor:"other"}])
  expect(()=>readTagArchive(ready,{...binding,...mismatch})).toThrow("another view");
});
test("URL parsing bounds cursor state; cards keep only returned display data and real story slugs",()=>{
 expect(tagArchiveSearch({cursor:"page-two",unrelated:true})).toEqual({cursor:"page-two"});expect(tagArchiveSearch({})).toEqual({});
 for(const cursor of [true,{},"x".repeat(4097)])expect(()=>tagArchiveSearch({cursor})).toThrow("Invalid archive position");
 const cards=tagArchiveCards({...ready,items:[{id:"post",title:"Making",href:"/blog/wood%20%26%20wool",excerpt:null,publishedAt:100,author:"Public writer",image:null}]});
 expect(cards[0]!.slug).toBe("wood & wool");expect(cards[0]!.author.displayName).toBe("Public writer");expect(cards[0]!.author.slug).toBe("");expect(cards[0]!.readingTime).toBeUndefined();
});


test("archive pagination survives the router JSON search parser",async()=>{
 const{defaultParseSearch}=await import("@tanstack/react-router");
 const{tagArchiveHref}=await import("./tag-archive");
 const cursor=JSON.stringify({version:1,binding:"a".repeat(64),key:["topic",true,123,456,"relation"]});
 const href=tagArchiveHref("making",cursor);
 expect(tagArchiveSearch(defaultParseSearch(new URL(href,"https://example.invalid").search))).toEqual({cursor});
 expect(tagArchiveHref("making",null)).toBe("/tag/making");
});
