import { expect, test } from 'bun:test';
import { createRequire } from 'node:module';
import { act } from 'react';
import { loadStaged } from '../schema-editor/test-harness';
const require=createRequire(import.meta.url);
const {JSDOM}=createRequire(require.resolve('isomorphic-dompurify'))('jsdom');
test('native protection controls enforce saved unlocks, ordered movement and undo without writing implicitly',async()=>{
 const dom=new JSDOM('<div id="app"></div>',{url:'https://native.test'});
 const names=['window','document','HTMLElement','HTMLInputElement','HTMLTextAreaElement','Element','Node','MutationObserver','getComputedStyle','IS_REACT_ACT_ENVIRONMENT'];
 const previous=names.map(name=>[name,Object.getOwnPropertyDescriptor(globalThis,name)]);
 for(const name of names)Object.defineProperty(globalThis,name,{configurable:true,writable:true,value:name==='IS_REACT_ACT_ENVIRONMENT'?true:dom.window[name]});
 const loaded=await loadStaged('../canonical-editor/presentation.fixture.ts');
 const {CanonicalEditor,canonicalEditorAdapter}=loaded.module;
 const {createRoot}=await import('react-dom/client');
 const host=document.getElementById('app'),root=createRoot(host),saves=[],previews=[];
 const adapter=canonicalEditorAdapter({enabledPlugins:[],capabilities:[],disabledBlocks:[]},'core');
 const first={...adapter.createBlock('core/heading'),id:'first'},second={...adapter.createBlock('core/spacer'),id:'second'};
 const key={websiteKey:'site',instanceKey:'staging',documentId:'locks',generation:'operator'};
 let props={authorityReady:true,snapshot:{key,revision:1,value:{title:'Protection',blocks:[first,second]}},adapter,pickResource:async()=>null,
  livePreview:state=>{previews.push(state);return null},save:async request=>{saves.push(request);return {key,revision:request.revision+1,value:request.value}}};
 const render=()=>act(async()=>root.render(<CanonicalEditor {...props}/>));
 const button=name=>[...host.querySelectorAll('button')].find(el=>el.textContent===name);
 const checkbox=name=>[...host.querySelectorAll('label')].find(el=>el.textContent.trim()===name)?.querySelector('input');
 const click=el=>act(async()=>el.click());
 const spacing=()=>host.querySelector('select[aria-label="Block spacing"]');
 try{
  await render();await click(button('Move down'));
  expect(previews.at(-1).draft.blocks.map(node=>node.id)).toEqual(['second','first']);
  await click(button('Undo'));expect(previews.at(-1).draft.blocks.map(node=>node.id)).toEqual(['first','second']);
  for(const label of ['Prevent editing','Prevent moving','Prevent removal'])await click(checkbox(label));
  expect(spacing().closest('fieldset').disabled).toBe(true);expect(button('Move down').disabled).toBe(true);expect(button('Remove selected block').disabled).toBe(true);
  expect(saves).toHaveLength(0);await click(button('Save changes'));expect(saves[0].revision).toBe(1);
  expect(saves[0].value.blocks[0].lock).toEqual({edit:true,move:true,remove:true});
  for(const label of ['Prevent editing','Prevent moving','Prevent removal'])await click(checkbox(label));
  // A draft unlock cannot also change protected content or order.
  expect(spacing().closest('fieldset').disabled).toBe(true);expect(button('Move down').disabled).toBe(true);expect(button('Remove selected block').disabled).toBe(true);
  await click(button('Save changes'));expect(saves[1].revision).toBe(2);
  expect(spacing().closest('fieldset').disabled).toBe(false);expect(button('Move down').disabled).toBe(false);
  await click(button('Move down'));await click(button('Save changes'));expect(saves[2].value.blocks.map(node=>node.id)).toEqual(['second','first']);
  props={...props,authorityReady:false};await render();expect(checkbox('Prevent editing')).toBeUndefined();
 }finally{await act(async()=>root.unmount());await loaded.cleanup();dom.window.close();for(const [name,descriptor] of previous){if(descriptor)Object.defineProperty(globalThis,name,descriptor);else delete globalThis[name]}}
});
