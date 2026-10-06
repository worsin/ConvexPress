import { expect, test } from 'bun:test';
import { readFile } from 'node:fs/promises';
import { validateCanonicalTree, assertPackTreatments } from '../../ConvexPress-Admin/packages/backend/canonical-blocks-foundation/generated/instances';
import { discoverBlocks } from '../blocks/discovery.mjs';
const root=new URL('../../',import.meta.url).pathname;
const packs=['core','journal','depot','aster-house'];
for(const pack of packs) test(`${pack} has valid authored documents, navigation and resolved internal destinations`,async()=>{
 const recipe=JSON.parse(await readFile(new URL(`../../examples/sites/${pack}.json`,import.meta.url),'utf8'));
 expect(recipe.id).toBe(pack);expect(recipe.fictional).toBe(true);expect(recipe.documents.length).toBeGreaterThanOrEqual(5);
 const routes=new Set(recipe.documents.map((d:any)=>(d.type==='post'?'/blog/':'/')+d.slug));
 if(recipe.requiredPlugins.includes('commerce'))routes.add('/products');
 if(recipe.requiredPlugins.includes('events'))routes.add('/events');
 const keys=new Set(recipe.documents.map((d:any)=>d.key));expect(keys.size).toBe(recipe.documents.length);
 expect(keys.has(recipe.homepage)).toBe(true);
 for(const item of recipe.navigation)expect(keys.has(item.documentKey)).toBe(true);
 for(const doc of recipe.documents){
  const blocks=validateCanonicalTree(doc.blocks);assertPackTreatments(blocks,pack);expect(blocks.length).toBeGreaterThan(1);
  function links(value:any){if(Array.isArray(value))value.forEach(links);else if(value&&typeof value==='object')for(const [key,v] of Object.entries(value)){if((key.endsWith('Url')||key==='href') && typeof v==='string' && v.startsWith('/'))expect(routes.has(v)).toBe(true);else links(v);}}
  links(blocks);
 }
 expect(Object.values(recipe.acceptance).every(v=>v===false)).toBe(true);
});
test('the eight existing patterns in Journal and Depot remain discoverable and validated',async()=>{
 const inventory=await discoverBlocks(root);
 for(const id of ['journal','depot'])expect(inventory.packs.find((p:any)=>p.id===id).patterns.length).toBeGreaterThanOrEqual(8);
});
