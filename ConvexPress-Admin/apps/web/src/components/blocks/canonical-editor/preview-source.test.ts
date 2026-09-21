import {test,expect} from "bun:test";
import {previewSourceKey} from "./preview-source";
import type {CanonicalDocumentDto} from "@backend/canonical-blocks-foundation/documentContracts";
const value:CanonicalDocumentDto={contract:"canonical-document-v1",scope:{websiteKey:"site",instanceKey:"stage"},
 document:{id:"page",type:"page",title:"Collection",status:"publish",path:"/collection",blocksVersion:2,revision:1,digest:"a".repeat(64),blocks:[]},
 presentation:{packId:"core",revision:"b".repeat(64)},policy:{enabledPlugins:["commerce"],capabilities:[],disabledBlocks:[]},
 data:{contract:"canonical-data-v1",scope:{websiteKey:"site",instanceKey:"stage"},dataByBlock:{}},resources:{media:{}}};
test("resolver continuations do not close a current saved preview",()=>{
 const next={...value,data:{...value.data,request:{categories:"signed-next-chunk"}}};
 expect(previewSourceKey(next)).toBe(previewSourceKey(value));
});
test("source, presentation, authority and installation changes revoke the saved preview",()=>{
 for(const changed of [
  {...value,scope:{...value.scope,instanceKey:"production"}},
  {...value,document:{...value.document,revision:2}},
  {...value,document:{...value.document,digest:"c".repeat(64)}},
  {...value,document:{...value.document,status:"private" as const}},
  {...value,presentation:{...value.presentation,revision:"d".repeat(64)}},
  {...value,policy:{...value.policy,enabledPlugins:[]}},
 ])expect(previewSourceKey(changed)).not.toBe(previewSourceKey(value));
 expect(previewSourceKey(null)).toBeNull();expect(previewSourceKey(undefined)).toBeNull();
});
