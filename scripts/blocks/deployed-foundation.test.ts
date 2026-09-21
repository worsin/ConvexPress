import { convexModuleName, convexModuleBody } from "./convex-module-paths.mjs";
import { test, expect } from "bun:test";
import { mkdtemp, cp, symlink, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";
import { syncDeployedFoundation, deployedFoundationOutput, deployedFoundationFiles } from "./deployed-foundation.mjs";
import { foundationSharedFiles } from "./foundation-shared.mjs";
const root = fileURLToPath(new URL("../../",import.meta.url));
test("deployed contract closure is exact, independently loadable and refuses drift or accidental server modules", async()=>{
  const temp=await mkdtemp(path.join(tmpdir(),"cp-canonical-deployed-"));
  try {
    for(const name of ["ConvexPress-Admin/packages/backend/canonical-blocks-foundation",...Object.values(foundationSharedFiles),"blocks/.generated"])await cp(path.join(root,name),path.join(temp,name),{recursive:true});
    expect((await syncDeployedFoundation({root:temp})).length).toBe(deployedFoundationFiles.length+1);
    expect(await syncDeployedFoundation({root:temp,check:true})).toEqual([]);
    const isolated=path.join(temp,"isolated");await cp(path.join(temp,deployedFoundationOutput),isolated,{recursive:true});
    await symlink(path.join(root,"ConvexPress-Admin/packages/backend/node_modules"),path.join(temp,"node_modules"),"dir");
    const contracts=await import(pathToFileURL(path.join(isolated,"documentContracts.ts")).href);
    expect(contracts.parseCanonicalDocumentRead(null)).toBeNull();
    expect(contracts.canonicalContentDigest("A fixture",[]).length).toBe(64);
    const migration=await import(pathToFileURL(path.join(isolated,"legacyStructuredMigration.ts")).href);
    expect(migration.migrateStructuredArticle({postId:"isolated",path:"/blog/isolated",hero:{content:"Preserved outside the checkout"}})).toHaveLength(1);
    await writeFile(path.join(temp,deployedFoundationOutput,"documentContracts.ts"),"// drift\n");
    await expect(syncDeployedFoundation({root:temp,check:true})).rejects.toThrow("drift");
    await syncDeployedFoundation({root:temp});
    await writeFile(path.join(temp,deployedFoundationOutput,"server.ts"),"export const secret=1;\n");
    await expect(syncDeployedFoundation({root:temp,check:true})).rejects.toThrow("Unmanaged");
  } finally {await rm(temp,{recursive:true,force:true});}
});

test("Convex module paths reject illegal segments and normalize relative runtime imports",()=>{
 expect(convexModuleName("generated/field-runtime.d.mts")).toBe("generated/field_runtime.d.mts");
 expect(()=>convexModuleName("generated/bad@file.ts")).toThrow("Invalid Convex");
 expect(convexModuleBody('import {x} from "./field-runtime.mjs";')).toBe('import {x} from "./field_runtime.mjs";');
});
