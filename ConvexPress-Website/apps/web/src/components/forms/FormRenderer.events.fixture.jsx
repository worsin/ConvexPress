import { mock } from 'bun:test';
import { JSDOM } from 'jsdom';
import assert from 'node:assert/strict';
const dom = new JSDOM('<!doctype html><div id="root"></div>', {url:'https://example.test'});
Object.assign(globalThis,{window:dom.window,document:dom.window.document,HTMLElement:dom.window.HTMLElement,IS_REACT_ACT_ENVIRONMENT:true});
mock.module('@/lib/auth/clerk',()=>({useAuth:()=>({isLoaded:true,isSignedIn:false})}));
mock.module('convex/react',()=>({useMutation:()=>async()=>{},useAction:()=>async()=>{},useConvex:()=>({})}));
mock.module('@/lib/html-sanitizer',()=>({default:{sanitize:v=>v}}));
const {act,createElement,StrictMode,useState}=await import('react');
const {createRoot}=await import('react-dom/client');
const {FormRenderer}=await import('./FormRenderer');
const form={_id:'form-history',title:'Inquiry',slug:'inquiry',settings:'{}',fields:[
 {key:'email',name:'email',label:'Email',type:'text',required:false,settings:'{}',menuOrder:0},
 {key:'company',name:'company',label:'Company',type:'text',required:false,settings:'{}',menuOrder:1},
]};
const notifications=[],errors=[];const originalError=console.error;console.error=(...args)=>errors.push(args.join(' '));
function Wizard(){const [values,setValues]=useState({});return createElement('div',null,
 createElement(FormRenderer,{form,hideSubmit:true,onValuesChange:next=>{notifications.push(next);setValues(next);}}),
 createElement('output',null,JSON.stringify(values)));}
const root=createRoot(document.getElementById('root'));
await act(async()=>root.render(createElement(StrictMode,null,createElement(Wizard))));
const inputs=[...document.querySelectorAll('input')].filter(v=>v.type!=='hidden');
const email=inputs.find(v=>v.id.endsWith('-email')),company=inputs.find(v=>v.id.endsWith('-company'));
assert.ok(email&&company,'Both actual renderer fields are mounted');
const change=(input,value)=>{Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype,'value').set.call(input,value);input.dispatchEvent(new dom.window.Event('input',{bubbles:true}));};
await act(async()=>{change(email,'a');change(company,'Studio');change(email,'ada@example.invalid');});
assert.equal(notifications.length,3,'One parent notification per edit under StrictMode');
assert.deepEqual(notifications.at(-1),{email:'ada@example.invalid',company:'Studio'});
assert.equal(document.querySelector('output').textContent,JSON.stringify(notifications.at(-1)));
assert.equal(email.value,'ada@example.invalid');assert.equal(company.value,'Studio');
assert.equal(errors.filter(e=>/Cannot update a component|while rendering|Maximum update/.test(e)).length,0,errors.join('\n'));
await act(async()=>root.unmount());console.error=originalError;dom.window.close();
console.log(JSON.stringify({strictMode:true,edits:3,notifications:notifications.length,retainedBothFields:true,renderWarnings:0}));
