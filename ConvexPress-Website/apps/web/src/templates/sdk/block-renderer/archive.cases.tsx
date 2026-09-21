import {test,expect} from "bun:test";
import {renderToStaticMarkup} from "react-dom/server";
import block from "../../../../../../../blocks/core/archive-list/render";
import {prepareBlocks} from "./model";
import {BlockPaginationProvider} from "./pagination";
import {createDemoContentPageHost} from "../block-data/demo-channel";
import {resolveCanonicalData} from "../block-data/portable/resolve";
import {planCanonicalData} from "../block-data/portable/planner";
import {archiveResultSchema,type ArchiveResult} from "../block-data/portable/archiveContracts";
const policy={enabledPlugins:[],capabilities:[],disabledBlocks:[]};
const current={scope:{websiteKey:"archive",instanceKey:"test"},documentKey:"page",revision:"1",viewerKey:"visitor"};
const tree=[{id:"archive",name:"core/archive-list",version:1,attrs:{groupBy:"month",limit:12}}];
const data:ArchiveResult={groupBy:"month",timeZone:"UTC",items:[{year:2026,month:9,href:"/archive?year=2026&month=9"}],cursor:null,nextCursor:"next"};
async function install(result:ArchiveResult){const parameters:Parameters<typeof resolveCanonicalData>=[tree,current.scope,policy,async()=>null];parameters[33]=async()=>result;const envelope=await resolveCanonicalData(...parameters),host=createDemoContentPageHost(),grant=host.install({tree,context:current,policy,envelope});return {host,render:(context=current)=>renderToStaticMarkup(<BlockPaginationProvider href="/story?search=retained">{prepareBlocks(tree,{"core/archive-list":block},policy,{media:{}},{grant,current:context})}</BlockPaginationProvider>)};}
test("archive labels select real date destinations and preserve pagination host state",async()=>{const html=(await install(data)).render();expect(html).toContain("September");expect(html).toContain("/archive?year=2026&amp;month=9");expect(html).toContain('aria-label="Archive list pagination"');expect(html).toContain("search=retained");});
test("archive resolver binds grouping, limit and cursor, rejecting fake counts and destinations",async()=>{
 expect(planCanonicalData(tree,current.scope,policy,{archive:"next"}).jobs[0]?.args).toEqual({groupBy:"month",limit:12,cursor:"next"});
 await expect(install({...data,cursor:"other"})).rejects.toThrow();await expect(install({...data,groupBy:"year",items:[]})).rejects.toThrow();
 for(const result of [{...data,items:[{...data.items[0],href:"/blog"}]},{...data,items:[{...data.items[0],count:10}]},{...data,items:[data.items[0],data.items[0]]}])expect(()=>archiveResultSchema.parse(result)).toThrow();
});
test("archive viewer changes invalidate data and empty scan pages preserve continuation",async()=>{const {host,render}=await install(data);expect(()=>render({...current,viewerKey:"other"})).toThrow();host.invalidate();expect(()=>render()).toThrow();expect((await install({...data,items:[]})).render()).toContain("Earlier dates");expect((await install({...data,items:[],nextCursor:null})).render()).toContain("first story");});
