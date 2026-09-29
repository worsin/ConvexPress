import { mock } from 'bun:test';
import { JSDOM } from 'jsdom';
import assert from 'node:assert/strict';
const dom=new JSDOM('<!doctype html><div id="root"></div>',{url:'https://example.test/forms/resume/resume/proof'});
Object.assign(globalThis,{window:dom.window,document:dom.window.document,HTMLElement:dom.window.HTMLElement,IS_REACT_ACT_ENVIRONMENT:true});
const {act,createElement,useSyncExternalStore}=await import('react');
const router=await import('@tanstack/react-router');
const form={_id:'form-resume',title:'Saved thought',slug:'resume',settings:'{}',fields:[{key:'note',name:'note',label:'Note',type:'text',required:true,settings:'{}',menuOrder:0}]};
const initial={submissionId:'draft-one',formSlug:'resume',status:'partial',currentStep:0,expiresAt:Date.now()+100000,values:{note:'Preserve this answer'}};
let draft=initial,fail=false,release;const listeners=new Set();
const notify=()=>{for(const fn of listeners)fn();};
mock.module('@/lib/auth/clerk',()=>({useAuth:()=>({isLoaded:true,isSignedIn:false})}));
mock.module('@/lib/html-sanitizer',()=>({default:{sanitize:v=>v}}));
mock.module('@tanstack/react-router',()=>({...router,createFileRoute:()=>options=>({options,useParams:()=>({slug:'resume',token:'proof'})}),Link:props=>createElement('a',props)}));
mock.module('@convex-dev/react-query',()=>({convexQuery:(_ref,args)=>({resume:'token' in args})}));
mock.module('@tanstack/react-query',()=>({useSuspenseQuery:options=>({data:useSyncExternalStore(fn=>{listeners.add(fn);return()=>listeners.delete(fn);},()=>options.resume?draft:form,()=>options.resume?draft:form)})}));
mock.module('@/templates/sdk/Surface',()=>({Surface:({data,fallback})=>createElement(fallback,{data})}));
mock.module('@/components/blog/NotFoundPage',()=>({NotFoundPage:()=>createElement('p',{'data-testid':'unavailable'},'Unavailable')}));
mock.module('convex/react',()=>({
 useMutation:()=>async args=>{if(!args.isComplete)return {};draft=null;notify();await new Promise(resolve=>{release=resolve;});if(fail)throw Error('Access was revoked');return {submissionId:'draft-one',isComplete:true,confirmationToken:'proof'};},
 useAction:()=>async()=>({}),useConvex:()=>({query:async()=>({type:'message',renderedMessage:'Your saved thought was received.'})}),
}));
const {createRoot}=await import('react-dom/client');
const {Route}=await import('../../routes/_marketing/forms.$slug.resume.$token');
const root=createRoot(document.getElementById('root'));
let mountId=0;
async function mount(){await act(async()=>root.render(createElement(Route.options.component,{key:++mountId})));assert.equal(document.querySelector('input:not([type="hidden"])').value,'Preserve this answer');}
async function submit(){await act(async()=>{[...document.querySelectorAll('button')].find(n=>n.textContent==='Submit').click();});assert(!document.querySelector('[data-testid="unavailable"]'),'Own pending submission must survive token invalidation');}
await mount();await submit();await act(async()=>release());assert(document.querySelector('[data-slot="form-success"]')?.textContent.includes('Your saved thought was received.'));assert(!document.querySelector('[data-testid="unavailable"]'));
await act(async()=>root.render(createElement(Route.options.component,{key:'new-visit'})));assert(document.querySelector('[data-testid="unavailable"]'),'Consumed token cannot reopen on a fresh mount');
draft=initial;fail=true;await mount();await submit();await act(async()=>release());assert(document.querySelector('[data-testid="unavailable"]'),'A rejected operation must release the retained draft');
draft=initial;fail=false;await mount();await act(async()=>{draft=null;notify();});assert(document.querySelector('[data-testid="unavailable"]'),'Ordinary revocation must not retain answers');
await act(async()=>root.unmount());dom.window.close();console.log(JSON.stringify({completionSurvivesOwnInvalidation:true,reloadDenied:true,failedSubmissionDenies:true,idleRevocationDenies:true}));
