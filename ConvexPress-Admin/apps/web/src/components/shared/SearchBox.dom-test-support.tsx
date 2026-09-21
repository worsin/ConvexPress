import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { JSDOM } = createRequire(require.resolve("isomorphic-dompurify"))(
	"jsdom",
);
const dom = new JSDOM(
	"<!doctype html><html><body><div id='app'></div></body></html>",
	{ url: "http://localhost" },
);
for (const name of [
	"window",
	"document",
	"HTMLElement",
	"HTMLInputElement",
	"Element",
	"Node",
	"MutationObserver",
	"getComputedStyle",
	"navigator",
]) {
	Object.defineProperty(globalThis, name, {
		configurable: true,
		writable: true,
		value: Reflect.get(dom.window, name),
	});
}
Object.defineProperty(globalThis, "IS_REACT_ACT_ENVIRONMENT", {
	configurable: true,
	value: true,
});
const { act, useCallback, useState } = await import("react");
const { createRoot } = await import("react-dom/client");
const { SearchBox } = await import("./SearchBox");
function required<T>(value: T | null | undefined): T {
	assert.ok(value != null);
	return value;
}
const container = required(document.getElementById("app"));
const root = createRoot(container);
const changes: string[] = [];
let setExternal: (value: string) => void = () => {};
function Harness() {
	const [value, setValue] = useState("");
	setExternal = setValue;
	const onChange = useCallback((next: string) => {
		changes.push(next);
		setValue(next);
	}, []);
	return <SearchBox value={value} onChange={onChange} entityName="Products" />;
}
function input() {
	return required(container.querySelector("input"));
}
async function type(value: string) {
	await act(async () => {
		required(
			Object.getOwnPropertyDescriptor(
				dom.window.HTMLInputElement.prototype,
				"value",
			)?.set,
		).call(input(), value);
		input().dispatchEvent(new dom.window.Event("input", { bubbles: true }));
	});
}
async function settle() {
	await act(async () => {
		await new Promise((resolve) => setTimeout(resolve, 360));
	});
}
try {
	await act(async () => root.render(<Harness />));
	await type("notebook");
	await act(async () => {
		required(container.querySelector("form")).dispatchEvent(
			new dom.window.Event("submit", { bubbles: true, cancelable: true }),
		);
	});
	assert.equal(
		input().value,
		"notebook",
		"immediate submit must retain its new controlled value",
	);
	await settle();
	assert.deepEqual(
		changes,
		["notebook"],
		"stale pre-submit debounce must not clear or repeat the search",
	);
	await type("forest");
	await settle();
	assert.equal(changes.at(-1), "forest");
	await type("pending");
	await act(async () => {
		(
			container.querySelector(
				'[aria-label="Clear search"]',
			) as HTMLButtonElement
		).click();
	});
	const clearedCount = changes.length;
	await settle();
	assert.equal(input().value, "");
	assert.equal(changes.at(-1), "");
	assert.equal(changes.length, clearedCount, "clear must cancel pending input");
	await type("pending-external");
	const beforeExternal = changes.length;
	await act(async () => setExternal("history-value"));
	await settle();
	assert.equal(input().value, "history-value");
	assert.equal(
		changes.length,
		beforeExternal,
		"external URL navigation must not be overwritten by pending input",
	);
	await type("pending-unmount");
	await act(async () => root.unmount());
	await settle();
	assert.equal(
		changes.length,
		beforeExternal,
		"unmounted search must not navigate",
	);
	console.log(
		"SearchBox: submit, debounce, clear, external navigation and unmount passed",
	);
} finally {
	await act(async () => root.unmount());
	dom.window.close();
}
