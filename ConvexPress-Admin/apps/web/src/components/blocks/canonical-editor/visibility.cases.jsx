import { expect, test } from 'bun:test';
import { createRequire } from 'node:module';
import { act } from 'react';
import { loadStaged } from '../schema-editor/test-harness';
const require=createRequire(import.meta.url);
const {JSDOM}=createRequire(require.resolve('isomorphic-dompurify'))('jsdom');
test('audience controls preserve authored data, preview, history and saved protections',async()=>{
 const dom=new JSDOM('<div id="app"></div>',{url:'https://native.test'});
 const names=['window','document','HTMLElement','HTMLInputElement','HTMLTextAreaElement','Element','Node','MutationObserver','getComputedStyle','IS_REACT_ACT_ENVIRONMENT'];
 const previous=names.map(name=>[name,Object.getOwnPropertyDescriptor(globalThis,name)]);
 for(const name of names)Object.defineProperty(globalThis,name,{configurable:true,writable:true,value:name==='IS_REACT_ACT_ENVIRONMENT'?true:dom.window[name]});
 const loaded=await loadStaged('../canonical-editor/presentation.fixture.ts');
 const {CanonicalEditor,canonicalEditorAdapter,checkedDraft}=loaded.module;
 const {createRoot}=await import('react-dom/client');
 const host=document.getElementById('app'),root=createRoot(host),saves=[],previews=[];
 const adapter=canonicalEditorAdapter({enabledPlugins:[],capabilities:[],disabledBlocks:[]},'core');
 const heading={...adapter.createBlock('core/heading'),id:'heading'};
 const key={websiteKey:'site',instanceKey:'staging',documentId:'audience',generation:'operator'};
 const props={authorityReady:true,snapshot:{key,revision:1,value:{title:'Audiences',blocks:[heading]}},adapter,pickResource:async()=>null,livePreview:state=>{previews.push(state);return null},save:async request=>{saves.push(request);return {key,revision:request.revision+1,value:request.value}}};
 const button=name=>[...host.querySelectorAll('button')].find(el=>el.textContent===name);
 const control=()=>[...host.querySelectorAll('label')].find(el=>el.textContent.includes('Block visibility'))?.querySelector('select');
 const select=value=>act(async()=>{control().value=value;control().dispatchEvent(new dom.window.Event('change',{bubbles:true}));});
 const click=el=>act(async()=>el.click());
 try{
  await act(async()=>root.render(<CanonicalEditor {...props}/>));
  expect(control().value).toBe('everyone');
  expect([...control().options].map(x=>x.value)).toEqual(['everyone','signedIn','signedOut']);
  for(const visibility of ['signedIn','signedOut','everyone']){
   await select(visibility);expect(previews.at(-1).draft.blocks[0].visibility).toBe(visibility);
   expect(previews.at(-1).draft.blocks[0].attrs).toEqual(heading.attrs);
   expect(checkedDraft(previews.at(-1).draft).blocks[0].visibility).toBe(visibility);
  }
  await click(button('Undo'));expect(control().value).toBe('signedOut');
  await click(button('Redo'));expect(control().value).toBe('everyone');
  expect(saves).toHaveLength(0);await click(button('Save changes'));expect(saves[0].value.blocks[0].visibility).toBe('everyone');
  const lock=[...host.querySelectorAll('label')].find(el=>el.textContent.trim()==='Prevent editing').querySelector('input');
  await click(lock);expect(control().closest('fieldset').disabled).toBe(true);
  expect(()=>adapter.withVisibility(heading,'unknown')).toThrow();
  await act(async()=>root.render(<CanonicalEditor {...props} authorityReady={false}/>));expect(control()).toBeUndefined();
 }finally{await act(async()=>root.unmount());await loaded.cleanup();dom.window.close();for(const [name,descriptor] of previous){if(descriptor)Object.defineProperty(globalThis,name,descriptor);else delete globalThis[name]}}
});
