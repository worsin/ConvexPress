import { expect, test } from "bun:test";
import { reconcileManualSaveAutosave } from "./autosaveReconciliation";
const old = { title: "Old", content: "Body", autosaveTitle: "Old", autosaveContent: "Body", autosavedAt: 1 };
const cleared = { autosaveTitle: undefined, autosaveContent: undefined, autosavedAt: undefined };
test("manual title/body saves clear exactly previous or resulting saved pairs", () => {
  expect(reconcileManualSaveAutosave(old, { title: "New" }, { title: "New" })).toEqual(cleared);
  expect(reconcileManualSaveAutosave({ ...old, autosaveTitle: "New", autosaveContent: "New body" }, { title: "New", content: "New body" }, { title: "New", content: "New body" })).toEqual(cleared);
  expect(reconcileManualSaveAutosave({ ...old, autosaveTitle: undefined }, { title: "New" }, { title: "New" })).toEqual(cleared);
});
test("distinct and mixed pairs survive; metadata updates never acknowledge recovery content", () => {
  expect(reconcileManualSaveAutosave({ ...old, autosaveContent: "Distinct" }, { title: "New" }, { title: "New" })).toEqual({});
  expect(reconcileManualSaveAutosave({ ...old, autosaveContent: "New body" }, { title: "New", content: "New body" }, { title: "New", content: "New body" })).toEqual({});
  expect(reconcileManualSaveAutosave(old, { status: "draft" }, {})).toEqual({});
  expect(reconcileManualSaveAutosave({ ...old, autosaveTitle: "" }, { title: "New" }, { title: "New" })).toEqual({});
});
