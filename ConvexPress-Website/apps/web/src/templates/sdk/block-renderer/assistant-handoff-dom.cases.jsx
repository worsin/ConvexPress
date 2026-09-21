import { test, expect } from "bun:test";
import { act, StrictMode } from "react";
import { JSDOM } from "jsdom";
import { usePendingAssistantPrompt, useDesktopShop, assistantIdentityReady } from "../../../components/shop/assistant/prompt-handoff";

async function fixture(run) {
  const dom = new JSDOM('<div id="app"></div>', { url: 'https://shop.invalid', pretendToBeVisual: true });
  const names = ['window','document','navigator','HTMLElement','Element','Node','MutationObserver','getComputedStyle','IS_REACT_ACT_ENVIRONMENT'];
  const old = names.map(name => [name, Object.getOwnPropertyDescriptor(globalThis, name)]);
  for (const name of names) Object.defineProperty(globalThis, name, { configurable: true, writable: true, value: name === 'IS_REACT_ACT_ENVIRONMENT' ? true : dom.window[name] });
  let desktop = false; const listeners = new Set();
  dom.window.matchMedia = () => ({ matches: desktop, addEventListener: (_, fn) => listeners.add(fn), removeEventListener: (_, fn) => listeners.delete(fn) });
  const { createRoot } = await import('react-dom/client'); const root = createRoot(document.getElementById('app'));
  try { await run({ root, resize(value) { desktop = value; for (const fn of listeners) fn(); }, listeners }); }
  finally { await act(async () => root.unmount()); dom.window.close(); for (const [name, descriptor] of old) { if (descriptor) Object.defineProperty(globalThis, name, descriptor); else delete globalThis[name]; } }
}
function Rail(props) { usePendingAssistantPrompt(props); return null; }

test('pending questions wait for the active rail, session readiness and an available sender', async () => fixture(async ({root}) => {
  const sent = [], consumed = [];
  const props = { active: false, ready: false, sending: false, prompt: 'Which notebook?', send: async text => {sent.push(text);}, consumed: () => consumed.push(true) };
  await act(async () => root.render(<Rail {...props}/>));
  await act(async () => root.render(<Rail {...props} active/>));
  expect(sent).toEqual([]); expect(consumed).toEqual([]);
  await act(async () => root.render(<Rail {...props} active ready sending/>));
  expect(sent).toEqual([]);
  await act(async () => root.render(<Rail {...props} active ready/>));
  expect(sent).toEqual(['Which notebook?']); expect(consumed).toHaveLength(1);
  await act(async () => root.render(<Rail {...props} active ready consumed={() => consumed.push(true)}/>));
  expect(sent).toHaveLength(1);
}));

test('StrictMode claims once, resets after consumption, and preserves a later question while busy', async () => fixture(async ({root}) => {
  const sent = []; const send = async text => { sent.push(text); };
  const view = (prompt, sending = false) => <StrictMode><Rail active ready sending={sending} prompt={prompt} send={send}/></StrictMode>;
  await act(async () => root.render(view('First')));
  expect(sent).toEqual(['First']);
  await act(async () => root.render(view('Second', true)));
  expect(sent).toEqual(['First']);
  await act(async () => root.render(view('Second')));
  expect(sent).toEqual(['First','Second']);
  await act(async () => root.render(view(null)));
  await act(async () => root.render(view('Second')));
  expect(sent).toEqual(['First','Second','Second']);
}));

test('responsive host activates exactly one rail and unsubscribes from viewport changes', async () => fixture(async ({root,resize,listeners}) => {
  const sent = [];
  function Host({prompt}) {
    const desktop = useDesktopShop();
    return <><Rail active={desktop} ready sending={false} prompt={prompt} send={async text=>{sent.push(['desktop',text]);}}/>
      <Rail active={!desktop} ready sending={false} prompt={prompt} send={async text=>{sent.push(['mobile',text]);}}/></>;
  }
  await act(async () => root.render(<StrictMode><Host prompt='Mobile question'/></StrictMode>));
  expect(sent).toEqual([['mobile','Mobile question']]);
  await act(async () => root.render(<Host prompt={null}/>));
  await act(async () => resize(true));
  await act(async () => root.render(<Host prompt='Desktop question'/>));
  expect(sent).toEqual([['mobile','Mobile question'],['desktop','Desktop question']]);
  await act(async () => root.unmount());
  expect(listeners.size).toBe(0);
}));

test('assistant never sends before Clerk and Convex have settled on the current identity', async () => fixture(async ({root}) => {
  const sent = []; const send = async text => { sent.push(text); };
  const states = [
    [{isLoaded:false,isSignedIn:undefined},{isLoading:false,isAuthenticated:false},false],
    [{isLoaded:true,isSignedIn:true},{isLoading:true,isAuthenticated:false},false],
    [{isLoaded:true,isSignedIn:true},{isLoading:false,isAuthenticated:false},false],
    [{isLoaded:true,isSignedIn:false},{isLoading:true,isAuthenticated:false},false],
    [{isLoaded:true,isSignedIn:undefined},{isLoading:false,isAuthenticated:false},false],
    [{isLoaded:true,isSignedIn:false},{isLoading:false,isAuthenticated:false},true],
  ];
  for(const [auth,convex,expected] of states){
    const ready=assistantIdentityReady(auth,convex);expect(ready).toBe(expected);
    await act(async()=>root.render(<Rail active ready={ready} sending={false} prompt='Cold navigation' send={send}/>));
    expect(sent.length).toBe(expected?1:0);
  }
  expect(assistantIdentityReady({isLoaded:true,isSignedIn:true},{isLoading:false,isAuthenticated:true})).toBe(true);
}));
