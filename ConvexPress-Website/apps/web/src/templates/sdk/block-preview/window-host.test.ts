import { expect, test } from "bun:test";
import { bindNativePreview, bindWebsitePreview } from "./window-host";
import type { PreviewCodec, PreviewBinding } from "./channel";
const expected: PreviewBinding = {
	websiteKey: "site",
	instanceKey: "staging",
	documentId: "draft",
	revision: 1,
	viewerGeneration: "operator1",
};
const codec: PreviewCodec<{ binding: PreviewBinding; digest: string }> = {
	decode(value) {
		if (
			!value ||
			typeof value !== "object" ||
			Object.keys(value).length !== 2 ||
			!("binding" in value) ||
			!("digest" in value)
		)
			throw new Error("Closed fixture required");
		return value as { binding: PreviewBinding; digest: string };
	},
	binding: (value) => value.binding,
	digest: (value) => value.digest,
};
class Surface {
	parent: Surface = this;
	listeners = new Map<string, Set<(event: unknown) => void>>();
	postMessage: (...args: unknown[]) => void = () => {};
	addEventListener(type: string, callback: (event: unknown) => void) {
		const list = this.listeners.get(type) ?? new Set();
		list.add(callback);
		this.listeners.set(type, list);
	}
	removeEventListener(type: string, callback: (event: unknown) => void) {
		this.listeners.get(type)?.delete(callback);
	}
	emit(type: string, event: unknown = {}) {
		for (const listener of this.listeners.get(type) ?? []) listener(event);
	}
}
const pause = () => new Promise((resolve) => setTimeout(resolve, 15));
test("queued preview content is not a connected Website and spoofed readiness cannot promote it", () => {
  const parent = new Surface(), child = new Surface(), frame = new Surface();
  Object.assign(frame, { contentWindow: child });
  const host = bindNativePreview({ window: parent as unknown as Window, frame: frame as unknown as HTMLIFrameElement, websiteOrigin: "https://site.test", challenge: "random_challenge_1234", generation: "channel_generation_1234", expected, codec, now: Date.now });
  try {
    expect(host.publish({ binding: expected, digest: "tree" }, { binding: expected, authReady: true, connectionReady: true, queryReady: true, freshUntil: Date.now() + 1000 })).toBe(true);
    expect(host.connectionState()).toBe("waiting");
    parent.emit("message", { source: child, origin: "https://other.test", data: { type: "convexpress:document-preview:ready", challenge: "random_challenge_1234" } });
    expect(host.connectionState()).toBe("waiting");
    host.close();
    expect(host.connectionState()).toBe("closed");
  } finally { host.close(); }
});
test("configured receiver consults bootstrap binding only after the exact native parent source and origin match", () => {
	const parent = new Surface(),
		child = new Surface();
	child.parent = parent;
	let checks = 0,
		replies = 0;
	parent.postMessage = () => {
		replies++;
	};
	const binding = { ...expected, viewerGeneration: "native_generation_0001" };
	const receiver = bindWebsitePreview({
		window: child as unknown as Window,
		parentOrigin: "http://127.0.0.1:4105",
		expected: (raw) => {
			checks++;
			return JSON.stringify(raw) === JSON.stringify(binding) ? binding : null;
		},
		codec,
		clock: { now: Date.now, schedule: () => 0, cancel() {} },
		onValue: () => {},
	});
	const data = {
		type: "convexpress:document-preview:request",
		challenge: "random_challenge_1234",
		binding,
	};
	try {
		child.emit("message", {
			source: parent,
			origin: "http://127.0.0.1:4106",
			data,
		});
		child.emit("message", {
			source: new Surface(),
			origin: "http://127.0.0.1:4105",
			data,
		});
		expect(checks).toBe(0);
		expect(replies).toBe(0);
		child.emit("message", {
			source: parent,
			origin: "http://127.0.0.1:4105",
			data: { ...data, binding: { ...binding, instanceKey: "other" } },
		});
		expect(checks).toBe(1);
		expect(replies).toBe(0);
		child.emit("message", {
			source: parent,
			origin: "http://127.0.0.1:4105",
			data,
		});
		expect(checks).toBe(2);
		expect(replies).toBe(1);
	} finally {
		receiver.close();
	}
});
test("real MessagePorts connect only the owned frame and erase content on navigation", async () => {
	const parent = new Surface(),
		child = new Surface(),
		frame = new Surface();
	child.parent = parent;
	const websiteOrigin = "https://site.test",
		parentOrigin = "http://localhost:4000",
		seen: unknown[] = [];
	child.postMessage = (data, target, ports = []) => {
		expect(target).toBe(websiteOrigin);
		child.emit("message", {
			source: parent,
			origin: parentOrigin,
			data,
			ports,
		});
	};
	parent.postMessage = (data, target) => {
		expect(target).toBe(parentOrigin);
		parent.emit("message", { source: child, origin: websiteOrigin, data });
	};
	Object.assign(frame, { contentWindow: child });
	const receiver = bindWebsitePreview({
		window: child as unknown as Window,
		parentOrigin,
		expected,
		codec,
		clock: {
			now: Date.now,
			schedule: (callback, ms) => setTimeout(callback, ms),
			cancel: (id) => clearTimeout(id as ReturnType<typeof setTimeout>),
		},
		onValue: (value) => seen.push(value),
	});
	const host = bindNativePreview({
		window: parent as unknown as Window,
		frame: frame as unknown as HTMLIFrameElement,
		websiteOrigin,
		challenge: "random_challenge_1234",
		generation: "channel_generation_1234",
		expected,
		codec,
		now: Date.now,
	});
	try {
		expect(host.connectionState()).toBe("connected");
		expect(
			host.publish(
				{ binding: expected, digest: "tree" },
				{
					binding: expected,
					authReady: true,
					connectionReady: true,
					queryReady: true,
					freshUntil: Date.now() + 1000,
				},
			),
		).toBe(true);
		await pause();
		expect(seen.at(-1)).not.toBe(null);
		child.emit("pagehide");
		expect(seen.at(-1)).toBe(null);
		frame.emit("load");
		expect(
			host.publish(
				{ binding: expected, digest: "tree" },
				{
					binding: expected,
					authReady: true,
					connectionReady: true,
					queryReady: true,
					freshUntil: Date.now() + 1000,
				},
			),
		).toBe(false);
	} finally {
		host.close();
		receiver.close();
	}
});
test("top-level Website receiver never listens or renders supplied document state", () => {
	const self = new Surface(),
		seen: unknown[] = [];
	const receiver = bindWebsitePreview({
		window: self as unknown as Window,
		parentOrigin: "https://native.test",
		expected,
		codec,
		clock: { now: Date.now, schedule: () => 0, cancel() {} },
		onValue: (value) => seen.push(value),
	});
	expect(self.listeners.size).toBe(0);
	expect(seen).toEqual([null]);
	receiver.close();
});
