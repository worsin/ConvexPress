import {test,expect} from "bun:test";
import {convexToJson,jsonToConvex} from "convex/values";
import {renderToStaticMarkup} from "react-dom/server";
import block from "../../../../../../../blocks/core/search-results/render";
import {BlockPaginationProvider} from "./pagination";
import {searchResultSchema,searchMatchesArgs,searchArgsSchema,SEARCH_QUERY_REQUEST_KEY} from "../block-data/portable/searchContracts";
import {blockPageRequestSchema} from "../block-data/portable/postGridContracts";
import {canonicalPaginationSearch} from "../block-public/pagination-search";
import {searchDemoItems} from "../../../../block-demo/search-adapter";
const result={state:"ready" as const,query:"<orchid>",items:searchDemoItems,cursor:"current",nextCursor:"next"};
test("search renderer escapes user/source text and preserves URL state in page links",()=>{
 const html=renderToStaticMarkup(<BlockPaginationProvider href="/library?q=%3Corchid%3E&campaign=summer"><block.View blockId="search" attrs={{}} resources={{media:{}}} data={result}/></BlockPaginationProvider>);
 expect(html).toContain("&lt;orchid&gt;");expect(html).not.toContain("<orchid>");
 for(const item of searchDemoItems)expect(html).toContain(item.title);
 expect(html).toContain('name="q"');expect(html).toContain('name="campaign"');expect(html).toContain('value="summer"');expect(html).toContain("Next results");expect(html).toContain("First results");
 expect(html).not.toContain("dangerouslySetInnerHTML");
});
test("search DTO rejects private fields, unsafe links and mismatched kind/query/cursor bindings",()=>{
 for(const patch of [{storageId:"secret"},{href:"javascript:alert(1)"}])expect(()=>searchResultSchema.parse({...result,items:[{...searchDemoItems[0],...patch}]})).toThrow();
 const args=searchArgsSchema.parse({query:"orchid",pageSize:12});expect(searchMatchesArgs(args,result)).toBe(false);
 expect(searchMatchesArgs({...args,query:result.query,cursor:result.cursor,kinds:["post"]},result)).toBe(false);
});
test("URL query enters a reserved request field and prototype keys remain forbidden",()=>{
 expect(canonicalPaginationSearch({q:"orchid",blockPages:{search:"next"}})).toEqual({blockPages:{[SEARCH_QUERY_REQUEST_KEY]:"orchid",search:"next"}});
 expect(canonicalPaginationSearch({q:123})).toEqual({blockPages:{[SEARCH_QUERY_REQUEST_KEY]:"123"}});
 expect(canonicalPaginationSearch({q:"",blockPages:{[SEARCH_QUERY_REQUEST_KEY]:"old"}})).toEqual({});
 expect(()=>blockPageRequestSchema.parse(JSON.parse('{"__proto__":"x"}'))).toThrow();
 expect(()=>canonicalPaginationSearch({q:"x".repeat(501)})).toThrow();
});
test("idle and empty search states do not retain prior result links",()=>{
 for(const state of ["idle","ready"] as const){const html=renderToStaticMarkup(<block.View blockId="search" attrs={{emptyMessage:"Try a different word."}} resources={{media:{}}} data={{state,query:state==="idle"?"":"orchid",items:[],cursor:null,nextCursor:null}}/>);expect(html).not.toContain(searchDemoItems[0].href);expect(html).toContain(state==="idle"?"Start with a little curiosity.":"Try a different word.");}
});

test("search URL requests survive the real Convex transport codec",()=>{
 const request=canonicalPaginationSearch({q:"orchid",blockPages:{search:"next"}}).blockPages;
 expect(jsonToConvex(convexToJson({request}))).toEqual({request});
});
