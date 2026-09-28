// @ts-ignore The local bun:test shim omits the supported afterAll lifecycle hook.
import { afterAll, expect, test } from "bun:test";
import { loadStaged } from "../schema-editor/test-harness";
const loaded = await loadStaged("../canonical-editor/document-adapter.ts");
afterAll(loaded.cleanup);
const { canonicalEditorAdapter, checkedDraft } = loaded.module;
test("manual navigation reports missing targets before save and recovers when headings are corrected", () => {
 const editor=canonicalEditorAdapter({disabledBlocks:[],enabledPlugins:[],capabilities:[]});
 const nav=editor.createBlock('core/anchor-nav');nav.attrs={source:'manual',items:[{label:'Make',anchor:'make'}]};
 const heading=editor.createBlock('core/heading');heading.attrs.anchor='arrive';
 const value={title:'Guide',blocks:[nav,heading]};
 const original=structuredClone(value);
 expect(editor.validate(value)).toContain('make');
 expect(value).toEqual(original);
 heading.attrs.anchor='make';expect(editor.validate(value)).toBeNull();
 value.blocks.pop();expect(editor.validate(value)).toContain('make');
 nav.attrs.items=[];expect(editor.validate(value)).toBeNull();
});
test("unresolved reusable anchors retain server validation instead of a false local missing-target error",()=>{
 const editor=canonicalEditorAdapter({disabledBlocks:[],enabledPlugins:[],capabilities:['tree.children','reference.targetResolution']});
 const nav=editor.createBlock('core/anchor-nav');nav.attrs={source:'manual',items:[{label:'Source section',anchor:'source-section'}]};
 const synced=editor.createBlock('core/synced');synced.attrs={syncedBlock:'source-id',revisionPolicy:'latest'};
 expect(editor.validate({title:'Guide',blocks:[nav,synced]})).toBeNull();
});
const adapter = canonicalEditorAdapter({
  disabledBlocks: [], enabledPlugins: ["commerce", "commerceWishlists"],
  capabilities: ["viewer.authorization"],
});
test("a new Wishlist saves with omitted optional browse link and declared defaults", () => {
  const block = adapter.createBlock("commerce/wishlist");
  expect(Object.hasOwn(block.attrs, "browseLink")).toBe(false);
  expect(block.attrs.heading).toBe("Your wishlist");
  const value = { title: "Saved products", blocks: [block] };
  expect(adapter.validate(value)).toBeNull();
  expect(checkedDraft(value).blocks[0].attrs).toEqual({
    heading: "Your wishlist", emptyMessage: "Save something you would like to revisit.",
  });
});
test("an explicitly edited malformed optional link still prevents saving", () => {
  const block = adapter.createBlock("commerce/wishlist");
  block.attrs.browseLink = { label: "Browse", href: "javascript:alert(1)" };
  expect(() => checkedDraft({ title: "Saved products", blocks: [block] })).toThrow();
  block.attrs.browseLink = { label: "Browse", href: "/shop" };
  expect(checkedDraft({ title: "Saved products", blocks: [block] }).blocks[0].attrs.browseLink).toEqual(block.attrs.browseLink);
});

test("selected latest and pinned reusable references pass local save preflight without rewriting authored blocks", () => {
  const policy = { disabledBlocks: [], enabledPlugins: [], capabilities: ["tree.children", "reference.targetResolution"] };
  const editor = canonicalEditorAdapter(policy);
  for (const revisionPolicy of ["latest", "pinned"]) {
    const block = editor.createBlock("core/synced");
    block.attrs = { syncedBlock: "source-id", revisionPolicy, ...(revisionPolicy === "pinned" ? { revision: 6 } : {}) };
    const value = { title: "Reusable page", blocks: [block] };
    expect(editor.validate(value)).toBeNull();
    expect(editor.prepareSave(value).blocks).toEqual(value.blocks);
    expect(canonicalEditorAdapter({ ...policy, disabledBlocks: ["core/synced"] }).validate(value)).toContain("unavailable");
    expect(canonicalEditorAdapter({ ...policy, capabilities: [] }).validate(value)).toContain("unavailable");
    block.attrs = { syncedBlock: "source-id", revisionPolicy: "pinned" };
    expect(editor.validate(value)).toContain("need attention");
  }
});

test("visual choices use the selected pack without bypassing disabled blocks or plugins", () => {
 const policy={disabledBlocks:[],enabledPlugins:[],capabilities:[]};
 for(const pack of ['core','journal','depot','aster-house']){
  const options=canonicalEditorAdapter(policy,pack).availableBlocks;
  expect(options.find((block: { name: string; thumbnail?: string })=>block.name==='core/paragraph').thumbnail).toBe(`/block-thumbnails/${pack}/core--paragraph.jpg`);
  expect(options.some((block: { name: string; thumbnail?: string })=>block.name==='commerce/wishlist')).toBe(false);
 }
 expect(canonicalEditorAdapter({...policy,disabledBlocks:['core/paragraph']},'core').availableBlocks.some((block: { name: string; thumbnail?: string })=>block.name==='core/paragraph')).toBe(false);
 expect(canonicalEditorAdapter(policy,'external-pack').availableBlocks.find((block: { name: string; thumbnail?: string })=>block.name==='core/paragraph').thumbnail).toBeUndefined();
});

test("recovery decodes the whole draft without enforcing authoring validity and rejects malformed structure", () => {
 const editor=canonicalEditorAdapter({disabledBlocks:[],enabledPlugins:[],capabilities:[]});
 const invalid={title:'Recovered unfinished draft',blocks:[{id:'section',name:'core/section',version:1,attrs:{},children:[{id:'notice',name:'core/announcement-bar',version:1,anchor:'unfinished anchor ',attrs:{text:'Still typing',schedule:{startsAt:'2040-06-01T09:00:00Z',endsAt:'2040-06-01T08:00:00Z'},link:{href:'',label:''}}}]}]};
 expect(editor.recover(JSON.parse(JSON.stringify(invalid)))).toEqual(invalid);
 for(const malformed of [null,{...invalid,blocks:'wrong'},{...invalid,blocks:[null]},{...invalid,blocks:[...invalid.blocks,...invalid.blocks]},{...invalid,extra:'not part of the draft'}]) expect(()=>editor.recover(malformed)).toThrow();
});
