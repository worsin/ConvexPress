import {afterEach,expect,test} from 'bun:test';
import {mkdtemp,mkdir,writeFile,rm,symlink} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {collectVerificationInputs,validateRendererEvidence} from './verification-evidence.mjs';
const roots:string[]=[];
afterEach(async()=>{for(const root of roots.splice(0))await rm(root,{recursive:true,force:true});});
async function fixture(){
 const root=await mkdtemp(path.join(tmpdir(),'cp-verification-'));roots.push(root);
 for(const folder of ['blocks/core/sample','scripts','ConvexPress-Website/apps/web/src','ConvexPress-Website/apps/web/block-demo'])await mkdir(path.join(root,folder),{recursive:true});
 const spec={name:'core/sample',version:2,examples:[{text:'First'},{text:'Second'}]};
 await writeFile(path.join(root,'blocks/core/sample/block.json'),JSON.stringify(spec));await writeFile(path.join(root,'blocks/core/sample/render.tsx'),'export default "renderer";');
 await writeFile(path.join(root,'ConvexPress-Website/apps/web/src/shared.ts'),'export const color="blue";');
 const discovered={blocks:[{spec,source:'blocks/core/sample/block.json'}],packs:[{id:'core'},{id:'journal'}]};
 const evidence={schemaVersion:1,kind:'canonical-renderer-examples',runner:'ConvexPress-Website/apps/web/src/templates/sdk/block-renderer/run-tests.fixture.mjs',exitCode:0,inputsSha256:await collectVerificationInputs(root),blocks:[{name:spec.name,version:2,samples:[{pack:'core',exampleIndex:0},{pack:'core',exampleIndex:1},{pack:'journal',exampleIndex:0},{pack:'journal',exampleIndex:1}]}]};
 return {root,discovered,evidence};
}
test('executed central examples cover the exact current block versions, examples and installed packs',async()=>{
 const f=await fixture();expect(await validateRendererEvidence(f)).toEqual({blocks:1,samples:4});
});
test('failed, unexecuted, duplicate, partial and foreign renderer evidence cannot satisfy verification',async()=>{
 const f=await fixture();for(const change of [
 (e:any)=>{e.exitCode=1;},(e:any)=>{delete e.exitCode;},(e:any)=>{e.runner='another-runner.mjs';},
 (e:any)=>{e.blocks[0].version=1;},(e:any)=>{e.blocks[0].name='core/other';},
 (e:any)=>{e.blocks[0].samples.pop();},(e:any)=>{e.blocks[0].samples[1]=e.blocks[0].samples[0];},
 (e:any)=>{e.blocks[0].samples[0].pack='missing';},(e:any)=>{e.blocks[0].samples[0].exampleIndex=9;},
 (e:any)=>{e.blocks.push(e.blocks[0]);},(e:any)=>{e.blocks=[];},
 ]){const evidence=structuredClone(f.evidence);change(evidence);await expect(validateRendererEvidence({...f,evidence})).rejects.toThrow();}
});
test('shared renderer edits and added or removed inputs invalidate an earlier successful receipt',async()=>{
 const f=await fixture(),file=path.join(f.root,'ConvexPress-Website/apps/web/src/shared.ts');
 await writeFile(file,'export const color="red";');await expect(validateRendererEvidence(f)).rejects.toThrow('source');
 await writeFile(file,'export const color="blue";');expect(await validateRendererEvidence(f)).toEqual({blocks:1,samples:4});
 await writeFile(path.join(f.root,'scripts/new.mjs'),'new behavior');await expect(validateRendererEvidence(f)).rejects.toThrow('source');
 await rm(path.join(f.root,'scripts/new.mjs'));await rm(file);await expect(validateRendererEvidence(f)).rejects.toThrow('source');
});
test('source fingerprint ignores unrelated output and rejects linked source evidence',async()=>{
 const f=await fixture();await mkdir(path.join(f.root,'output'));await writeFile(path.join(f.root,'output/result.json'),'irrelevant');expect(await collectVerificationInputs(f.root)).toBe(f.evidence.inputsSha256);
 await symlink(path.join(f.root,'output/result.json'),path.join(f.root,'scripts/linked.mjs'));await expect(collectVerificationInputs(f.root)).rejects.toThrow('symlink');
});

test('tracker accepts current executed central coverage without placeholder block-local tests',async()=>{
 const {reconcileTracker}=await import('./tracker.mjs'),f=await fixture();
 const rows=[{Name:'core/sample',Status:'Verified','Spec Path':'blocks/core/sample/block.json'}];
 for(const pack of ['core','journal']){const file=path.join(f.root,'ConvexPress-Admin/output/playwright/blocks',pack,'core/sample.png');await mkdir(path.dirname(file),{recursive:true});await writeFile(file,Buffer.from([137,80,78,71,13,10,26,10,...Array(16).fill(0)]));}
 await expect(reconcileTracker({...f,rows})).rejects.toThrow('lacks tests');
 expect(await reconcileTracker({...f,rows,rendererEvidence:f.evidence})).toMatchObject({inventory:1,specifications:1,verified:1});
 await writeFile(path.join(f.root,'blocks/core/sample/render.tsx'),'changed implementation');
 await expect(reconcileTracker({...f,rows,rendererEvidence:f.evidence})).rejects.toThrow('source');
});
