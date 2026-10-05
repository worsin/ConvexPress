import { convexModuleName, convexModuleBody } from "./convex-module-paths.mjs";
import { readFile, mkdir, writeFile, readdir, unlink } from "node:fs/promises";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { portableDataFiles } from "./portable-data.mjs";
import { syncFoundationShared } from "./foundation-shared.mjs";
export const deployedFoundationFiles = [...portableDataFiles, "aiCatalog.ts", "generated/ai-catalog.ts", "generated/patterns.ts", "generated/pack-designs.ts", "promotionTree.ts", "syncedPromotion.ts", "eventIntervalIndex.ts", "documentState.ts", "draftRecovery.ts", "legacyDocumentMigration.ts", "legacyHtmlMigration.ts", "legacyStructuredMigration.ts", "shared/legacyHref.ts", "legacyBlockMigration.ts", "legacySectionMigration.ts", "compatibility/legacy_schemas.mjs", "compatibility/legacy_schemas.d.mts", "compatibility/rich_text.mjs", "compatibility/rich_text.d.mts", "shared/authoringFields.ts", "generated/storage.ts"];
export const deployedFoundationOutput = "ConvexPress-Admin/packages/backend/convex/canonicalDocuments/foundation";
export async function syncDeployedFoundation({root,check=false}) {
  await syncFoundationShared({root,check:true});
  const source = "ConvexPress-Admin/packages/backend/canonical-blocks-foundation";
  const hashes = {}, changed = [];
  for(const name of deployedFoundationFiles) {
    const body = await readFile(path.join(root,source,name),"utf8");
    if(name.startsWith("generated/") && body !== await readFile(path.join(root,"blocks/.generated",name.slice(10)),"utf8")) throw Error(`Root/staged canonical contract mismatch: ${name}`);
    for(const match of body.matchAll(/(?:from\s+|import\s*)["']([^"']+)["']/g)) {
      const target=match[1]; if(target === "zod" || (name === "generated/storage.ts" && target === "convex/values")) continue;
      if(name === "html.ts" && target === "sanitize-html")continue;
      if(name === "legacyHtmlMigration.ts" && target === "htmlparser2")continue;
      if(!target.startsWith(".")) throw Error(`Nonportable canonical dependency: ${name} -> ${target}`);
      const resolved=path.posix.normalize(path.posix.join(path.posix.dirname(name),target));
      if(!deployedFoundationFiles.some(file=>file===resolved||file===`${resolved}.ts`)) throw Error(`Undeclared canonical dependency: ${name} -> ${target}`);
    }
    const outputName = convexModuleName(name), outputBody = convexModuleBody(body);
    hashes[outputName] = createHash("sha256").update(outputBody).digest("hex");
    const target=path.join(root,deployedFoundationOutput,outputName);
    if (outputName !== name) {
      const oldPath=path.join(root,deployedFoundationOutput,name);
      try {
        const old=await readFile(oldPath,"utf8");
        if(check) throw Error(`Invalid Convex module path remains: ${name}`);
        if(old !== body) throw Error(`Modified legacy generated module: ${name}`);
        await unlink(oldPath);
      } catch(error) { if(error.code!=="ENOENT") throw error; }
    }
    let existing; try {existing=await readFile(target,"utf8");} catch(error) {if(error.code!=="ENOENT")throw error;}
    if(existing!==outputBody) {changed.push(outputName);if(!check){await mkdir(path.dirname(target),{recursive:true});await writeFile(target,outputBody);}}
  }
  const target=path.join(root,deployedFoundationOutput,"manifest.json"), body=JSON.stringify({source,files:hashes},null,2)+"\n";
  let existing;try{existing=await readFile(target,"utf8");}catch(error){if(error.code!=="ENOENT")throw error;}
  if(existing!==body){changed.push("manifest.json");if(!check){await mkdir(path.dirname(target),{recursive:true});await writeFile(target,body);}}
  async function inventory(directory,prefix="") {
    let entries; try{entries=await readdir(directory,{withFileTypes:true});}catch(error){if(error.code==="ENOENT")return;throw error;}
    for(const entry of entries){const name=prefix+entry.name;if(entry.isDirectory())await inventory(path.join(directory,entry.name),name+"/");else if(name!=="manifest.json"&&!deployedFoundationFiles.map(convexModuleName).includes(name))throw Error(`Unmanaged canonical foundation file: ${name}`);}
  }
  await inventory(path.join(root,deployedFoundationOutput));
  if(check&&changed.length)throw Error(`Deployed canonical foundation drift: ${changed.join(", ")}`);
  return changed;
}
if(process.argv[1]===fileURLToPath(import.meta.url)) {
  if(process.argv.slice(2).some(arg=>arg!=="--check"))throw Error("Use --check or no arguments");
  const changed=await syncDeployedFoundation({root:fileURLToPath(new URL("../../",import.meta.url)),check:process.argv.includes("--check")});
  console.log(`Deployed canonical foundation: ${deployedFoundationFiles.length} deterministic validated files (Convex-safe names/imports); ${changed.length} changes. No registered handlers or server adapters generated.`);
}
