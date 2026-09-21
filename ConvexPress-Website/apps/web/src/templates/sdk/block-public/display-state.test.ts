import { expect, test } from "bun:test";
import { canonicalContentDigest } from "../block-data/portable/documentContracts";
import { readPublicDisplay } from "./display-state";
import { subscribePublicDisplay, type PublicReadState } from "./subscription";
import { resolveCanonicalData } from "../block-data/portable/resolve";
import { createContentPageDisplayStore, readInstalledPageData } from "../block-data/installed-page-data";
import { validateCanonicalTree } from "../block-data/portable/generated/instances";
const scope = { websiteKey: "site", instanceKey: "stage" };
const binding = {
	...scope,
	documentId: "page",
	viewerSubject: "user_reader",
	generation: "current",
};
const ready = {
	contract: "canonical-public-document-v1",
	state: "ready",
	viewerSubject: "user_reader",
	accessLease: { evaluatedAt: 100000, expiresAt: 160000 },
	scope,
	document: {
		id: "page",
		type: "page",
		title: "Members",
		path: "/members",
		blocksVersion: 2,
		revision: 1,
		blocks: [],
		digest: canonicalContentDigest("Members", []),
	},
	presentation: { packId: "core", revision: "a".repeat(64) },
	policy: { enabledPlugins: [], capabilities: [], disabledBlocks: [] },
	data: { contract: "canonical-data-v1", scope, dataByBlock: {} },
	resources: { media: {} },
};
const restricted = {
	contract: "canonical-public-document-v1",
	state: "restricted",
	viewerSubject: "user_reader",
	accessLease: { evaluatedAt: 100000, expiresAt: 160000 },
	document: {
		id: "page",
		type: "page",
		title: "Members",
		path: "/members",
		excerpt: "Permitted teaser",
	},
	restriction: { password: false, membership: true },
};
test("paginated display rejects another requested page and revokes the previous installed page", async () => {
  const blocks = validateCanonicalTree([{ id: "grid", name: "core/post-grid", version: 1, attrs: {} }]);
  const policy = { ...ready.policy, capabilities: ["reference.targetResolution"] };
  const request = { grid: "second-page" };
  const data = await resolveCanonicalData(blocks, scope, policy, async () => null, undefined, undefined,
    async args => ({ items: [], cursor: args.cursor, nextCursor: null }), request);
  const value = { ...ready, policy, data, document: { ...ready.document, blocks, digest: canonicalContentDigest("Members", blocks) } };
  expect(readPublicDisplay(value, { ...binding, request })).toEqual(value);
  expect(() => readPublicDisplay(value, binding)).toThrow("another pagination request");
  expect(() => readPublicDisplay(value, { ...binding, request: { grid: "third-page" } })).toThrow("another pagination request");
  const store = createContentPageDisplayStore();
  const current = { scope, documentKey: "page", revision: "1", viewerKey: "reader", request };
  const grant = store.install({ tree: blocks, policy, context: current, envelope: data });
  expect(readInstalledPageData({ grant, current }, blocks, policy)).toEqual(data);
  expect(() => readInstalledPageData({ grant, current: { ...current, request: { grid: "third-page" } } }, blocks, policy)).toThrow("current viewer");
  expect(() => store.install({ tree: blocks, policy, context: { ...current, request: {} }, envelope: data })).toThrow("another pagination request");
  expect(() => readInstalledPageData({ grant, current }, blocks, policy)).toThrow("invalidated");
});
test("public display binds ready content and restricted teaser to the current viewer and document", () => {
	expect(readPublicDisplay(ready, binding)).toEqual(ready);
	expect(readPublicDisplay(restricted, binding)).toEqual(restricted);
	for (const value of [ready, restricted]) {
		expect(() =>
			readPublicDisplay(value, { ...binding, viewerSubject: null }),
		).toThrow();
		expect(() =>
			readPublicDisplay(value, { ...binding, viewerSubject: "different_user" }),
		).toThrow();
		expect(() =>
			readPublicDisplay(value, { ...binding, documentId: "another_page" }),
		).toThrow();
	}
	expect(() =>
		readPublicDisplay(ready, { ...binding, instanceKey: "production" }),
	).toThrow();
	expect(() =>
		readPublicDisplay({ ...ready, token: "forbidden" }, binding),
	).toThrow();
	expect(() =>
		readPublicDisplay({ ...restricted, resources: ready.resources }, binding),
	).toThrow();
	expect(readPublicDisplay(null, binding)).toBeNull();
});
test("reactive policy denial, errors and disposed generations cannot retain ready content", () => {
	let result: unknown = undefined,
		listener = () => {},
		stopped = 0;
	const seen: PublicReadState[] = [];
	const watch = {
		localQueryResult: () => {
			if (result instanceof Error) throw result;
			return result;
		},
		onUpdate: (next: () => void) => {
			listener = next;
			return () => {
				stopped++;
			};
		},
	};
	const stop = subscribePublicDisplay(watch, binding, (value) =>
		seen.push(value),
	);
	expect(seen.length).toBe(0);
	result = ready;
	listener();
	expect(seen.at(-1)).toEqual({ value: ready });
	result = restricted;
	listener();
	expect(seen.at(-1)).toEqual({ value: restricted });
	result = null;
	listener();
	expect(seen.at(-1)).toEqual({ value: null });
	result = ready;
	listener();
	result = new Error("query permission failure");
	listener();
	expect(seen.at(-1)).toEqual({ error: true });
	stop();
	const count = seen.length;
	result = ready;
	listener();
	expect(seen.length).toBe(count);
	expect(stopped).toBe(1);
	const next: PublicReadState[] = [];
	subscribePublicDisplay(
		watch,
		{ ...binding, viewerSubject: null, generation: "signed-out" },
		(value) => next.push(value),
	)();
	expect(next).toEqual([{ error: true }]);
});

test('an idle protected subscription drops its body at expiry and requests fresh authorization', () => {
  let now = 0, fire: (() => void) | undefined, refreshes = 0, result: unknown = ready;
  let listener = () => {};
  const seen: PublicReadState[] = [];
  const stop = subscribePublicDisplay({ localQueryResult: () => result, onUpdate(next) { listener = next; return () => {}; } }, binding, value => seen.push(value), {
    onExpired: () => refreshes++,
    timers: { now: () => now, schedule(callback) { fire = callback; return 1; }, cancel() { fire = undefined; } },
  });
  expect(seen.at(-1)).toEqual({ value: ready });
  now = 60000; fire!();
  expect(seen.at(-1)).toEqual({ error: true }); expect(refreshes).toBe(1);
  // A queued old value cannot restore the body while the new request is pending.
  listener(); expect(seen.at(-1)).toEqual({ error: true });
  result = restricted; listener(); expect(seen.at(-1)).toEqual({ error: true });
  stop(); const count = seen.length; listener(); expect(seen.length).toBe(count);
});

test("history fingerprints reject another local selection and personalized results in anonymous SSR",async()=>{
  const {productHistoryDigest}=await import("../block-data/portable/productCollectionContracts");
  const history=["product-one","product-two"];
  const personalized={...ready,historyDigest:productHistoryDigest(history)};
  expect(readPublicDisplay(personalized,{...binding,recentlyViewedIds:history})).toEqual(personalized);
  expect(()=>readPublicDisplay(personalized,{...binding,recentlyViewedIds:["product-two","product-one"]})).toThrow("another recently viewed selection");
  expect(()=>readPublicDisplay(personalized,binding)).toThrow("another recently viewed selection");
  expect(()=>readPublicDisplay(ready,{...binding,recentlyViewedIds:history})).toThrow("another recently viewed selection");
  expect(readPublicDisplay(ready,binding)).toEqual(ready); // older backend with no history capability
  expect(readPublicDisplay({...ready,historyDigest:productHistoryDigest([])},binding)).toBeDefined();
  expect(()=>readPublicDisplay({...restricted,historyDigest:productHistoryDigest(history)},binding)).toThrow("another recently viewed selection");
});
