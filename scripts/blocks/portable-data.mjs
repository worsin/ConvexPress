import { syncFoundationShared } from "./foundation-shared.mjs";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import path from "node:path";
export const portableDataFiles = ["embedAuthoring.ts", "shared/embedProviders.ts", "libraryPresentation.ts", "librarySearch.ts", "html.ts", "installedPromotion.ts", "authorContracts.ts", "resolverBindings.ts", "searchText.ts", "generated/search-text.ts", "blockPromotion.ts", "resolverReferences.ts", "composedPresentation.ts", "authoredDefinitions.ts", "composedRegistry.ts", "composedDefinitions.ts", "composition.ts", "compositionExpressions.ts", "primitiveContracts.ts", "publicTree.ts", "syncedDisplay.ts", "syncedContent.ts", "syncedOccurrences.ts", "socialFeedContracts.ts", "leadMagnetContracts.ts", "searchContracts.ts", "taggedMediaContracts.ts", "bundleOfferContracts.ts", "productCompareContracts.ts", "reviewsContracts.ts", "productOptionsContracts.ts", "rsvpContracts.ts", "localeContracts.ts", "albumContracts.ts", "relatedContracts.ts", "archiveContracts.ts", "knowledgeBaseContracts.ts", "supportContracts.ts", "instructorContracts.ts", "learnerProgressContracts.ts", "curriculumContracts.ts", "certificateContracts.ts", "courseContracts.ts", "membershipPlanContracts.ts", "membershipContracts.ts", "shippingPolicyContracts.ts", "brandContracts.ts", "recipeContracts.ts", "productShowcaseContracts.ts", "categoryTilesContracts.ts", "productCollectionContracts.ts", "commerceInventory.ts", "productContracts.ts", "commercePricing.ts", "pollRetry.ts", "pollDataContracts.ts", "pollContracts.ts", "contactDataContracts.ts", "contactContracts.ts", "formContracts.ts", "tagCloudContracts.ts", "calendarContracts.ts", "eventContracts.ts", "postGridContracts.ts", "postContracts.ts", "navigationContracts.ts", "navigationTree.ts", "documentContracts.ts", "migrationContracts.ts", "publicDocumentContracts.ts", "renderResources.ts", "shared/fingerprints.ts", "contracts.ts", "planner.ts", "resolve.ts", "generated/metadata.ts", "generated/promotions.ts", "generated/schemas.ts", "generated/types.ts", "generated/instances.ts", "generated/instance-runtime.mjs", "generated/instance-runtime.d.mts", "generated/spec-runtime.mjs", "generated/spec-runtime.d.mts", "generated/field-runtime.mjs", "generated/field-runtime.d.mts"];
export const portableDataOutput = "ConvexPress-Website/apps/web/src/templates/sdk/block-data/portable";
export async function syncPortableData({root, check=false}) {
  await syncFoundationShared({root, check:true});
  const source = "ConvexPress-Admin/packages/backend/canonical-blocks-foundation";
  const hashes = {};
  const changed=[];
  for (const name of portableDataFiles) {
    const body=await readFile(path.join(root,source,name),"utf8");
    if(name.startsWith("generated/") && body !== await readFile(path.join(root,"blocks/.generated",name.slice("generated/".length)),"utf8"))throw Error(`Root/staged generated data contract mismatch: ${name}. Run both canonical generators first.`);
    // A closed dependency closure: importing server adapters or undeclared files is fatal.
    for (const match of body.matchAll(/(?:from\s+|import\s*)["']([^"']+)["']/g)) {
      const target=match[1];
      if(target === "zod")continue;
      // The shared HTML renderer/search policy uses the pinned, browser-bundled
      // sanitizer. No other portable module may add an external dependency.
      if(name === "html.ts" && target === "sanitize-html")continue;
      if(!target.startsWith("."))throw Error(`Nonportable data dependency: ${name} -> ${target}`);
      const resolved=path.posix.normalize(path.posix.join(path.posix.dirname(name),target));
      if(!portableDataFiles.some(file=>file===resolved||file===`${resolved}.ts`))throw Error(`Undeclared portable data import: ${name} -> ${target}`);
    }
    hashes[name]=createHash("sha256").update(body).digest("hex");
    const destination=path.join(root,portableDataOutput,name);
    let existing;try{existing=await readFile(destination,"utf8");}catch(error){if(error.code!=="ENOENT")throw error;}
    if(existing!==body){changed.push(name);if(!check){await mkdir(path.dirname(destination),{recursive:true});await writeFile(destination,body);}}
  }
  const manifest=JSON.stringify({source,files:hashes},null,2)+"\n";
  const destination=path.join(root,portableDataOutput,"manifest.json");
  let existing;try{existing=await readFile(destination,"utf8");}catch(error){if(error.code!=="ENOENT")throw error;}
  if(existing!==manifest){changed.push("manifest.json");if(!check){await mkdir(path.dirname(destination),{recursive:true});await writeFile(destination,manifest);}}
  if(check&&changed.length)throw Error(`Portable data contracts are stale: ${changed.join(", ")}`);
  return changed;
}
if(process.argv[1]===fileURLToPath(import.meta.url)){
  if(process.argv.slice(2).some(arg=>arg!=="--check"))throw Error("Use --check or no arguments");
  const changed=await syncPortableData({root:fileURLToPath(new URL("../../",import.meta.url)),check:process.argv.includes("--check")});
  console.log(`Portable canonical data: ${portableDataFiles.length} exact source files; ${changed.length} changes. No server adapter or Convex graph included.`);
}
