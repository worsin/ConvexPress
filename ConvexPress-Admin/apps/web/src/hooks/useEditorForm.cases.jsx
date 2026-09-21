import { afterEach, expect, mock, test } from "bun:test";
import { createRequire } from "node:module";
import { act } from "react";
const require = createRequire(import.meta.url);
const { JSDOM } = createRequire(require.resolve("isomorphic-dompurify"))("jsdom");
const dom = new JSDOM('<div id="app"></div>', { url: "http://localhost" });
for (const key of ["window", "document", "navigator", "HTMLElement", "Event"]) Object.defineProperty(globalThis, key, { configurable: true, value: dom.window[key] });
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
let mutate = async () => "page-id";
mock.module("convex/react", () => ({ useMutation: () => (...args) => mutate(...args) }));
mock.module("@backend/convex/_generated/api", () => ({ api: { posts: { mutations: { update: "post-update", publish: "post-publish", trash: "post-trash" } }, pages: { mutations: { update: "page-update", publish: "page-publish", trash: "page-trash" } } } }));
mock.module("sonner", () => ({ toast: { success() {}, error() {} } }));
const { useEditorForm } = await import("./useEditorForm");
const { createRoot } = await import("react-dom/client");
let root, editor;
const options = { contentType: "page", mode: "edit", postId: "page-id", initialData: { title: "Original", status: "draft" } };
function Harness({ config = options }) { editor = useEditorForm(config); return null; }
async function mount(config = options) { root = createRoot(document.getElementById("app")); await act(async () => root.render(<Harness config={config} />)); }
afterEach(async () => { await act(async () => root?.unmount()); mutate = async () => "page-id"; });

test("successful draft save clears the navigation warning baseline", async () => {
  await mount();
  await act(async () => editor.form.setFieldValue("title", "Saved title"));
  expect(editor.form.state.isDirty).toBe(true);
  await act(async () => editor.handleSaveDraft());
  expect(editor.form.state.values.title).toBe("Saved title");
  expect(editor.form.state.isDirty).toBe(false);
});

test("original fallback text saves without rewriting its legacy block mode or block metadata", async () => {
  await mount({ ...options, originalText: true, initialData: { title: "Original", contentMode: "blocks", content: "Original body", blocks: [] } });
  let saved;
  mutate = async args => { saved = args; return "page-id"; };
  await act(async () => editor.form.setFieldValue("content", "Edited body"));
  await act(async () => editor.handleSaveDraft());
  expect(saved).toMatchObject({ content: "Edited body", contentMode: "blocks" });
  for (const field of ["blocks", "blocksVersion", "blocksRevision"]) expect(saved).not.toHaveProperty(field);
  expect(editor.form.state.isDirty).toBe(false);
});

test("an edit made during a save remains visible and unsaved", async () => {
  await mount();
  let resolve;
  mutate = () => new Promise(r => { resolve = r; });
  await act(async () => editor.form.setFieldValue("title", "Sent title"));
  await act(async () => editor.handleSaveDraft());
  await act(async () => editor.form.setFieldValue("title", "Later unsaved title"));
  await act(async () => resolve("page-id"));
  expect(editor.form.state.values.title).toBe("Later unsaved title");
  expect(editor.form.state.isDirty).toBe(true);
  await act(async () => editor.form.reset());
  expect(editor.form.state.values.title).toBe("Sent title");
});

test("failed update keeps the old baseline and changed content", async () => {
  await mount();
  mutate = async () => { throw new Error("Synthetic save failure"); };
  await act(async () => editor.form.setFieldValue("title", "Unsaved title"));
  await act(async () => editor.handleUpdate());
  expect(editor.form.state.values.title).toBe("Unsaved title");
  expect(editor.form.state.isDirty).toBe(true);
  await act(async () => editor.form.reset());
  expect(editor.form.state.values.title).toBe("Original");
});

for (const [action, status] of [["handleUpdate", "draft"], ["handleSubmitForReview", "pending"], ["handlePublish", "publish"], ["handleSchedule", "future"]]) {
  test(`${action} accepts the saved status and clears dirty state`, async () => {
    await mount();
    const date = new Date("2030-01-02T00:00:00Z");
    await act(async () => editor.form.setFieldValue("title", "Saved action"));
    await act(async () => editor[action](date));
    expect(editor.form.state.values.title).toBe("Saved action");
    expect(editor.form.state.values.status).toBe(status);
    expect(editor.form.state.isDirty).toBe(false);
    if (status === "future") expect(editor.form.state.values.scheduledFor).toEqual(date);
  });
}

test("publishing retains edits made after the content save", async () => {
  await mount();
  let calls = 0, resolve;
  mutate = () => ++calls === 1 ? Promise.resolve("page-id") : new Promise(r => { resolve = r; });
  await act(async () => editor.form.setFieldValue("title", "Published title"));
  await act(async () => editor.handlePublish());
  await act(async () => editor.form.setFieldValue("title", "Unpublished next edit"));
  await act(async () => resolve("page-id"));
  expect(editor.form.state.values.title).toBe("Unpublished next edit");
  expect(editor.form.state.values.status).toBe("publish");
  expect(editor.form.state.isDirty).toBe(true);
  await act(async () => editor.form.reset());
  expect(editor.form.state.values.title).toBe("Published title");
});

test("article section removals persist and unchanged sections are not rewritten", async () => {
  await mount();
  const calls=[];mutate=async args=>{calls.push(args);return 'page-id';};
  await act(async () => {
    editor.form.setFieldValue('hero',{title:'Saved title',subtitle:'Introduction',content:'Original body',imageId:'image-id',videoUrl:'',ctaText:'',ctaUrl:''});
    editor.form.setFieldValue('topics',[{title:'Topic',subtitle:'',content:'Original topic',imageId:null,videoUrl:''}]);
    editor.form.setFieldValue('summary',{title:'Summary',content:'Original summary'});
    editor.form.setFieldValue('sources','Original source');
    editor.form.setFieldValue('tableOfContents','Original contents');
    editor.form.setFieldValue('pagePrompt','Original brief');
    editor.form.setFieldValue('contentMode','article');
  });
  await act(async () => editor.handleSaveDraft());
  expect(calls[0].hero.imageId).toBe('image-id');
  await act(async () => editor.form.setFieldValue('title','Only the title changed'));
  await act(async () => editor.handleSaveDraft());
  for(const field of ['hero','topics','summary','sources','tableOfContents','pagePrompt'])expect(calls[1]).not.toHaveProperty(field);
  await act(async () => {
    editor.form.setFieldValue('hero',{title:'',subtitle:'',content:'',imageId:null,videoUrl:'',ctaText:'',ctaUrl:''});
    editor.form.setFieldValue('topics',[]);
    editor.form.setFieldValue('summary',{title:'',content:''});
    editor.form.setFieldValue('sources','');
    editor.form.setFieldValue('tableOfContents','');
    editor.form.setFieldValue('pagePrompt','');
  });
  await act(async () => editor.handleSaveDraft());
  const serialized=JSON.parse(JSON.stringify(calls[2]));
  expect(serialized).toMatchObject({contentMode:'article',hero:{},topics:[],summary:{},sources:'',tableOfContents:'',pagePrompt:''});
  expect(serialized).not.toHaveProperty('blocks');
  expect(serialized).not.toHaveProperty('blocksVersion');
  expect(serialized).not.toHaveProperty('blocksRevision');
  expect(editor.form.state.isDirty).toBe(false);
});
