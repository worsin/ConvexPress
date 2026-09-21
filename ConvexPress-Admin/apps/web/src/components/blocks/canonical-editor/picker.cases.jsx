import {expect,test} from 'bun:test';
import {createRequire} from 'node:module';
import {act} from 'react';
import {loadStaged} from '../schema-editor/test-harness';
const require=createRequire(import.meta.url);
const {JSDOM}=createRequire(require.resolve('isomorphic-dompurify'))('jsdom');
for(const [kind,storage] of [['mailingList','id'],['event','id'],['kbCategory','id'],['course','id'],['instructor','id'],['album','id'],['recipe','id'],['menu','id'],['category','slug'],['tag','slug'],['category','id'],['tag','id'],['user','id'],['eventCategory','id'],['product','id'],['product','slug'],['productCategory','slug'],['productTag','slug'],['productCategory','id'],['productTag','id']]) test(`${kind} ${storage} picker loads real choices and rechecks document authority before returning a scoped selection`,async()=>{
 const dom=new JSDOM('<div id="app"></div>',{url:'https://native.test',pretendToBeVisual:true});
 const names=['window','document','navigator','HTMLElement','HTMLInputElement','HTMLButtonElement','Element','Node','MutationObserver','getComputedStyle','requestAnimationFrame','cancelAnimationFrame','IS_REACT_ACT_ENVIRONMENT'];
 const old=names.map(name=>[name,Object.getOwnPropertyDescriptor(globalThis,name)]);
 for(const name of names)Object.defineProperty(globalThis,name,{configurable:true,writable:true,value:name==='IS_REACT_ACT_ENVIRONMENT'?true:dom.window[name]});
 const loaded=await loadStaged('../canonical-editor/CanonicalResourcePicker.tsx');
 const {createRoot}=await import('react-dom/client');const root=createRoot(document.getElementById('app'));
 const results=[],controller=new AbortController();let checks=0,denied=false;
 const request={field:kind==='menu'?{type:'menu',id:'menu'}:{type:'reference',id:kind+'Slug',of:kind,storage},scope:{websiteKey:'site',instanceKey:'staging'},signal:controller.signal};
 const client={mailingListOptions:async()=>({page:[{id:"list-1",name:"Studio navigation"}],isDone:true,continueCursor:""}),eventOptions:async()=>({page:[{id:"event-1",providerId:"community-events",title:"Studio navigation",slug:"studio"}],isDone:true,continueCursor:""}),kbCategoryOptions:async()=>({page:[{id:"kb-category-1",name:"Studio navigation",slug:"studio-help"}],isDone:true,continueCursor:""}),courseOptions:async()=>({page:[{id:"course-1",title:"Studio navigation",slug:"studio-course"}],isDone:true,continueCursor:""}),instructorOptions:async()=>({page:[{id:"instructor-1",displayName:"Studio navigation"}],isDone:true,continueCursor:""}),albumOptions:async()=>({page:[{id:"album-1",title:"Studio navigation",slug:"studio"}],isDone:true,continueCursor:""}),recipeOptions:async()=>({page:[{id:"recipe-1",title:"Studio navigation",slug:"studio"}],isDone:true,continueCursor:""}),productTermOptions:async(taxonomy)=>{expect(taxonomy).toBe(kind);return {page:[{id:'catalog-term-1',name:'Studio navigation',slug:'catalog-studio',taxonomy}],isDone:true,continueCursor:''};},productOptions:async()=>({page:[{id:"product-1",title:"Studio navigation",slug:"studio"}],isDone:true,continueCursor:""}),eventCategoryOptions:async()=>({page:[{id:'event-category-1',name:'Studio navigation',slug:'studio'}],isDone:true,continueCursor:''}),authorOptions:async()=>({page:[{id:'author-1',displayName:'Studio navigation'}],isDone:true,continueCursor:''}),authorize:async()=>{checks++;if(denied)throw Error('revoked');},menuOptions:async()=>({page:[{id:'menu-1',name:'Studio navigation',slug:'studio'}],isDone:true,continueCursor:''}),termOptions:async(taxonomy)=>{expect(taxonomy).toBe(kind);return {page:[{id:'term-1',name:'Studio navigation',slug:'studio-notes',taxonomy}],isDone:true,continueCursor:''};},pageOptions:async()=>{throw Error('wrong picker');},media:async()=>null};
 try{
  await act(async()=>root.render(<loaded.module.CanonicalResourcePicker request={request} client={client} onResult={value=>results.push(value)}/>));
  await act(async()=>{await new Promise(resolve=>setTimeout(resolve,30));});
  expect(document.body.textContent).toContain(kind==='mailingList'?'Choose an active mailing list':kind==='event'?'Choose an RSVP event':kind==='kbCategory'?'Choose a help category':kind==='course'?'Choose a published course':kind==='instructor'?'Choose an instructor':kind==='album'?'Choose a published album':kind==='recipe'?'Choose a published recipe':kind==='productCategory'?'Choose a product category':kind==='productTag'?'Choose a product tag':kind==='product'?'Choose a published product':kind==='eventCategory'?'Choose an event category':kind==='user'?'Choose an author':`Choose a ${kind}`);
  const choice=[...document.querySelectorAll('button')].find(button=>button.textContent.includes('Studio navigation'));
  expect(choice).toBeDefined();
  if(kind==='event')expect(choice.textContent).toContain("/community-events/studio");
  denied=true;
  await act(async()=>choice.click());
  expect(results).toEqual([]);expect(document.body.textContent).toContain('could not be verified');
  denied=false;
  await act(async()=>choice.click());
  expect(results).toEqual([{label:"Studio navigation",scope:request.scope,value:kind==='mailingList'?'list-1':kind==='event'?'event-1':kind==='kbCategory'?'kb-category-1':kind==='course'?'course-1':kind==='instructor'?'instructor-1':kind==='album'?'album-1':kind==='recipe'?'recipe-1':kind==='productCategory'||kind==='productTag'?(storage==='slug'?'catalog-studio':'catalog-term-1'):kind==='product'?(storage==='slug'?'studio':'product-1'):kind==='menu'?'menu-1':kind==='user'?'author-1':kind==='eventCategory'?'event-category-1':storage==='slug'?'studio-notes':'term-1'}]);expect(checks).toBe(3);
  await act(async()=>controller.abort());expect(results.at(-1)).toBeNull();
 }finally{
  await act(async()=>root.unmount());await loaded.cleanup();dom.window.close();
  for(const [name,descriptor] of old){if(descriptor)Object.defineProperty(globalThis,name,descriptor);else delete globalThis[name];}
 }
});

for (const policy of ['pinned', 'latest']) test(`reusable picker ${policy} validates the exact published choice and returns atomic revision metadata`, async () => {
 const dom = new JSDOM('<div id="app"></div>', { url: 'https://native.test', pretendToBeVisual: true });
 const names=['window','document','navigator','HTMLElement','HTMLInputElement','HTMLButtonElement','Element','Node','MutationObserver','getComputedStyle','requestAnimationFrame','cancelAnimationFrame','IS_REACT_ACT_ENVIRONMENT'];
 const old=names.map(name=>[name,Object.getOwnPropertyDescriptor(globalThis,name)]);
 for(const name of names)Object.defineProperty(globalThis,name,{configurable:true,writable:true,value:name==='IS_REACT_ACT_ENVIRONMENT'?true:dom.window[name]});
 const loaded=await loadStaged('../canonical-editor/CanonicalResourcePicker.tsx'), {createRoot}=await import('react-dom/client'), root=createRoot(document.getElementById('app'));
 const controller=new AbortController(), scope={websiteKey:'site',instanceKey:'stage'}, results=[];
 const request={name:'core/synced',blockId:'reuse',revision:'9',path:['syncedBlock'],field:{type:'reference',id:'syncedBlock',of:'syncedBlock'},scope,signal:controller.signal};
 let denied=false, foreign=true, checks=0, calls=0;
 const client={authorize:async()=>{checks++;if(denied)throw Error('revoked');},syncedOptions:async()=>({page:[{id:'footer',title:'Studio footer',revision:5,digest:'5'.repeat(64)}],isDone:true,continueCursor:''}),syncedRevisions:async(id,published,cursor)=>{
   expect(id).toBe('footer');expect(published).toBe(5);
   // A page of private drafts has no public options, but its cursor still advances.
   return {sourceId:id,publishedRevision:5,page:cursor?[{title:'Original footer',revision:2,digest:'2'.repeat(64)}]:[],isDone:!!cursor,continueCursor:cursor?'':'older'};
 },syncedSelect:async(id,published,revisionPolicy,revision)=>{calls++;return {scope:foreign?{...scope,instanceKey:'wrong'}:scope,id,publishedRevision:published,revisionPolicy,revision,digest:String(revision).repeat(64)};}};
 const click = async text => { const button=[...document.querySelectorAll('button')].find(item=>item.textContent===text || item.textContent.startsWith(text));expect(button).toBeDefined();await act(async()=>button.click()); };
 try {
   await act(async()=>root.render(<loaded.module.CanonicalResourcePicker request={request} client={client} onResult={value=>results.push(value)}/>));
   await click('Studio footer');
   expect(document.body.textContent).toContain('How should this section update?');
   expect(document.querySelector('select').value).toBe('5');
   await click('Load older revisions');
   expect(document.querySelectorAll('option').length).toBe(2);
   if(policy==='latest')await act(async()=>document.querySelectorAll('input[type=radio]')[1].click());
   else await act(async()=>{const input=document.querySelector('select');input.value='2';input.dispatchEvent(new dom.window.Event('change',{bubbles:true}));});
   denied=true;await click('Use this section');expect(results).toEqual([]);expect(calls).toBe(0);
   denied=false;await click('Use this section');expect(results).toEqual([]);expect(calls).toBe(1);
   foreign=false;await click('Use this section');
   expect(results).toEqual([{scope,value:'footer',syncedRevision:{revisionPolicy:policy,revision:policy==='latest'?5:2}}]);expect(checks).toBeGreaterThan(4);
   await act(async()=>controller.abort());expect(results.at(-1)).toBeNull();
 } finally {
   await act(async()=>root.unmount());await loaded.cleanup();dom.window.close();
   for(const [name,descriptor] of old){if(descriptor)Object.defineProperty(globalThis,name,descriptor);else delete globalThis[name];}
 }
});
