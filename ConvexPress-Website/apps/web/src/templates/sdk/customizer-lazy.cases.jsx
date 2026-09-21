import {test,expect,mock} from 'bun:test';
import {act,StrictMode} from 'react';
import {JSDOM} from 'jsdom';
let allowed=false,open=false,renders=0;
mock.module('@/hooks/useCan',()=>({useCan:()=>allowed}));
mock.module('./useTemplateSettings',()=>({useTemplateCustomizer:()=>({open})}));
mock.module('./CustomizerPanel',()=>({default:()=>{renders++;return <aside aria-label="Customize template">Editor controls</aside>;}}));
const {OnSiteCustomizer}=await import('./OnSiteCustomizer');
test('lazy on-site editor requires both current authority and an explicit open request, and clears on revocation',async()=>{
 const dom=new JSDOM('<div id="app"></div>',{url:'https://site.example.invalid'}),previous={};
 for(const name of ['window','document','navigator','HTMLElement','Event','IS_REACT_ACT_ENVIRONMENT']){previous[name]=Object.getOwnPropertyDescriptor(globalThis,name);Object.defineProperty(globalThis,name,{configurable:true,writable:true,value:name==='IS_REACT_ACT_ENVIRONMENT'?true:dom.window[name]});}
 const {createRoot}=await import('react-dom/client'),root=createRoot(document.getElementById('app'));
 const render=()=>act(async()=>root.render(<StrictMode><OnSiteCustomizer/></StrictMode>));
 try{
  await render();expect(renders).toBe(0);open=true;await render();expect(renders).toBe(0);
  allowed=true;open=false;await render();expect(renders).toBe(0);
  open=true;await render();expect(document.querySelector('aside')!==null).toBe(true);expect(renders>0).toBe(true);
  allowed=false;await render();expect(document.querySelector('aside')).toBeNull();
 }finally{await act(async()=>root.unmount());dom.window.close();for(const [name,value]of Object.entries(previous)){if(value)Object.defineProperty(globalThis,name,value);else delete globalThis[name];}}
});
