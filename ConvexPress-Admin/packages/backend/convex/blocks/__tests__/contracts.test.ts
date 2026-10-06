import { expect, test } from "bun:test";
import { BLOCK_CATALOG, buildBlockCatalogPrompt, extractJson, validateAttrsForCatalogEntry } from "../aiPromptBuilder";
test("portable schemas and AI metadata are available and disabled names excluded",()=>{
 expect(validateAttrsForCatalogEntry("commerce/product-showcase",{count:4}).ok).toBe(true);
 expect(validateAttrsForCatalogEntry("commerce/product-showcase",{count:200}).ok).toBe(false);
 expect(buildBlockCatalogPrompt()).toContain("## commerce/product-showcase");
 expect(buildBlockCatalogPrompt()).toContain("homepage featured products");
 expect(buildBlockCatalogPrompt(["commerce/product-showcase"])).not.toContain("## commerce/product-showcase");
});

test("AI JSON extraction treats brackets and escaped quotes inside copy as text",()=>{
 const value=[{name:"core/paragraph",attrs:{body:'A ] bracket, a } brace and \\"quoted\\" text.'}}];
 expect(extractJson("Here is your page: "+JSON.stringify(value)+" End.")).toEqual(value);
 expect(extractJson("Here is [a note] followed by "+JSON.stringify(value))).toEqual(value);
});

test("retired page/post writers cannot bypass canonical authoring",async()=>{
 const pages=await import('../../pages/mutations'); const posts=await import('../../posts/mutations');
 for(const methods of [pages,posts]) {
  expect(methods).not.toHaveProperty('update');
  expect(methods).not.toHaveProperty('create');
 }
 // Registered canonical save/disabled-add enforcement remains exercised by
 // canonicalDocuments/__tests__/documents.test.ts, using actual validators.
});

test("all catalog AI examples validate against their declared schemas",async()=>{
 for(const entry of BLOCK_CATALOG) expect(validateAttrsForCatalogEntry(entry.name,entry.example).ok).toBe(true);

});
