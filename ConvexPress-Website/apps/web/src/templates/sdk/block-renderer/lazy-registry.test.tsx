import { expect, test } from "bun:test";
import { Suspense } from "react";
import { PrimitiveProvider } from "../primitives";
import { renderToReadableStream } from "react-dom/server";
import * as lazyRegistry from "./lazy-registry";
import type { RendererDefinition } from "./model";

const definition = (blockName: string, label = blockName, extra = {}) => ({blockName, View: () => <p>{label}</p>, ...extra}) as RendererDefinition;
const modules = () => {
  const calls: string[] = [];
  const load = (label: string, value: RendererDefinition) => async () => { calls.push(label); return value; };
  return {calls, library: {
    "/blocks/core/heading/render.tsx": load("heading", definition("core/heading")),
    "/blocks/core/paragraph/render.tsx": load("paragraph", definition("core/paragraph", "Paragraph", {flow:"prose"})),
    "/blocks/core/section/render.tsx": load("section", definition("core/section")),
  }, owned: {
    "/packs/journal/blocks/core/heading.tsx": load("journal", definition("core/heading", "Journal")),
    "/packs/depot/blocks/core/heading.tsx": load("depot", definition("core/heading", "Depot")),
  }, manifests: ["core", "journal", "depot"].map(id => ({id, blocks:{renderers:id === "core" ? {} : {"core/heading":"./blocks/core/heading.tsx"}}}))};
};
async function read<T>(lookup:()=>T):Promise<T> {
  for(;;) {try{return lookup();}catch(error){if(error instanceof Promise)await error;else throw error;}}
}
test("discovery loads nothing; a selected nested tree coalesces only its Library and owned modules", async () => {
  expect(typeof lazyRegistry.createLazyRendererRegistry).toBe("function");
  const f=modules(), loaders=lazyRegistry.createLazyRendererRegistry(f.library,f.manifests,f.owned);
  const registry=loaders.forPack("journal");
  expect(f.calls).toEqual([]);
  const tree=[{name:"core/section",children:[{name:"core/heading"},{name:"core/heading"}]}];
  loaders.preload("journal",[tree]);loaders.preload("journal",[tree]);
  await read(()=>registry["core/section"]);await read(()=>registry["core/heading"]);
  expect(f.calls.sort()).toEqual(["heading","journal","section"]);
  expect(loaders.forPack("journal")).toBe(registry);
  await read(()=>loaders.forPack("depot")["core/heading"]);
  expect(f.calls.filter(value=>value==="heading")).toHaveLength(1);
  expect(f.calls).not.toContain("paragraph");
});
test("loaded definitions retain prose flow and reject pack identity, resolver and flow changes",async()=>{
  for(const extra of [{blockName:"core/paragraph"},{dataResolver:"forms.form"},{flow:"prose"}]){
    const f=modules();f.owned["/packs/journal/blocks/core/heading.tsx"]=async()=>definition("core/heading","Wrong",extra);
    const loaders=lazyRegistry.createLazyRendererRegistry(f.library,f.manifests,f.owned);
    await expect(read(()=>loaders.forPack("journal")["core/heading"])).rejects.toThrow("canonical identity, data contract or flow");
  }
  const f=modules(),loaders=lazyRegistry.createLazyRendererRegistry(f.library,f.manifests,f.owned);
  expect((await read(()=>loaders.forPack("core")["core/paragraph"])).flow).toBe("prose");
});
test("path ownership and undeclared modules fail without importing any renderer",()=>{
  const f=modules();
  expect(()=>lazyRegistry.createLazyRendererRegistry(f.library,[],f.owned)).toThrow("Undeclared");
  expect(()=>lazyRegistry.createLazyRendererRegistry(f.library,f.manifests,{})).toThrow("Missing");
  expect(()=>lazyRegistry.createLazyRendererRegistry(f.library,[...f.manifests,...f.manifests],f.owned)).toThrow("duplicate");
  const escaping=[{id:"journal",blocks:{renderers:{"core/heading":"../depot/blocks/core/heading.tsx"}}}];
  expect(()=>lazyRegistry.createLazyRendererRegistry(f.library,escaping,f.owned)).toThrow("owned file");
  expect(f.calls).toEqual([]);
});
test("chunk failures are stable readable errors, never an import retry loop",async()=>{
  let calls=0;
  const loaders=lazyRegistry.createLazyRendererRegistry({"/blocks/core/heading/render.tsx":async()=>{calls++;throw Error("Chunk unavailable");}},[{id:"core"}],{});
  const registry=loaders.forPack("core");
  await expect(read(()=>registry["core/heading"])).rejects.toThrow("Chunk unavailable");
  loaders.preload("core",[[{name:"core/heading"}]]);
  expect(()=>registry["core/heading"]).toThrow("Chunk unavailable");expect(calls).toBe(1);
});
test("streaming SSR awaits the selected renderer and preserves owned-pack markup",async()=>{
  const f=modules(),loaders=lazyRegistry.createLazyRendererRegistry(f.library,f.manifests,f.owned),registry=loaders.forPack("journal");
  function Document(){const View=registry["core/heading"].View;return <View attrs={{}} resources={{media:{}}}/>;}
  const stream=await renderToReadableStream(<Suspense fallback={<p>Loading blocks…</p>}><Document/></Suspense>);
  await stream.allReady;const html=await new Response(stream).text();
  expect(html).toContain('data-pack-block="journal:core/heading"');expect(html).toContain('Journal');
  expect(html).not.toContain('Loading blocks');expect(f.calls.sort()).toEqual(["heading","journal"]);
});

test("shared SDK registry resolves the active primitive provider without borrowing another pack",async()=>{
  const f=modules(),loaders=lazyRegistry.createLazyRendererRegistry(f.library,f.manifests,f.owned);
  function Document(){const View=loaders.registry["core/heading"].View;return <View attrs={{}} resources={{media:{}}}/>;}
  for(const [pack,label] of [["journal","Journal"],["depot","Depot"],["core","core/heading"]]){
    const stream=await renderToReadableStream(<Suspense fallback={null}><PrimitiveProvider packId={pack}><Document/></PrimitiveProvider></Suspense>);
    await stream.allReady;expect(await new Response(stream).text()).toContain(label);
  }
  expect(f.calls.sort()).toEqual(["depot","heading","journal"]);
});
