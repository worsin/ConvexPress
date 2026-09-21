import {expect,test} from 'bun:test';
import {buildLegacyCompatibility,syncLegacyCompatibility} from './generate-legacy-compatibility';
import {legacyInventory} from './migrate-existing';
import {legacyCompatibility} from '../../ConvexPress-Admin/packages/backend/canonical-blocks-foundation/compatibility/legacy_schemas.mjs';
const parsed=(schema:any,value:unknown)=>{const result=schema.safeParse(value);return result.success?{success:true,data:result.data}:{success:false};};
test('all54 bundled saved/render schemas retain actual defaults, bounds and URL refinement results',async()=>{
  const inventory=await legacyInventory();expect(Object.keys(legacyCompatibility).sort()).toEqual(inventory.map(block=>block.name).sort());
  for(const block of inventory){const artifact=legacyCompatibility[block.name];
    for(const sample of [{}, {heading:'A guide',spacing:8,alignment:'right',linkUrl:'https://example.com/notes'}, {heading:'x'.repeat(20001)}, {link:{label:'Unsafe',href:'javascript:alert(1)',newTab:false}}, {count:13}, {items:[{title:'Original',description:'Text'}]}]){
      expect(parsed(artifact.savedSchema,sample)).toEqual(parsed(block.schema,sample));
      expect(parsed(artifact.renderedSchema,sample)).toEqual(parsed(block.websiteSchema,sample));
    }
  }
});
test('compatibility artifact is deterministic and closure contains only declared schema inputs',async()=>{
  const first=await buildLegacyCompatibility(),second=await buildLegacyCompatibility();expect(first.files).toEqual(second.files);
  expect(first.manifest.sourceCount).toBe(54);
  expect(first.manifest.bundledInputs.every(name=>name.includes('/schema')||name.includes('/blocks-catalog/src/generated/')||name.endsWith('/page-sections.ts')||name==='ConvexPress-Website/apps/web/src/lib/security/url.ts')).toBe(true);
  const source=first.files['legacy_schemas.mjs'];
  expect(/\b(?:process|Bun)\s*\./.test(source)).toBe(false);
  expect(source.includes('/Users/')).toBe(false);
  expect((await syncLegacyCompatibility(true)).changed).toEqual([]);
});
