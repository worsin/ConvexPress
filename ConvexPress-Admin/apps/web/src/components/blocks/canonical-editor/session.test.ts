import { expect, test } from "bun:test";
import {
	openDocument,
	undoDocument,
	redoDocument,
	editDocument,
	receiveDocument,
	beginSave,
	acceptSave,
	rejectSave,
	reloadDocument,
} from "./session";
const key = {
	websiteKey: "site",
	instanceKey: "staging",
	documentId: "draft",
	generation: "operator-session-1",
};
const first = { key, revision: 1, value: { title: "First" } };
test("repeater object key normalization does not leave a confirmed save dirty", () => {
	const before = {
		title: "Services",
		cards: [
			{ description: "Shape a clear direction", title: "Design" },
			{ description: "Details together", title: "Build" },
		],
	};
	const edited = { ...before, title: "Reviewed services" };
	const normalized = {
		title: edited.title,
		cards: edited.cards.map(({ title, description }) => ({
			title,
			description,
		})),
	};
	let s = beginSave(
		editDocument(openDocument({ key, revision: 1, value: before }), edited),
	);
	const request = s.pending!;
	s = acceptSave(s, request, { key, revision: 2, value: normalized });
	expect(s.error).toBeNull();
	expect(s.dirty).toBe(false);
	expect(s.pending).toBeNull();
	expect(editDocument(s, edited).dirty).toBe(false);
	expect(
		receiveDocument(s, { key, revision: 2, value: normalized }).conflict,
	).toBeNull();
	expect(
		editDocument(s, { ...edited, cards: [...edited.cards].reverse() }).dirty,
	).toBe(true);
	expect(
		editDocument(s, {
			...edited,
			cards: [
				{ ...edited.cards[0], title: "Different service" },
				edited.cards[1],
			],
		}).dirty,
	).toBe(true);
});
test("CAS receipt preserves edits made while saving and advances the expected revision", () => {
	let s = beginSave(editDocument(openDocument(first), { title: "Second" }));
	const request = s.pending!;
	s = editDocument(s, { title: "Third" });
	s = receiveDocument(s, { key, revision: 2, value: request.value });
	s = acceptSave(s, request, { key, revision: 2, value: request.value });
	expect(s.draft.title).toBe("Third");
	expect(s.dirty).toBe(true);
	expect(s.conflict).toBe(null);
	expect(beginSave(s).pending?.revision).toBe(2);
});
test("remote revision never silently overwrites local edits; reload is explicit", () => {
	let s = editDocument(openDocument(first), { title: "Local" });
	s = receiveDocument(s, { key, revision: 3, value: { title: "Remote" } });
	expect(s.draft.title).toBe("Local");
	expect(beginSave(s).pending).toBe(null);
	expect(reloadDocument(s).draft.title).toBe("Remote");
});
test("old save and error callbacks cannot enter another document or operator generation", () => {
	const saving = beginSave(
		editDocument(openDocument(first), { title: "Secret" }),
	);
	for (const nextKey of [
		{ ...key, documentId: "other" },
		{ ...key, instanceKey: "live" },
		{ ...key, generation: "other-viewer" },
	]) {
		const current = receiveDocument(saving, {
			key: nextKey,
			revision: 1,
			value: { title: "New" },
		});
		expect(
			acceptSave(current, saving.pending!, {
				key,
				revision: 2,
				value: saving.pending!.value,
			}),
		).toBe(current);
		expect(rejectSave(current, saving.pending!, "Old error")).toBe(current);
		expect(current.draft.title).toBe("New");
	}
});
test("inconsistent receipts fail safely and stale subscriptions do not roll revisions back", () => {
	const s = beginSave(editDocument(openDocument(first), { title: "Second" }));
	expect(
		acceptSave(s, s.pending!, {
			key,
			revision: 2,
			value: { title: "Unrelated" },
		}).error,
	).toContain("could not be verified");
	const fresh = openDocument({ ...first, revision: 5 });
	expect(receiveDocument(fresh, first)).toBe(fresh);
});

test("undo and redo preserve base revision, group typing, branch history and survive a verified save", () => {
	let s = openDocument(first);
	s = editDocument(s, { title: "F" }, { group: "title", at: 100 });
	s = editDocument(s, { title: "Final" }, { group: "title", at: 400 });
	expect(s.history.past).toHaveLength(1);
	s = undoDocument(s);
	expect(s.draft.title).toBe("First");
	expect(s.dirty).toBe(false);
	s = redoDocument(s);
	expect(s.draft.title).toBe("Final");
	expect(s.dirty).toBe(true);
	s = beginSave(s);
	const request = s.pending!;
	expect(undoDocument(s)).toBe(s);
	s = acceptSave(s, request, { key, revision: 2, value: request.value });
	s = undoDocument(s);
	expect(s.draft.title).toBe("First");
	expect(s.base.revision).toBe(2);
	expect(s.dirty).toBe(true);
	s = editDocument(s, { title: "Another direction" });
	expect(s.history.future).toHaveLength(0);
	expect(redoDocument(s)).toBe(s);
});
test("history does not cross scope, remote revisions, conflicts or explicit reload", () => {
	let s = editDocument(openDocument(first), { title: "Local" });
	s = receiveDocument(s, { ...first, revision: 3, value: { title: "Remote" } });
	expect(undoDocument(s)).toBe(s);
	const reloaded = reloadDocument(s);
	expect(reloaded.history.past).toHaveLength(0);
	for (const nextKey of [
		{ ...key, instanceKey: "other" },
		{ ...key, generation: "other" },
		{ ...key, documentId: "other" },
	]) {
		const next = receiveDocument(s, { ...first, key: nextKey });
		expect(next.history.past).toHaveLength(0);
		expect(undoDocument(next)).toBe(next);
	}
});
test("history bounds stored snapshots and separates different fields or pauses", () => {
	let s = editDocument(
		openDocument(first),
		{ title: "One" },
		{ group: "title", at: 100 },
	);
	s = editDocument(s, { title: "Two" }, { group: "title", at: 1200 });
	s = editDocument(s, { title: "Three" }, { group: "other", at: 1300 });
	expect(s.history.past).toHaveLength(3);
	for (let i = 0; i < 150; i++) s = editDocument(s, { title: String(i) });
	expect(s.history.past.length).toBeLessThanOrEqual(100);
	for (let i = 0; i < 8; i++)
		s = editDocument(s, { title: String(i) + "x".repeat(1024 * 1024) });
	expect(
		s.history.past.reduce((n, entry) => n + entry.bytes, 0),
	).toBeLessThanOrEqual(4 * 1024 * 1024);
});
