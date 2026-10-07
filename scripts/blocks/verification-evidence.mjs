import {createHash} from 'node:crypto';
import {lstat,readFile,readdir} from 'node:fs/promises';
import path from 'node:path';
export const RENDERER_EVIDENCE_RUNNER='ConvexPress-Website/apps/web/src/templates/sdk/block-renderer/run-tests.fixture.mjs';
// Include shared implementations and dependency manifests, not just the selected
// block: a primitive, adapter or test change invalidates the previous result.
const inputs=['blocks','block-kit','scripts','ConvexPress-Website/apps/web/src','ConvexPress-Website/apps/web/block-demo','ConvexPress-Website/packages','ConvexPress-Website/scripts','ConvexPress-Admin/packages/backend','package.json','bun.lock','ConvexPress-Website/package.json','ConvexPress-Website/bun.lock','ConvexPress-Website/apps/web/package.json','ConvexPress-Admin/package.json','ConvexPress-Admin/bun.lock'];
const ignored=new Set(['node_modules','.git','dist','output','.cache']);
export async function collectVerificationInputs(root){
 const hash=createHash('sha256');
 async function visit(relative){
  const file=path.join(root,relative);let stat;
  try{stat=await lstat(file);}catch(error){if(error.code!=='ENOENT')throw error;hash.update(JSON.stringify([relative,'missing']));return;}
  if(stat.isSymbolicLink())throw Error(`Verification source must not be a symlink: ${relative}`);
  if(stat.isDirectory()){for(const entry of (await readdir(file)).sort())if(!ignored.has(entry))await visit(path.posix.join(relative,entry));}
  else if(stat.isFile()&&/\.(?:[cm]?[jt]sx?|json|css|html|lock|yaml|yml)$/.test(relative))hash.update(JSON.stringify([relative,createHash('sha256').update(await readFile(file)).digest('hex')]));
 }
 for(const input of inputs)await visit(input);
 return hash.digest('hex');
}
/** This receipt proves the centralized example/pack renderer test only. It does
 * not promote tracker rows or certify live data, native UI or accessibility. */
export async function validateRendererEvidence({root,discovered,evidence}){
 if(evidence?.schemaVersion!==1||evidence.kind!=='canonical-renderer-examples'||evidence.runner!==RENDERER_EVIDENCE_RUNNER||evidence.exitCode!==0||!Array.isArray(evidence.blocks))throw Error('Invalid or unsuccessful centralized renderer evidence');
 if(evidence.inputsSha256!==await collectVerificationInputs(root))throw Error('Renderer evidence does not match current source; rerun the recorded suite');
 const blocks=new Map();for(const entry of evidence.blocks){if(!entry||typeof entry.name!=='string'||blocks.has(entry.name))throw Error('Duplicate or invalid renderer evidence block');blocks.set(entry.name,entry);}
 if(blocks.size!==discovered.blocks.length)throw Error('Renderer evidence inventory does not match discovered blocks');
 let samples=0;
 for(const block of discovered.blocks){
  const entry=blocks.get(block.spec.name);
  if(!entry||entry.version!==block.spec.version||!Array.isArray(entry.samples))throw Error(`Missing or stale renderer evidence for ${block.spec.name}`);
  const expected=new Set(discovered.packs.flatMap(pack=>block.spec.examples.map((_,exampleIndex)=>JSON.stringify([pack.id,exampleIndex]))));
  if(!expected.size)throw Error(`No examples or packs for ${block.spec.name}`);
  for(const sample of entry.samples){if(!sample||!expected.delete(JSON.stringify([sample.pack,sample.exampleIndex])))throw Error(`Duplicate or foreign renderer sample for ${block.spec.name}`);samples++;}
  if(expected.size)throw Error(`Incomplete renderer examples/packs for ${block.spec.name}`);
 }
 return {blocks:blocks.size,samples};
}
