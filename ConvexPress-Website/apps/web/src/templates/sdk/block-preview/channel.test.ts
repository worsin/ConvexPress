import { expect, test } from "bun:test";
import {
	acceptsPreviewConnect,
	acceptsPreviewReady,
	receivePreview,
	sendPreview,
	PREVIEW_MESSAGE,
	type PreviewPort,
	type PreviewBinding,
	type PreviewCodec,
} from "./channel";
const binding: PreviewBinding = {
	websiteKey: "aster",
	instanceKey: "staging",
	documentId: "draft",
	revision: 1,
	viewerGeneration: "native-session-1",
};
const generation = "channel_generation_0001";
function fixture(allowDraftUpdates = false) {
	let now = 1000,
		expired: (() => void) | undefined;
	const values: unknown[] = [],
		packets: unknown[] = [];
	let listener: ((event: { data: unknown }) => void) | undefined,
		closed = false;
	const port: PreviewPort = {
		postMessage: (value) => packets.push(value),
		addEventListener: (_t, cb) => {
			listener = cb;
		},
		removeEventListener: () => {
			listener = undefined;
		},
		start() {},
		close() {
			closed = true;
		},
	};
	const codec: PreviewCodec<{ binding: PreviewBinding; digest: string }> = {
		decode(value: unknown) {
			if (
				!value ||
				typeof value !== "object" ||
				!Object.hasOwn(value, "binding") ||
				!Object.hasOwn(value, "digest") ||
				Object.keys(value).length !== 2
			)
				throw new Error("Invalid fixture DTO");
			return value as { binding: PreviewBinding; digest: string };
		},
		binding: (value: { binding: PreviewBinding }) => value.binding,
		digest: (value: { digest: string }) => value.digest,
	};
	const receiver = receivePreview({
		port,
		generation,
		expected: binding,
		allowDraftUpdates,
		codec,
		clock: {
			now: () => now,
			schedule: (cb) => {
				expired = cb;
				return cb;
			},
			cancel: () => {
				expired = undefined;
			},
		},
		onValue: (value) => values.push(value),
	});
	const emit = (overrides: Record<string, unknown> = {}) =>
		listener?.({
			data: {
				type: "document",
				generation,
				sequence: 1,
				expiresAt: 5000,
				document: { binding, digest: "tree-1" },
				...overrides,
			},
		});
	return {
		receiver,
		port,
		codec,
		values,
		packets,
		emit,
		closed: () => closed,
		expire() {
			now = 5000;
			expired?.();
		},
	};
}
test("bootstrap rejects wrong origin, window, challenge, opaque origin and top-level use", () => {
	const child = {},
		parent = {},
		self = {};
	const ready = {
		source: child,
		origin: "https://site.test",
		data: { type: `${PREVIEW_MESSAGE}:ready`, challenge: "nonce" },
	};
	expect(acceptsPreviewReady(ready, child, ready.origin, "nonce")).toBe(true);
	expect(
		acceptsPreviewReady({ ...ready, source: {} }, child, ready.origin, "nonce"),
	).toBe(false);
	expect(
		acceptsPreviewReady(
			{ ...ready, origin: "https://evil.test" },
			child,
			ready.origin,
			"nonce",
		),
	).toBe(false);
	expect(acceptsPreviewReady(ready, child, ready.origin, "old")).toBe(false);
	const connect = {
		source: parent,
		origin: "http://localhost:4000",
		data: {
			type: `${PREVIEW_MESSAGE}:connect`,
			challenge: "nonce",
			generation,
		},
	};
	expect(
		acceptsPreviewConnect(connect, parent, self, connect.origin, "nonce"),
	).toBe(true);
	expect(
		acceptsPreviewConnect(connect, parent, parent, connect.origin, "nonce"),
	).toBe(false);
	expect(
		acceptsPreviewConnect(
			{ ...connect, origin: "null" },
			parent,
			self,
			"null",
			"nonce",
		),
	).toBe(false);
});
test("expiry and disconnect erase the displayed DTO and close the channel", () => {
	const f = fixture();
	f.emit();
	expect(f.values.at(-1)).not.toBe(null);
	f.expire();
	expect(f.values.at(-1)).toBe(null);
	expect(f.closed()).toBe(true);
	f.emit();
	expect(f.values.at(-1)).toBe(null);
});
test("site, viewer, document, revision, tree and unknown DTO fields fail closed", () => {
	for (const changed of [
		{ ...binding, instanceKey: "live" },
		{ ...binding, documentId: "other" },
		{ ...binding, revision: 2 },
		{ ...binding, viewerGeneration: "new-user" },
	]) {
		const f = fixture();
		f.emit({ document: { binding: changed, digest: "tree-1" } });
		expect(f.closed()).toBe(true);
		expect(f.values.at(-1)).toBe(null);
	}
	const f = fixture();
	f.emit();
	f.emit({ sequence: 2, document: { binding, digest: "different-tree" } });
	expect(f.values.at(-1)).toBe(null);
	const g = fixture();
	g.emit({ document: { binding, digest: "tree-1", bearer: "must-reject" } });
	expect(g.closed()).toBe(true);
});
test("stale generation is ignored and replayed sequence cannot renew a display lease", () => {
	const f = fixture();
	f.emit({ generation: "prior_channel" });
	expect(f.values).toEqual([null]);
	f.emit();
	f.emit();
	expect(f.closed()).toBe(true);
});
test("native sender stops on lost auth, connection, query freshness or scope without renewing itself", () => {
	for (const bad of [
		{ authReady: false },
		{ connectionReady: false },
		{ queryReady: false },
		{ freshUntil: 999 },
		{ binding: { ...binding, revision: 2 } },
	]) {
		const f = fixture();
		const sender = sendPreview({
			port: f.port,
			generation,
			expected: binding,
			codec: f.codec,
			now: () => 1000,
		});
		const proof = {
			binding,
			freshUntil: 100000,
			authReady: true,
			connectionReady: true,
			queryReady: true,
		};
		expect(sender.publish({ binding, digest: "tree-1" }, proof)).toBe(true);
		expect((f.packets[0] as { expiresAt: number }).expiresAt).toBe(6000);
		expect(
			sender.publish({ binding, digest: "tree-1" }, { ...proof, ...bad }),
		).toBe(false);
		expect(sender.publish({ binding, digest: "tree-1" }, proof)).toBe(false);
	}
});

test("explicit draft channels accept changing content but keep exact scope, base revision and replay protection", () => {
	const f = fixture(true);
	f.emit();
	f.emit({ sequence: 2, document: { binding, digest: "new-unsaved-content" } });
	expect(f.values.at(-1)).toEqual({ binding, digest: "new-unsaved-content" });
	expect(f.closed()).toBe(false);
	f.emit({
		sequence: 3,
		document: {
			binding: { ...binding, revision: 2 },
			digest: "new-unsaved-content",
		},
	});
	expect(f.closed()).toBe(true);
	expect(f.values.at(-1)).toBe(null);
});
