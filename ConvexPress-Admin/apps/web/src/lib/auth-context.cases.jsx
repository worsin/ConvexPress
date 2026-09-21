import { expect, test } from "bun:test";
import { createRequire } from "node:module";
import { mkdtemp, rm } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { act } from "react";
const require = createRequire(import.meta.url);
const { JSDOM } = createRequire(require.resolve("isomorphic-dompurify"))("jsdom");
test("native auth controls follow effective access, identity changes and wall-clock expiry", async () => {
  const output = await mkdtemp(fileURLToPath(new URL("../../.auth-test-", import.meta.url)));
  const dom = new JSDOM('<div id="app"></div>', { url: "http://localhost", pretendToBeVisual: true });
  const names = ["window", "document", "navigator", "HTMLElement", "Node", "IS_REACT_ACT_ENVIRONMENT"];
  const original = names.map(name => [name, Object.getOwnPropertyDescriptor(globalThis, name)]);
  for (const name of names) Object.defineProperty(globalThis, name, { configurable: true, writable: true, value: name === "IS_REACT_ACT_ENVIRONMENT" ? true : dom.window[name] });
  let root;
  try {
    const result = await Bun.build({entrypoints: [fileURLToPath(new URL("./auth-context.fixture.tsx", import.meta.url))], outdir: output, target: "bun", format: "esm", plugins: [{name:"auth-fixture", setup(build) {
      build.onResolve({filter: /^convex-helpers\/react\/cache$/}, () => ({path:fileURLToPath(new URL("./auth-query.fixture.ts", import.meta.url))}));
      build.onResolve({filter: /^@backend\/convex\/_generated\/api$/}, () => ({path:fileURLToPath(new URL("../../../../packages/backend/convex/_generated/api.js", import.meta.url))}));
      build.onResolve({filter: /^react(?:-dom)?(?:\/.*)?$/}, args => ({path:require.resolve(args.path), external:true}));
    }}]});
    if (!result.success) throw Error(result.logs.map(String).join("\n"));
    const m = await import(result.outputs[0].path);
    const { createRoot } = await import("react-dom/client"); root = createRoot(document.getElementById("app"));
    const render = async values => act(async () => {m.setValues(values);root.render(<m.App/>);});
    const state = () => JSON.parse(document.getElementById("state").textContent);
    const user = {_id:"actor", email:"test@example.invalid", status:"active"};
    const role = {_id:"role",name:"Editor",slug:"editor",type:"internal",level:80,status:"active",capabilities:["page.update"],pageAccess:["/pages"]};
    const access = {userId:"actor",role,validUntil:null};
    await render({user,access});
    expect(state()).toEqual({ai:false, page:true, route:true, loading:false});
    await render({user,access:{...access,role:{...role,capabilities:["page.update","blocks.ai"]}}});
    expect(state().ai).toBe(true);
    await render({user,access});expect(state().ai).toBe(false);
    await render({user:{...user,_id:"other"},access});expect(state().page).toBe(false);expect(state().route).toBe(false);
    await render({user:{...user,status:"banned"},access});expect(state().page).toBe(false);
    await render({user,access:undefined});expect(state().loading).toBe(true);expect(state().page).toBe(false);
    await render({user,access:{...access,validUntil:Date.now()+80}});expect(state().page).toBe(true);
    await act(async () => {await new Promise(resolve=>setTimeout(resolve,120));});
    expect(state().page).toBe(false);expect(state().route).toBe(false);
    expect(m.requests.at(-1).refresh).toBe(1);
    await render({user,access:{...access,validUntil:Date.now()+60_000}});expect(state().page).toBe(true);
    await render({user,access:null});expect(state().page).toBe(false);
    expect(m.queryNames.every(name=>["users:getCurrentUser","users:getCurrentRoleAccess"].includes(name))).toBe(true);
  } finally {
    if(root) await act(async()=>root.unmount());dom.window.close();await rm(output,{recursive:true,force:true});
    for(const [name,descriptor] of original) if(descriptor) Object.defineProperty(globalThis,name,descriptor);else delete globalThis[name];
  }
});
