import {test,expect} from 'bun:test';
import {resolveCanonicalData,validateCanonicalData} from './resolve';
const scope={websiteKey:'site',instanceKey:'staging'},policy={enabledPlugins:[],capabilities:[],disabledBlocks:[]};
const block=(id='latest',attrs={})=>({id,name:'core/latest-posts',version:2,attrs});
const card={id:'post',title:'Public story',href:'/blog/story',excerpt:null,publishedAt:1,author:null,image:null};
test('latest-posts plans use generated defaults, deduplicate identical reads and bind current attributes',async()=>{
 const tree=[block(),block('duplicate')];let calls=0;
 const envelope=await resolveCanonicalData(tree,scope,policy,async()=>{throw Error('wrong reader');},undefined,async args=>{calls++;expect(args.count).toBe(3);return {items:[card]};});
 expect(calls).toBe(1);expect(validateCanonicalData(tree,scope,policy,envelope)).toEqual(envelope);
 expect(()=>validateCanonicalData([block('latest',{count:1}),block('duplicate')],scope,policy,envelope)).toThrow('current canonical attributes');
 expect(()=>validateCanonicalData(tree,{...scope,instanceKey:'another'},policy,envelope)).toThrow('another environment');
});
test('missing reader fails before other reads; count and disclosure settings constrain server and consumer data',async()=>{
 let calls=0;await expect(resolveCanonicalData([block()],scope,policy,async()=>{calls++;return {page:null};})).rejects.toThrow('Trusted post reader');expect(calls).toBe(0);
 const tree=[block('latest',{count:1,showAuthors:false,showExcerpts:false})];
 for(const items of [[card,{...card,id:'extra',publishedAt:0}],[{...card,author:'Unexpected author'}],[{...card,excerpt:'Unexpected excerpt'}]]) {
   await expect(resolveCanonicalData(tree,scope,policy,async()=>null,undefined,async()=>({items}))).rejects.toThrow('selected count or disclosure');
   const valid=await resolveCanonicalData(tree,scope,policy,async()=>null,undefined,async()=>({items:[card]}));
   valid.dataByBlock.latest.data={items};
   expect(()=>validateCanonicalData(tree,scope,policy,valid)).toThrow('current canonical attributes');
 }
});
