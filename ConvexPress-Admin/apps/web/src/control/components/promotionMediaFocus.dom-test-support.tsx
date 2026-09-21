import assert from "node:assert/strict";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { JSDOM } = createRequire(require.resolve("isomorphic-dompurify"))(
	"jsdom",
);
const dom = new JSDOM(
	"<!doctype html><html><body><button id='outside'>Outside</button><div id='app'></div></body></html>",
	{ url: "http://localhost", pretendToBeVisual: true },
);
for (const name of [
	"window",
	"document",
	"HTMLElement",
	"HTMLInputElement",
	"HTMLButtonElement",
	"Element",
	"Node",
	"NodeFilter",
	"MutationObserver",
	"getComputedStyle",
	"navigator",
	"requestAnimationFrame",
	"cancelAnimationFrame",
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
const { act, useState } = await import("react"),
	{ createRoot } = await import("react-dom/client");
const { PromotionMediaConfirmation } = await import(
	"./PromotionMediaConfirmation"
);
const { usePromotionMediaFocus } = await import("./promotionMediaFocus");
const { mediaFixture } = await import("./promotionMediaFixture");
import type { Recovery } from "./promotionMediaModel";
import type { MediaDialog } from "./PromotionMediaConfirmation";
const f = mediaFixture();
let scope = "original",
	allowed = true,
	triggerPresent = true,
	setDialog: (value: MediaDialog | null) => void = () => {};
function Harness({
	kind,
}: {
	kind: "transfer" | "recovery" | "recovery-confirm";
}) {
	const [dialog, update] = useState<MediaDialog | null>(null);
	setDialog = update;
	const focus = usePromotionMediaFocus(scope, allowed);
	return (
		<>
			{triggerPresent && (
				<button
					id="trigger"
					onClick={async (event) => {
						focus.capture(event.currentTarget);
						event.currentTarget.blur();
						await Promise.resolve();
						update(
							kind === "transfer"
								? {
										kind: "file",
										confirmation: {
											review: f.review,
											scopeKey: scope,
											file: f.file,
											mode: "transfer",
										},
									}
								: kind === "recovery"
									? {
											kind: "recovery-reason",
											review: f.review,
											scopeKey: scope,
											file: f.file,
										}
									: {
											kind: "recovery",
											review: f.review,
											scopeKey: scope,
											file: f.file,
											recovery: {
												recoveryId: "recovery" as Recovery["recoveryId"],
												receiptId: f.review.receiptId,
												mediaKey: f.file.key,
												fingerprint: "c".repeat(64),
												status: "prepared",
												creatorId: "creator" as Recovery["creatorId"],
												beneficiaryId: "operator" as Recovery["beneficiaryId"],
												reason: "Previous operator left.",
												expiresAt: 200,
												retryAfter: null,
												storageId: null,
												canConfirm: true,
											},
										},
						);
					}}
				>
					Open {kind}
				</button>
			)}
			{dialog && (
				<PromotionMediaConfirmation
					dialog={dialog}
					acknowledged={false}
					valid
					reason=""
					busy={false}
					onAcknowledge={() => {}}
					onReason={() => {}}
					onConfirm={() => {}}
					onCancel={() => update(null)}
					finalFocus={focus.finalFocus}
				/>
			)}
		</>
	);
}
const root = createRoot(document.getElementById("app")!);
async function render(kind: "transfer" | "recovery" | "recovery-confirm") {
	await act(async () => root.render(<Harness kind={kind} />));
}
async function open() {
	const trigger = document.getElementById("trigger") as HTMLButtonElement;
	trigger.focus();
	await act(async () => {
		trigger.click();
	});
	assert.equal(document.activeElement?.tagName, "H2");
	return trigger;
}
async function cancel() {
	const button = [...document.querySelectorAll("button")].find(
		(el) => el.textContent === "Cancel",
	);
	assert.ok(button);
	await act(async () => button.click());
	await act(async () => {
		await Promise.resolve();
	});
}
try {
	for (const kind of ["transfer", "recovery", "recovery-confirm"] as const) {
		await render(kind);
		const trigger = await open();
		await cancel();
		assert.equal(
			document.activeElement === trigger,
			true,
			`${kind} Cancel must restore the original trigger after async opening`,
		);
	}
	await render("transfer");
	const stale = await open();
	scope = "different-review";
	await act(async () => {
		root.render(<Harness kind="transfer" />);
	});
	await cancel();
	assert.equal(
		document.activeElement === stale,
		false,
		"changed scope must not restore stale trigger",
	);
	scope = "allowed";
	await render("transfer");
	const revoked = await open();
	allowed = false;
	await render("transfer");
	await cancel();
	assert.equal(
		document.activeElement === revoked,
		false,
		"revocation must suppress return focus",
	);
	allowed = true;
	await render("transfer");
	const removed = await open();
	triggerPresent = false;
	await render("transfer");
	await cancel();
	assert.equal(removed.isConnected, false);
	assert.equal(document.activeElement === removed, false);
	triggerPresent = true;
	await render("recovery");
	await open();
	await act(async () => setDialog(null));
	await render("recovery");
	await open();
	await act(async () => root.unmount());
	assert.equal(document.getElementById("trigger"), null);
	assert.equal(
		document.activeElement?.tagName,
		"BODY",
		"unmount must not refocus another scope or disconnected trigger",
	);
	console.log(
		"media-dialog-focus: transfer/recovery Cancel restore; stale/revoked/disconnected/unmounted targets refused",
	);
} finally {
	dom.window.close();
}
