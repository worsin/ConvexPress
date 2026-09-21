import {test,expect} from 'bun:test';
import {resolveCanonicalData,validateCanonicalData} from './resolve';
import {planCanonicalData} from './planner';
const scope={websiteKey:'site',instanceKey:'staging'};
const policy={enabledPlugins:[],capabilities:["reference.targetResolution"],disabledBlocks:[]};
const tree=['core/breadcrumbs','core/anchor-nav','core/table-of-contents','core/site-info'].map((name,index)=>({id:`nav${index}`,name,version:1,attrs:{}}));
test('all four generated trusted navigation bindings retain discriminated DTOs and deduplicate identical jobs',async()=>{
  const calls:string[]=[];
  const data=await resolveCanonicalData([...tree,{...tree[2],id:'again'}],scope,policy,async()=>{throw Error('unexpected page read');},async(resolver,args)=>{
    calls.push(resolver);
    if(resolver==='content.breadcrumbs'){expect(args).toEqual({source:'auto'});return {items:[{label:'Current',href:'/page/current',current:true}],currentPath:'/page/current'};}
    if(resolver==='content.anchors')return {items:[]};
    if(resolver==='content.headings')return {items:[{label:'Heading',anchor:'heading',level:2}]};
    return {name:'Site',tagline:null,logo:null};
  });
  expect(calls.length).toBe(4);expect(Object.keys(data.dataByBlock).length).toBe(5);
  expect(validateCanonicalData([...tree,{...tree[2],id:'again'}],scope,policy,data)).toEqual(data);
  const forged=structuredClone(data);forged.dataByBlock.nav3={...forged.dataByBlock.nav3,data:{page:null}} as any;
  expect(()=>validateCanonicalData(tree,scope,policy,forged)).toThrow();
});
test('unsupported transport, oversized output and injected function descriptors refuse before or at their proper boundary',async()=>{
  let reads=0;
  try{await resolveCanonicalData([{id:'page',name:'core/featured-page',version:1,attrs:{page:'page-id'}},...tree],scope,policy,async()=>{reads++;return {page:null};});throw Error('accepted');}catch(error){expect(String(error)).toContain('navigation');}
  expect(reads).toBe(0);
  expect(()=>planCanonicalData([{...tree[0],data:{resolver:'admin.secret',args:{}}}],scope,policy)).toThrow();
  try{await resolveCanonicalData([tree[3]],scope,policy,async()=>({page:null}),async()=>({name:'x'.repeat(70000),tagline:null,logo:null}));throw Error('accepted');}catch(error){expect(String(error)).toContain('60KiB');}
});

test('child-page envelopes bind the requested depth and refuse orphaned or cyclic display trees',async()=>{
 const node={id:'children',name:'core/child-pages',version:1,attrs:{depth:1}};
 const items=[{id:'child',parentId:null,depth:1,label:'Child',href:'/page/child'}];
 const data=await resolveCanonicalData([node],scope,policy,async()=>({page:null}),async(resolver,args)=>{
  expect(resolver).toBe('content.childPages');expect(args).toEqual({depth:1});return {parentLabel:'Parent',items};
 });
 expect(validateCanonicalData([node],scope,policy,data)).toEqual(data);
 for(const addition of [
  {id:'grandchild',parentId:'child',depth:2,label:'Grandchild',href:'/page/child/grandchild'},
  {id:'orphan',parentId:'missing',depth:2,label:'Orphan',href:'/page/orphan'},
  {...items[0],parentId:'child'},
 ]){
  const forged=structuredClone(data);(forged.dataByBlock.children.data as any).items.push(addition);
  expect(()=>validateCanonicalData([node],scope,policy,forged)).toThrow();
 }
});

test('menu envelopes bind the selected resource and reject malformed navigation or unsafe links',async()=>{
 const node={id:'menu',name:'core/menu',version:1,attrs:{source:'menu',menu:'selected-menu'}};
 const result={menu:{id:'selected-menu',name:'Navigation'},items:[{id:'link',parentId:null,depth:0,kind:'link',label:'Visit',description:null,href:'/page/visit',target:'_self',rel:null}]};
 const data=await resolveCanonicalData([node],scope,policy,async()=>({page:null}),async(resolver,args)=>{expect(resolver).toBe('site.menu');expect(args).toEqual({source:'menu',menu:'selected-menu',location:'primary'});return result;});
 expect(validateCanonicalData([node],scope,policy,data)).toEqual(data);
 for(const wrong of [
  {...result,menu:{id:'other',name:'Other'}},
  {...result,items:[{...result.items[0],parentId:'missing',depth:1}]},
  {...result,items:[{...result.items[0],href:'javascript:alert(1)'}]},
  {...result,items:[{...result.items[0],target:'_blank',rel:null}]},
  {...result,items:[result.items[0],result.items[0]]},
 ]) {
  const forged=structuredClone(data);forged.dataByBlock.menu.data=wrong as any;
  expect(()=>validateCanonicalData([node],scope,policy,forged)).toThrow();
 }
 const switched=[{...node,attrs:{source:'location',location:'footer'}}];
 expect(()=>validateCanonicalData(switched,scope,policy,data)).toThrow();
});
