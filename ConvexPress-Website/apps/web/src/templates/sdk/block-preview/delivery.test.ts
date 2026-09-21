import { expect, test } from "bun:test";
import {
	receivePreview,
	sendPreview,
	type PreviewPort,
	type PreviewRenderReceipt,
} from "./channel";

const binding = {
	websiteKey: "site",
	instanceKey: "stage",
	documentId: "page",
	revision: 1,
	viewerGeneration: "viewer",
};
const codec = {
	decode(value: unknown) {
		if (value !== "document") throw Error("Unsupported document");
		return value;
	},
	binding: () => binding,
	digest: () => "digest",
};
class Port implements PreviewPort {
	peer!: Port;
	listeners = new Set<(event: { data: unknown }) => void>();
	closed = false;
	postMessage(data: unknown) {
		if (!this.closed)
			for (const listener of this.peer.listeners) listener({ data });
	}
	addEventListener(
		_type: "message",
		listener: (event: { data: unknown }) => void,
	) {
		this.listeners.add(listener);
	}
	removeEventListener(
		_type: "message",
		listener: (event: { data: unknown }) => void,
	) {
		this.listeners.delete(listener);
	}
	start() {}
	close() {
		this.closed = true;
	}
}
function setup(reject = false) {
	const hovers: Array<string | null> = [];
	const selections: string[] = [],
		highlights: Array<string | null> = [];
	const host = new Port(),
		child = new Port();
	host.peer = child;
	child.peer = host;
	let now = 1000;
	const receipts: PreviewRenderReceipt[] = [],
		values: unknown[] = [],
		states: string[] = [];
	const receiver = receivePreview({
		port: child,
		generation: "channel",
		expected: binding,
		codec: reject
			? {
					...codec,
					decode() {
						throw Error("old codec");
					},
				}
			: codec,
		clock: { now: () => now, schedule: () => 0, cancel() {} },
		onHighlight: (id) => highlights.push(id),
		onValue(value, receipt) {
			values.push(value);
			if (receipt) receipts.push(receipt);
		},
	});
	const sender = sendPreview({
		port: host,
		generation: "channel",
		expected: binding,
		codec,
		now: () => now,
		onSelect: (id) => selections.push(id),
		onHover: (id) => hovers.push(id),
		onDeliveryChange: (): void => {
			states.push(sender.deliveryState());
		},
	});
	const publish = () =>
		sender.publish("document", {
			binding,
			authReady: true,
			connectionReady: true,
			queryReady: true,
			freshUntil: now + 5000,
		});
	return {
		sender,
		selections,
		hovers,
		highlights,
		receiver,
		receipts,
		values,
		states,
		child,
		host,
		publish,
		expire() {
			now += 5001;
		},
	};
}
test("receipt distinguishes decoding from rendering and rejects stale render callbacks", () => {
	const h = setup();
	expect(h.sender.deliveryState()).toBe("waiting");
	h.publish();
	expect(h.sender.deliveryState()).toBe("received");
	const stale = h.receipts[0]!;
	h.publish();
	stale.rendered();
	expect(h.sender.deliveryState()).toBe("received");
	h.receipts[1]!.rendered();
	expect(h.sender.deliveryState()).toBe("rendered");
	h.expire();
	h.receipts[1]!.rendered();
	expect(h.states.at(-1)).toBe("rendered");
	h.sender.close();
	expect(h.sender.deliveryState()).toBe("closed");
	expect(h.values.at(-1)).toBeNull();
	expect(h.host.listeners.size).toBe(0);
});
test("incompatible DTOs and rendering failures report failure and clear the Website", () => {
	for (const invalidDto of [true, false]) {
		const h = setup(invalidDto);
		h.publish();
		if (!invalidDto) h.receipts[0]!.failed();
		expect(h.sender.deliveryState()).toBe("rejected");
		expect(h.values.at(-1)).toBeNull();
		h.sender.close();
		h.receiver.close();
	}
});
test("acknowledgements cannot cross channel, sequence, expiry or packet shape", () => {
	const h = setup();
	h.publish();
	for (const extra of [
		{ generation: "old" },
		{ sequence: 0 },
		{ sequence: 2 },
		{ unexpected: true },
	]) {
		h.child.postMessage({
			type: "delivery",
			generation: "channel",
			sequence: 1,
			status: "rendered",
			...extra,
		});
		expect(h.sender.deliveryState()).toBe("received");
	}
	h.expire();
	h.child.postMessage({
		type: "delivery",
		generation: "channel",
		sequence: 1,
		status: "rendered",
	});
	expect(h.sender.deliveryState()).toBe("received");
	h.sender.close();
	h.receiver.close();
});

test("selection and highlight are limited to the current rendered lease and exact packet shape", () => {
	const h = setup();
	h.publish();
	h.receipts[0]!.select!("first");
	expect(h.selections).toEqual([]);
	h.receipts[0]!.rendered();
	h.receipts[0]!.select!("first");
	expect(h.selections).toEqual(["first"]);
	h.sender.highlight("first");
	expect(h.highlights.at(-1)).toBe("first");
	h.publish();
	h.receipts[1]!.rendered();
	h.receipts[0]!.select!("old");
	expect(h.selections).toEqual(["first"]);
	for (const extra of [
		{ sequence: 1 },
		{ generation: "other" },
		{ authority: true },
		{ blockId: "" },
	]) {
		h.child.postMessage({
			type: "select",
			generation: "channel",
			sequence: 2,
			blockId: "forged",
			...extra,
		});
		h.host.postMessage({
			type: "highlight",
			generation: "channel",
			sequence: 2,
			blockId: "forged",
			...extra,
		});
	}
	expect(h.selections).toEqual(["first"]);
	expect(h.highlights.at(-1)).toBe("first");
	h.expire();
	h.receipts[1]!.select!("expired");
	h.sender.highlight("expired");
	expect(h.selections).toEqual(["first"]);
	expect(h.highlights.at(-1)).toBe("first");
	h.receiver.close();
	expect(h.highlights.at(-1)).toBe(null);
});

test("hover reports require current rendered authority and never select content", () => {
	const h = setup();
	h.publish();
	h.receipts[0]!.hover!("first");
	expect(h.hovers).toEqual([]);
	h.receipts[0]!.rendered();
	h.receipts[0]!.hover!("first");
	h.receipts[0]!.hover!(null);
	expect(h.hovers).toEqual(["first", null]);
	expect(h.selections).toEqual([]);
	h.publish();
	h.receipts[1]!.rendered();
	h.receipts[0]!.hover!("stale");
	for (const extra of [
		{ sequence: 1 },
		{ generation: "other" },
		{ blockId: "" },
		{ blockId: 42 },
		{ authority: true },
	])
		h.child.postMessage({
			type: "hover",
			generation: "channel",
			sequence: 2,
			blockId: "forged",
			...extra,
		});
	expect(h.hovers).toEqual(["first", null]);
	h.receipts[1]!.hover!("second");
	expect(h.hovers.at(-1)).toBe("second");
	h.expire();
	h.receipts[1]!.hover!("expired");
	expect(h.hovers.at(-1)).toBe("second");
});
