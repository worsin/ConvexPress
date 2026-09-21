// @ts-ignore The local bun:test shim omits the supported afterAll lifecycle hook.
import { expect, test, afterAll } from "bun:test";
import { loadStaged } from "./test-harness";
const loaded = await loadStaged("./model.ts");
afterAll(loaded.cleanup);
const {
	draftAt,
	updateDraft,
	initialFieldValue,
	validateDraft,
	acceptPickerResult,
	moveRow,
	sameScope,
} = loaded.module;
import { editorDefinitions } from "../../../../../../../blocks/.generated/editor-metadata";
test("tabbed CTA drafts retain invalid text and expose the exact destination or label field", () => {
  for (const [ctaUrl, ctaLabel, field] of [["javascript:alert(1)", "Open", "ctaUrl"], ["//outside.test", "Open", "ctaUrl"], ["/page/example/", "   ", "ctaLabel"]]) {
    const draft = { tabs: [{ ctaUrl, ctaLabel }] };
    const before = JSON.stringify(draft);
    const result = validateDraft("blocks/tabbed-content", draft);
    expect(result.ok).toBe(false);
    expect(result.issues.some((issue: any) => JSON.stringify(issue.path) === JSON.stringify(["tabs", 0, field]))).toBe(true);
    expect(JSON.stringify(draft)).toBe(before);
  }
  for (const [ctaUrl, ctaLabel] of [["", ""], ["", "Text only"], ["/page/example/", "Open"], ["#study", "Study"], ["https://example.com", "Visit"]])
    expect(validateDraft("blocks/tabbed-content", { tabs: [{ ctaUrl, ctaLabel }] }).ok).toBe(true);
});

test("immutable drafts preserve unknown fields, explicit null, empty number input and array order", () => {
	const original = {
		unknown: { retained: true },
		items: [{ text: "one" }, { text: "two" }],
		count: 3,
	};
	const edited = updateDraft(original, ["items", 0, "text"], "changed");
	expect(original.items[0].text).toBe("one");
	expect(edited.unknown).toEqual({ retained: true });
	expect(draftAt(moveRow(edited, ["items"], 0, 1), ["items", 1, "text"])).toBe(
		"changed",
	);
	expect(updateDraft(edited, ["count"], "").count).toBe("");
	expect(updateDraft(edited, ["count"], null).count).toBeNull();
	expect(
		Object.hasOwn(updateDraft(edited, ["count"], undefined), "count"),
	).toBe(false);
	expect(() => updateDraft(original, ["__proto__", "bad"], true)).toThrow();
	expect(() => updateDraft(original, ["items", 99, "text"], "bad")).toThrow();
});
test("generated schema controls validate constraints and distinguish invalid drafts from normalized saves", () => {
	const valid = validateDraft("events/upcoming", { count: 3 });
	expect(valid.ok).toBe(true);
	if (valid.ok) expect(valid.attrs.heading).toBe("Upcoming events");
	for (const input of [
		{ count: "" },
		{ count: 1.2 },
		{ count: 99 },
		{ count: 3, extra: true },
	])
		expect(validateDraft("events/upcoming", input).ok).toBe(false);
	expect(
		validateDraft("business/opening-hours", { timezone: "Bogus/Zone" }).ok,
	).toBe(false);
	const list = editorDefinitions["core/list"].fields.find(
		(f) => f.id === "items",
	)!;
	const initial = initialFieldValue(list);
	expect(initial).toEqual(list.default);
	expect(initial).not.toBe(list.default);
});
test("picker values are schema validated and bound to exact request scope/revision/path", () => {
	const request = {
		blockId: "block-one",
		name: "core/image",
		path: ["mediaId"],
		scope: { websiteKey: "aster", instanceKey: "staging" },
		revision: "r1",
	};
	expect(
		acceptPickerResult(
			request,
			{ scope: request.scope, value: "owned-media" },
			request,
		),
	).toBe("owned-media");
	expect(() =>
		acceptPickerResult(
			request,
			{
				scope: { ...request.scope, instanceKey: "live" },
				value: "owned-media",
			},
			request,
		),
	).toThrow();
	expect(() =>
		acceptPickerResult(request, { scope: request.scope, value: 42 }, request),
	).toThrow();
	expect(() =>
		acceptPickerResult(
			request,
			{ scope: request.scope, value: "owned-media" },
			{ ...request, revision: "r2" },
		),
	).toThrow();
	expect(() =>
		acceptPickerResult(
			request,
			{ scope: request.scope, value: "owned-media" },
			{ ...request, blockId: "different-block" },
		),
	).toThrow();
	expect(
		sameScope(request.scope, { ...request.scope, instanceKey: "other" }),
	).toBe(false);
});

test("reusable picker applies source and pin atomically without mutating the original draft", () => {
  const request = { blockId: "reuse", name: "core/synced", path: ["syncedBlock"], revision: "4", scope: { websiteKey: "site", instanceKey: "stage" } };
  const original = { syncedBlock: "old-source", revisionPolicy: "pinned", revision: 7 };
  const selection = { scope: request.scope, value: "new-source", syncedRevision: { revisionPolicy: "pinned", revision: 2 } };
  const changed = loaded.module.applyPickerResult(request, selection, request, original);
  expect(changed).toMatchObject({ syncedBlock: "new-source", revisionPolicy: "pinned", revision: 2 });
  expect(original.revision).toBe(7); expect(original.syncedBlock).toBe("old-source");
  const latest = loaded.module.applyPickerResult(request, { ...selection, syncedRevision: { revisionPolicy: "latest", revision: 2 } }, request, original);
  expect(latest.revisionPolicy).toBe("latest"); expect(Object.hasOwn(latest, "revision")).toBe(false);
  for (const syncedRevision of [undefined, { revisionPolicy: "pinned", revision: 0 }, { revisionPolicy: "pinned", revision: 1.5 }, { revisionPolicy: "latest", revision: 1000001 }, { revisionPolicy: "draft", revision: 2 }])
    expect(() => loaded.module.applyPickerResult(request, { ...selection, syncedRevision }, request, original)).toThrow();
  expect(() => loaded.module.applyPickerResult(request, selection, { ...request, revision: "5" }, original)).toThrow();
  expect(() => loaded.module.applyPickerResult(request, { ...selection, scope: { ...request.scope, instanceKey: "foreign" } }, request, original)).toThrow();
  const other = { ...request, name: "core/featured-page", path: ["page"] };
  expect(() => loaded.module.applyPickerResult(other, selection, other, {})).toThrow();
});
