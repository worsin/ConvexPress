import {test,expect} from "bun:test";
import {mkdtemp,mkdir,cp,symlink,rm,readFile,writeFile} from "node:fs/promises";
import {tmpdir} from "node:os";
import path from "node:path";
import {fileURLToPath,pathToFileURL} from "node:url";
import {syncPortableData,portableDataOutput,portableDataFiles} from "./portable-data.mjs";
import {foundationSharedFiles} from "./foundation-shared.mjs";
const root=fileURLToPath(new URL("../../",import.meta.url));
test("portable canonical data is byte-exact, isolated and rejects drift or server imports",async()=>{
  const temp=await mkdtemp(path.join(tmpdir(),"cp-data-portable-"));
  try{
    const source=path.join(temp,"ConvexPress-Admin/packages/backend/canonical-blocks-foundation");
    await cp(path.join(root,"ConvexPress-Admin/packages/backend/canonical-blocks-foundation"),source,{recursive:true});
    await cp(path.join(root,"blocks/.generated"),path.join(temp,"blocks/.generated"),{recursive:true});
    // Stage the declared inputs, including the Website URL and embed policies.
    // Do not reuse generated copies: this fixture must exercise synchronization.
    for (const relative of Object.values(foundationSharedFiles)) {
      await mkdir(path.dirname(path.join(temp,relative)),{recursive:true});
      await cp(path.join(root,relative),path.join(temp,relative));
    }
    expect((await syncPortableData({root:temp})).length).toBe(portableDataFiles.length + 1);
    expect(await syncPortableData({root:temp,check:true})).toEqual([]);
    const isolated=path.join(temp,"isolated");await cp(path.join(temp,portableDataOutput),isolated,{recursive:true});
    await symlink(path.join(root,"ConvexPress-Website/apps/web/node_modules"),path.join(temp,"node_modules"),"dir");
    const {planCanonicalData}=await import(pathToFileURL(path.join(isolated,"planner.ts")).href);
    const {resolveCanonicalData,validateCanonicalData}=await import(pathToFileURL(path.join(isolated,"resolve.ts")).href);
    const tree=[{id:"featured",name:"core/featured-page",version:1,attrs:{page:"synthetic-page"}}];
    const scope={websiteKey:"sample",instanceKey:"sample-stage"};const policy={enabledPlugins:[],capabilities:["reference.targetResolution"],disabledBlocks:[]};
    expect(planCanonicalData(tree,scope,policy).jobs.length).toBe(1);
    const envelope=await resolveCanonicalData(tree,scope,policy,async()=>({page:null}));
    expect(validateCanonicalData(tree,scope,policy,envelope)).toEqual(envelope);
    await writeFile(path.join(temp,portableDataOutput,"planner.ts"),"// drift");
    await expect(syncPortableData({root:temp,check:true})).rejects.toThrow("stale");
    const contracts=await readFile(path.join(source,"contracts.ts"),"utf8");
    await writeFile(path.join(source,"contracts.ts"),contracts+'\nimport "./server";\n');
    await expect(syncPortableData({root:temp})).rejects.toThrow("Undeclared portable");
  }finally{await rm(temp,{recursive:true,force:true});}
});
