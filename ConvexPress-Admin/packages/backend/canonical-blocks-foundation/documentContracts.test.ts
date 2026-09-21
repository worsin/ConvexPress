import { expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { canonicalContentDigest, canonicalDocumentReadSchema, parseCanonicalDocumentRead, canonicalWriteReceiptSchema, canonicalPageOptionsSchema, canonicalRevisionPageSchema, collectCanonicalMediaIds, collectCanonicalDisplayMediaIds } from "./documentContracts";
import { validateCanonicalTree } from "./generated/instances";
import { resolveCanonicalData } from "./resolve";
import { renderMediaSchema } from "./renderResources";
import { canonicalJson } from "./shared/fingerprints";
const scope = { websiteKey: "fictional", instanceKey: "fictional-stage" };
const policy = { enabledPlugins: [], capabilities: ["reference.targetResolution"], disabledBlocks: [] };
async function document(blocks: unknown = [], runtimePolicy = policy) {
  const tree = validateCanonicalTree(blocks);
  const params:Parameters<typeof resolveCanonicalData>=[tree,scope,runtimePolicy,async()=>({page:null})];params[42]=async args=>({blockId:args.blockId,offer:null});
  return { contract: "canonical-document-v1", scope, document: { id: "post", type: "page", title: "Fictional draft", status: "draft", path: "/draft", blocksVersion: 2, revision: 1, digest: canonicalContentDigest("Fictional draft", tree), blocks: tree }, presentation: { packId: "core", revision: "a".repeat(64) }, policy: runtimePolicy, data: await resolveCanonicalData(...params), resources: { media: {} as Record<string, any> } };
}
const errorCode = (fn: () => unknown) => { try { fn(); return null; } catch(error: any) { return error.code ?? error.name; } };
test("closed saved document preserves richtext and verifies SHA256 against independent implementation", async () => {
  const dto = await document([{ id: "text", name: "core/paragraph", version: 2, attrs: { body: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "Preserve ", marks: [{ type: "bold" }] }, { type: "hardBreak" }, { type: "text", text: "every mark" }] }] } } }]);
  expect(canonicalDocumentReadSchema.parse(dto)).toEqual(dto);
  expect(dto.document.digest).toBe(createHash("sha256").update(canonicalJson({ blocksVersion: 2, title: dto.document.title, blocks: dto.document.blocks })).digest("hex"));
  const reordered = JSON.parse(JSON.stringify(dto));
  reordered.document.blocks[0] = Object.fromEntries(Object.entries(reordered.document.blocks[0]).reverse());
  expect(parseCanonicalDocumentRead(reordered)).toEqual(dto);
  for (const bad of [{ ...dto, bearer: "must not travel" }, { ...dto, document: { ...dto.document, rawUser: {} } }, { ...dto, policy: { ...policy, arbitraryResolver: "users.get" } }]) expect(canonicalDocumentReadSchema.safeParse(bad).success).toBe(false);
});
test("stale digest, attrs-bound data and wrong scope refuse even with structurally valid DTOs", async () => {
  const dto = await document([{ id: "feature", name: "core/featured-page", version: 1, attrs: { page: "source" } }]);
  expect(errorCode(() => parseCanonicalDocumentRead({ ...dto, document: { ...dto.document, title: "Changed" } }))).toBe("DOCUMENT_DIGEST_MISMATCH");
  expect(errorCode(() => parseCanonicalDocumentRead({ ...dto, scope: { ...scope, instanceKey: "other" } }))).toBe("SCOPE_MISMATCH");
  const wrong = structuredClone(dto); wrong.data.dataByBlock.feature.data = { page: { id: "other", title: "Other", href: "/other", excerpt: null, image: null } };
  expect(errorCode(() => parseCanonicalDocumentRead(wrong))).toBe("BINDING_MISMATCH");
});
test("media resources must be exact generated references without extra privileged metadata", async () => {
  const dto = await document([{ id: "picture", name: "core/image", version: 2, attrs: { mediaId: "image", alt: "Authored alt" } }]);
  expect(collectCanonicalMediaIds(dto.document.blocks)).toEqual(["image"]);
  expect(errorCode(() => parseCanonicalDocumentRead(dto))).toBe("MEDIA_BINDING_MISMATCH");
  dto.resources.media.image = { src: "https://assets.example.invalid/fixture.png", alt: "A fictional fixture", width: 200, height: 100, byteSize: 0 };
  expect(parseCanonicalDocumentRead(dto)).toEqual(dto);
  dto.resources.media.other = dto.resources.media.image;
  expect(errorCode(() => parseCanonicalDocumentRead(dto))).toBe("MEDIA_BINDING_MISMATCH");
  for (const invalid of [{ src: "https://user:password@example.invalid/photo.png", alt: "x" }, { src: "/photo.png", alt: "x", storageId: "private" }, { src: "/photo.png", alt: "x", filename: "../file.png" }, { src: "/photo.png", alt: "x", captions: { src: "https://user:secret@example.invalid/captions.vtt", language: "en", label: "Captions" } }]) expect(renderMediaSchema.safeParse(invalid).success).toBe(false);
});
test("initialization remains an explicit discriminant with consistent eligibility and closed receipts", () => {
  const dto = { contract: "canonical-initialization-v1", scope, document: { id: "post", type: "post", title: "Empty", revision: 0, authoringDigest: "b".repeat(64) }, initialization: { eligible: false, reason: "existing-authored-content" } };
  expect(parseCanonicalDocumentRead(dto)).toEqual(dto);
  expect(canonicalDocumentReadSchema.safeParse({ ...dto, initialization: { eligible: true, reason: "existing-authored-content" } }).success).toBe(false);
  expect(parseCanonicalDocumentRead(null)).toBeNull();
  expect(canonicalWriteReceiptSchema.safeParse({ postId: "post", revision: 2, digest: "c".repeat(64), changed: true }).success).toBe(true);
  expect(canonicalWriteReceiptSchema.safeParse({ postId: "post", revision: 2, digest: "c".repeat(64), changed: true, blocks: [] }).success).toBe(false);
});
test("pagination retains empty continuations and inert split cursors without inventing completion", () => {
  const page = { page: [], isDone: false, continueCursor: "next", splitCursor: "split", pageStatus: null };
  expect(canonicalPageOptionsSchema.parse(page)).toEqual(page);
  expect(canonicalRevisionPageSchema.parse({ ...page, isDone: true })).toEqual({ ...page, isDone: true });
  expect(canonicalPageOptionsSchema.safeParse({ ...page, page: Array.from({length:21}, (_,i)=>({id:String(i),title:"Page",path:"/page",status:"publish"})) }).success).toBe(false);
  expect(canonicalPageOptionsSchema.safeParse({ ...page, page: [{ id: "p", title: "Draft", path: "/draft", status: "draft" }] }).success).toBe(false);
});


test("owned media accepts self-hosted HTTP without allowing script, credential or protocol-relative sources", () => {
 for (const src of ["http://192.168.1.246:4860/api/storage/fixture", "http://localhost:3210/api/storage/fixture", "https://assets.example.invalid/picture.png", "/assets/picture.png"]) {
  expect(renderMediaSchema.safeParse({src,alt:"Fixture"}).success).toBe(true);
  expect(renderMediaSchema.safeParse({src,alt:"Fixture",captions:{src:src+".vtt",language:"en",label:"English"}}).success).toBe(true);
 }
 for (const src of ["javascript:alert(1)","data:image/svg+xml,<svg/>","file:///tmp/image.png","//foreign.example/image.png","http://user:secret@example.invalid/image.png","https://user:secret@example.invalid/image.png","http://example.invalid/with space.png","http://example.invalid/\\image.png"]) {
  expect(renderMediaSchema.safeParse({src,alt:"Fixture"}).success).toBe(false);
  expect(renderMediaSchema.safeParse({src:"/safe.png",alt:"Fixture",captions:{src,language:"en",label:"English"}}).success).toBe(false);
 }
});

test("Lead Magnet downloads stay in dependency tracking without pre-submission media URLs",async()=>{
 const blocks=[{id:"guide",name:"core/lead-magnet",version:1,attrs:{title:"Field guide",file:{id:"download"},media:{id:"cover"},list:"readers"}}];
 const dto=await document(blocks,{enabledPlugins:["forms"],capabilities:["form.submission","reference.targetResolution"],disabledBlocks:[]});
 expect(collectCanonicalMediaIds(dto.document.blocks)).toEqual(["cover","download"]);
 expect(collectCanonicalDisplayMediaIds(dto.document.blocks)).toEqual(["cover"]);
 dto.resources.media.cover={src:"/cover.jpg",alt:"Guide cover"};
 expect(parseCanonicalDocumentRead(dto)).toEqual(dto);
 dto.resources.media.download={src:"/private-guide.pdf",alt:""};
 expect(errorCode(()=>parseCanonicalDocumentRead(dto))).toBe("MEDIA_BINDING_MISMATCH");
 const shared=validateCanonicalTree([...blocks,{id:"other",name:"core/image",version:2,attrs:{mediaId:"download"}}]);
 expect(collectCanonicalDisplayMediaIds(shared)).toEqual(["cover","download"]);
});
