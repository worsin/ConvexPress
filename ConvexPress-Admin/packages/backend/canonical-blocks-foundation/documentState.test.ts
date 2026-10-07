import { expect, test } from "bun:test";
import { authoringRevision, authoringSourceDigest, initializationReason, prepareCanonicalInitialize, prepareCanonicalSave, prepareCanonicalRestore, prepareCanonicalPublication } from "./documentState";
import { validateBlockAttrs } from "./generated/schemas";
const empty = { _id: "post", title: "Empty draft", status: "draft", content: "", blocksRevision: 0 };
const current = { ...empty, blocksVersion: 2, contentMode: "blocks", blocks: [], blocksRevision: 9 };
const code = (fn: () => unknown) => {try {fn();return null;}catch(error:any){return error.code;}};
test("legacy CTA values remain readable and repairable but cannot be newly saved or published", () => {
  const attrs = validateBlockAttrs("blocks/tabbed-content", { tabs: [{ ctaUrl: "javascript:alert(1)", ctaLabel: "Open" }] });
  const blocks = [{ id: "tabbed", name: "blocks/tabbed-content", version: 2, attrs }];
  const old = { ...current, blocks };
  expect(() => prepareCanonicalSave(old, { expectedRevision: 9, title: old.title, blocks })).toThrow();
  for (const status of ["publish", "private", "future"] as const)
    expect(() => prepareCanonicalPublication(old, { expectedRevision: 9, status, ...(status === "future" ? { scheduledAt: 200 } : {}) }, 100)).toThrow();
  expect(prepareCanonicalPublication({ ...old, status: "publish" }, { expectedRevision: 9, status: "draft" }, 100).blocks).toEqual(blocks);
  const repaired = [{ ...blocks[0], attrs: validateBlockAttrs("blocks/tabbed-content", { tabs: [{ ctaUrl: "/page/example/", ctaLabel: "Open" }] }) }];
  expect(prepareCanonicalSave(old, { expectedRevision: 9, title: old.title, blocks: repaired })).toMatchObject({ changed: true, revision: 10, blocks: repaired });
  const snapshot = { ...old, parentId: "post" };
  expect(prepareCanonicalRestore(current, snapshot, { expectedRevision: 9, postId: "post" }).blocks).toEqual(blocks);
  expect(() => prepareCanonicalRestore({ ...current, status: "publish" }, snapshot, { expectedRevision: 9, postId: "post" })).toThrow();
});
test("initialization requires exact empty authoring and both source digest and revision CAS",()=>{
  const args={expectedRevision:0,expectedAuthoringDigest:authoringSourceDigest(empty),title:"New",blocks:[]};
  expect(prepareCanonicalInitialize(empty,args).revision).toBe(1);
  for(const patch of [{content:" "},{content:'{"type":"doc","content":[]}'},{hero:{}},{pageSections:[{}]},{blocks:[{}]},{excerpt:"Authored"},{autosaveTitle:"Unsaved title"},{autosaveContent:"Unsaved"}])expect(initializationReason({...empty,...patch})).toBe("existing-authored-content");
  expect(code(()=>prepareCanonicalInitialize({...empty,title:"Changed without revision"},args))).toBe("CONFLICT");
  expect(code(()=>prepareCanonicalInitialize({...empty,blocksRevision:1},args))).toBe("CONFLICT");
  expect(authoringSourceDigest({...empty,excerpt:null})).not.toBe(authoringSourceDigest(empty));
  expect(authoringSourceDigest({...empty,autosavedAt:1})).not.toBe(authoringSourceDigest(empty));
});
test("save validates current format and checks CAS before identical-candidate idempotency",()=>{
  const args={expectedRevision:9,title:current.title,blocks:[]};
  expect(prepareCanonicalSave(current,args)).toMatchObject({changed:false,revision:9});
  expect(prepareCanonicalSave(current,{...args,title:"Changed"})).toMatchObject({changed:true,revision:10});
  expect(code(()=>prepareCanonicalSave(current,{...args,expectedRevision:8}))).toBe("CONFLICT");
  expect(prepareCanonicalSave({...current,status:"publish"},args)).toMatchObject({changed:false,revision:9});
  expect(code(()=>prepareCanonicalSave({...current,blocksVersion:1},args))).toBe("UNSUPPORTED_AUTHORING_VERSION");
  expect(code(()=>prepareCanonicalSave({...current,blocks:[{id:"x",name:"unknown",version:1,attrs:{}}]},args))).toBe("UNKNOWN_BLOCK");
});
test("restore verifies parent/version and advances current revision even for same-content historical snapshots",()=>{
  const snapshot={parentId:"post",title:"Before",blocksVersion:2,contentMode:"blocks",blocks:[],blocksRevision:2};
  expect(prepareCanonicalRestore(current,snapshot,{postId:"post",expectedRevision:9})).toMatchObject({title:"Before",revision:10,changed:true});
  expect(prepareCanonicalRestore(current,{...snapshot,title:current.title},{postId:"post",expectedRevision:9})).toMatchObject({revision:10,changed:true});
  expect(code(()=>prepareCanonicalRestore(current,{...snapshot,parentId:"other"},{postId:"post",expectedRevision:9}))).toBe("REVISION_PARENT_MISMATCH");
  expect(code(()=>prepareCanonicalRestore(current,{...snapshot,blocksVersion:1},{postId:"post",expectedRevision:9}))).toBe("UNSUPPORTED_AUTHORING_VERSION");
  expect(code(()=>prepareCanonicalRestore(current,snapshot,{postId:"post",expectedRevision:8}))).toBe("CONFLICT");
});
test("invalid or exhausted revisions never coerce to zero or reuse unsafe integer state",()=>{
  for(const value of [null,-1,1.2,"9",Number.MAX_SAFE_INTEGER])expect(code(()=>authoringRevision({...empty,blocksRevision:value}))).toBe("INVALID_AUTHORING_REVISION");
  expect(authoringRevision({...empty,blocksRevision:undefined})).toBe(0);
  expect(code(()=>prepareCanonicalSave({...current,blocksRevision:Number.MAX_SAFE_INTEGER-1},{expectedRevision:Number.MAX_SAFE_INTEGER-1,title:current.title,blocks:[]}))).toBe("AUTHORING_REVISION_EXHAUSTED");
});

test("exact redundant autosaves are eligible while distinct unsaved authoring remains protected", () => {
  const redundant = { ...empty, autosaveTitle: empty.title, autosaveContent: empty.content, autosavedAt: 42 };
  expect(initializationReason(redundant)).toBe(null);
  expect(authoringSourceDigest(redundant)).not.toBe(authoringSourceDigest(empty));
  expect(prepareCanonicalInitialize(redundant, { expectedRevision: 0, expectedAuthoringDigest: authoringSourceDigest(redundant), title: empty.title, blocks: [] }).revision).toBe(1);
  for (const patch of [{ autosaveTitle: `${empty.title} ` }, { autosaveTitle: "" }, { autosaveContent: " " }]) expect(initializationReason({ ...redundant, ...patch })).toBe("existing-authored-content");
});

test("canonical publication revision CAS preserves body and rejects conflicting deadlines", () => {
  const published = prepareCanonicalPublication(current, { expectedRevision: 9, status: "publish" }, 100);
  expect(published).toMatchObject({ revision: 10, changed: true, title: current.title, publication: { status: "publish", scheduledAt: undefined, publishedAt: 100 } });
  expect(prepareCanonicalPublication({ ...current, status: "publish", publishedAt: 50 }, { expectedRevision: 9, status: "publish" }, 100)).toMatchObject({ revision: 9, changed: false });
  expect(prepareCanonicalPublication(current, { expectedRevision: 9, status: "future", scheduledAt: 200 }, 100)).toMatchObject({ revision: 10, publication: { status: "future", scheduledAt: 200 } });
  for (const args of [{ expectedRevision: 8, status: "publish" }, { expectedRevision: 9, status: "future", scheduledAt: 90 }, { expectedRevision: 9, status: "publish", scheduledAt: 200 }]) expect(() => prepareCanonicalPublication(current, args as any, 100)).toThrow();
});


test("canonical version and validated tree govern current editing, publication and recovery without legacy mode", () => {
  for (const contentMode of [undefined, "article", "blocks"]) {
    const row = {...current, contentMode};
    expect(prepareCanonicalSave(row, {expectedRevision:9,title:"Changed",blocks:[]})).toMatchObject({changed:true,revision:10});
    expect(prepareCanonicalPublication(row, {expectedRevision:9,status:"publish"},100)).toMatchObject({changed:true,revision:10});
    expect(prepareCanonicalRestore(row, {...row,parentId:"post"}, {postId:"post",expectedRevision:9})).toMatchObject({changed:true,revision:10});
    expect(code(()=>prepareCanonicalSave({...row,blocksVersion:1},{expectedRevision:9,title:"Changed",blocks:[]}))).toBe("UNSUPPORTED_AUTHORING_VERSION");
    expect(code(()=>prepareCanonicalSave({...row,blocks:[{id:"unknown",name:"invalid",version:1,attrs:{}}]},{expectedRevision:9,title:"Changed",blocks:[]}))).toBe("UNKNOWN_BLOCK");
  }
});
