import { test, expect, mock } from "bun:test";
import { act, StrictMode } from "react";
import { JSDOM } from "jsdom";
import { usePendingAssistantPrompt } from "./assistant/prompt-handoff";

let ready, sent;
mock.module("../../hooks/useAssistantConfig", () => ({ useAssistantConfig: () => ({ enabled:true, routes:{catalog:true}, autoOpen:"never", placement:"left", railWidthPx:320, displayName:"Assistant", mobileMode:"hidden" }) }));
mock.module("../../hooks/useShopLayout", () => ({ useShopLayout: () => ({shopLayout:"boutique", cartPanel:"drawer"}) }));
mock.module("./CartPanel", () => ({ CartPanel: () => null }));
mock.module("./assistant/AssistantRail", () => ({ AssistantRail: props => {
  usePendingAssistantPrompt({ active:props.active, ready, sending:false, prompt:props.pendingPrompt, send:async text => {sent.push(text);}, consumed:props.onPromptConsumed });
  return null;
} }));
const { ShopShell } = await import("./ShopShell");

async function fixture(run) {
  ready = true; sent = [];
  const dom = new JSDOM('<div id="app"></div>', {url:'https://shop.invalid/products?ask=Which+grinder%3F&q=coffee'});
  const saved = new Map();
  for (const name of ['window','document','navigator','HTMLElement','Element','Node','MutationObserver','getComputedStyle','IS_REACT_ACT_ENVIRONMENT']) {
    saved.set(name,Object.getOwnPropertyDescriptor(globalThis,name));
    Object.defineProperty(globalThis,name,{configurable:true,writable:true,value:name==='IS_REACT_ACT_ENVIRONMENT'?true:dom.window[name]});
  }
  dom.window.matchMedia = () => ({matches:true,addEventListener(){},removeEventListener(){}});
  const {createRoot} = await import('react-dom/client');
  const root = createRoot(document.getElementById('app'));
  const consumed = [];
  const render = key => act(async () => root.render(<StrictMode><ShopShell key={key} kind="catalog" initialPrompt={new URL(window.location.href).searchParams.get('ask') ?? undefined} onInitialPromptConsumed={prompt => {
    consumed.push(prompt);
    const url = new URL(window.location.href);
    if(url.searchParams.get('ask')===prompt) url.searchParams.delete('ask');
    window.history.replaceState(null,'',url);
  }}><div>Catalog</div></ShopShell></StrictMode>));
  try { await run({render,consumed}); }
  finally { await act(async()=>root.unmount()); dom.window.close(); for(const [name,descriptor] of saved) { if(descriptor)Object.defineProperty(globalThis,name,descriptor);else delete globalThis[name]; } }
}

test('consumed URL question does not replay when the shop remounts',async()=>fixture(async({render,consumed})=>{
  await render('first');
  expect(sent).toEqual(['Which grinder?']);
  expect(consumed).toEqual(['Which grinder?']);
  expect(new URL(window.location.href).searchParams.get('q')).toBe('coffee');
  await render('reload');
  expect(sent).toEqual(['Which grinder?']);
}));

test('URL question remains pending until the session is ready',async()=>fixture(async({render,consumed})=>{
  ready=false; await render('same');
  expect(sent).toEqual([]); expect(consumed).toEqual([]);
  expect(new URL(window.location.href).searchParams.get('ask')).toBe('Which grinder?');
  ready=true; await render('same');
  expect(sent).toEqual(['Which grinder?']); expect(consumed).toEqual(['Which grinder?']);
}));

test('an explicit later visit can ask the same question again',async()=>fixture(async({render})=>{
  await render('same'); await render('same');
  const url=new URL(window.location.href);url.searchParams.set('ask','Which grinder?');window.history.pushState(null,'',url);
  await render('same');
  expect(sent).toEqual(['Which grinder?','Which grinder?']);
}));
