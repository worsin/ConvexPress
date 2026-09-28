import {expect,test} from "bun:test";
import {JSDOM} from "jsdom";
import {prepareCanonicalBlockHydration} from "./hydration";

test("hydration loads only the server-marked names for their owning pack before returning",async()=>{
 const root=new JSDOM('<template data-canonical-pack="journal" data-canonical-blocks="core/heading core/paragraph"></template><template data-canonical-pack="journal" data-canonical-blocks="core/heading"></template><template data-canonical-pack="depot" data-canonical-blocks="core/hero"></template>').window.document;
 const calls:unknown[]=[],ready:string[]=[];
 await prepareCanonicalBlockHydration(root,async()=>({load:async(pack:string,names:readonly string[])=>{calls.push([pack,names]);await Promise.resolve();ready.push(pack);}}));
 expect(calls).toEqual([["journal",["core/heading","core/paragraph"]],["depot",["core/hero"]]]);expect(ready.sort()).toEqual(["depot","journal"]);
});
test("pages without canonical content never import the renderer loader",async()=>{
 let imports=0;await prepareCanonicalBlockHydration(new JSDOM('<main>Ordinary page</main>').window.document,async()=>{imports++;throw Error('Unexpected load');});expect(imports).toBe(0);
});
