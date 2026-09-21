import { test } from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { canonicalBlockWatch } from "./dev-watch.mjs";
import {
	discoverSourceInventory,
	compareRendererInventory,
} from "./browser/inventory.mjs";

const settle = () => new Promise((resolve) => setTimeout(resolve, 15));
function harness(loaded = true, ssrLoaded = false) {
	const watcher = new EventEmitter();
	const watched = [];
	watcher.add = (path) => watched.push(path);
	const httpServer = new EventEmitter();
	const invalidated = [];
	const messages = [];
	const module = { id: "/fixture/discovery.ts" };
	const moduleGraph = {
		getModuleById: (id) => (loaded && id === module.id ? module : undefined),
		invalidateModule: (item) => invalidated.push(item),
	};
	canonicalBlockWatch({
		root: "/fixture/blocks",
		discoveryId: module.id,
		debounceMs: 1,
	}).configureServer({
		watcher,
		httpServer,
		environments: { client: { moduleGraph }, ssr: {moduleGraph:{getModuleById:id=>ssrLoaded&&id===module.id?module:undefined,invalidateModule:item=>invalidated.push(item)}} },
		ws: { send: (message) => messages.push(message) },
	});
	return { watcher, watched, httpServer, invalidated, messages };
}

test("external renderer add and unlink invalidate only discovery and reload loaded harness", async () => {
	const h = harness();
	assert.deepEqual(h.watched, ["/fixture/blocks"]);
	h.watcher.emit("add", "/fixture/blocks/core/accordion/render.tsx");
	h.watcher.emit("add", "/fixture/blocks/core/tabs/render.tsx");
	await settle();
	assert.equal(h.invalidated.length, 1);
	assert.equal(h.invalidated[0].id, "/fixture/discovery.ts");
	assert.deepEqual(h.messages, [{ type: "full-reload", path: "*" }]);
	h.watcher.emit("unlink", "/fixture/blocks/core/accordion/render.tsx");
	await settle();
	assert.equal(h.invalidated.length, 2);
	h.httpServer.emit("close");
});

test("ignore unrelated paths, startup enumeration and close without delayed reload", async () => {
	const h = harness();
	for (const file of [
		"/elsewhere/core/card/render.tsx",
		"/fixture/blocks/.generated/render.tsx",
		"/fixture/blocks/core/card/render.tmp.tsx",
		"/fixture/blocks/core/card/block.json",
		"/fixture/blocks/core/card/deep/render.tsx",
	])
		h.watcher.emit("add", file);
	await settle();
	assert.equal(h.messages.length, 0);
	h.watcher.emit("add", "/fixture/blocks/core/card/render.tsx");
	h.httpServer.emit("close");
	await settle();
	assert.equal(h.messages.length, 0);
	assert.equal(h.watcher.listenerCount("add"), 0);
	assert.equal(h.watcher.listenerCount("unlink"), 0);
	const cold = harness(false);
	cold.watcher.emit("add", "/fixture/blocks/core/card/render.tsx");
	await settle();
	assert.equal(cold.messages.length, 0);
	cold.httpServer.emit("close");
});

test("source inventory detects stale browser, duplicates and unexpected modules independently", async () => {
	const root = await mkdtemp(join(tmpdir(), "block-inventory-"));
	try {
		for (const name of ["accordion", "tabs", "planned"]) {
			const dir = join(root, "core", name);
			await mkdir(dir, { recursive: true });
			await writeFile(
				join(dir, "block.json"),
				JSON.stringify({ name: `core/${name}`, version: 2 }),
			);
			if (name !== "planned")
				await writeFile(join(dir, "render.tsx"), "export default {};");
		}
		const inventory = await discoverSourceInventory(root);
		assert.equal(inventory.specs.length, 3);
		assert.equal(inventory.renderers.length, 2);
		assert.equal(inventory.renderers[0].sha256.length, 64);
		assert.deepEqual(
			compareRendererInventory(inventory.renderers, [
				"core/tabs",
				"core/tabs",
				"core/unknown",
			]),
			{
				missing: ["core/accordion"],
				unexpected: ["core/unknown"],
				duplicates: ["core/tabs"],
			},
		);
		assert.deepEqual(
			compareRendererInventory(inventory.renderers, [
				"core/tabs",
				"core/accordion",
			]),
			{ missing: [], unexpected: [], duplicates: [] },
		);
		await writeFile(
			join(root, "core", "tabs", "block.json"),
			JSON.stringify({ name: "wrong/name", version: 2 }),
		);
		await assert.rejects(
			discoverSourceInventory(root),
			/Invalid canonical identity/,
		);
	} finally {
		await rm(root, { recursive: true, force: true });
	}
});

test("real source inventory includes the structural slice without generated coverage", async () => {
	const inventory = await discoverSourceInventory(
		fileURLToPath(new URL("../../../../blocks/", import.meta.url)),
	);
	assert.ok(inventory.renderers.length >= 34);
	for (const name of [
		"core/accordion",
		"core/tabs",
		"core/table",
		"core/sticky-aside",
	])
		assert.ok(inventory.renderers.some((entry) => entry.name === name));
	assert.deepEqual(
		inventory.renderers.map(({ name, version }) => ({ name, version })),
		inventory.specs,
		"Every canonical specification must have its implementation",
	);
});


test("external additions invalidate SSR discovery even before a browser has imported it",async()=>{
 const h=harness(false,true);h.watcher.emit("add","/fixture/blocks/certificates/verify/render.tsx");
 await settle();assert.equal(h.invalidated.length,1);assert.equal(h.messages.length,1);h.httpServer.emit("close");
 const both=harness(true,true);both.watcher.emit("unlink","/fixture/blocks/certificates/verify/render.tsx");
 await settle();assert.equal(both.invalidated.length,2);assert.equal(both.messages.length,1);both.httpServer.emit("close");
});
