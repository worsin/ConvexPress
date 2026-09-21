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
function Harness() { editor = useEditorForm(options); return null; }
async function mount() { root = createRoot(document.getElementById("app")); await act(async () => root.render(<Harness />)); }
afterEach(async () => { await act(async () => root?.unmount()); mutate = async () => "page-id"; });

test("successful draft save clears the navigation warning baseline", async () => {
  await mount();
  await act(async () => editor.form.setFieldValue("title", "Saved title"));
  expect(editor.form.state.isDirty).toBe(true);
  await act(async () => editor.handleSaveDraft());
  expect(editor.form.state.values.title).toBe("Saved title");
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
