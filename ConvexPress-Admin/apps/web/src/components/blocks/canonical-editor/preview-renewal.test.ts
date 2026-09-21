import { expect, test } from "bun:test";
import type { PreviewDeliveryState } from "../../../../../../../ConvexPress-Website/apps/web/src/templates/sdk/block-preview/channel";
import { createPreviewRenewal } from "./preview-renewal";
function harness(
	waiting = false,
	expiresAt?: (value: string) => number | null,
) {
	let now = 0,
		id = 0;
	const tasks = new Map<number, { at: number; run: () => void }>();
	const reads: Array<{
		at: number;
		resolve: (value: string) => void;
		reject: (reason: Error) => void;
	}> = [];
	const transports: Array<{
		closed: boolean;
		delivery: PreviewDeliveryState;
		notify(state: PreviewDeliveryState): void;
		published: Array<{ value: string; deadline: number }>;
	}> = [];
	const states: string[] = [];
	const loop = createPreviewRenewal({
		expiresAt,
		clock: {
			now: () => now,
			set: (run, delay) => {
				tasks.set(++id, { at: now + delay, run });
				return id;
			},
			clear: (key) => {
				tasks.delete(key as number);
			},
		},
		read: () =>
			new Promise<string>((resolve, reject) =>
				reads.push({ at: now, resolve, reject }),
			),
		connect: (onDeliveryChange) => {
			const t = {
				closed: false,
				delivery: (waiting ? "waiting" : "rendered") as PreviewDeliveryState,
				notify(state: PreviewDeliveryState) {
					t.delivery = state;
					onDeliveryChange();
				},
				published: [] as Array<{ value: string; deadline: number }>,
			};
			transports.push(t);
			return {
				close() {
					t.closed = true;
				},
				deliveryState: () => (t.closed ? ("closed" as const) : t.delivery),
				connectionState: () =>
					t.closed
						? ("closed" as const)
						: waiting
							? ("waiting" as const)
							: ("connected" as const),
				publish(value: string, deadline: number) {
					if (t.closed) return false;
					t.published.push({ value, deadline });
					return true;
				},
			};
		},
		onState: (state) => states.push(state),
	});
	const flush = async () => {
		for (let i = 0; i < 8; i++) await Promise.resolve();
	};
	const advance = async (to: number) => {
		while (true) {
			const next = [...tasks.entries()]
				.filter(([, t]) => t.at <= to)
				.sort((a, b) => a[1].at - b[1].at)[0];
			if (!next) break;
			now = next[1].at;
			tasks.delete(next[0]);
			next[1].run();
			await flush();
		}
		now = to;
		await flush();
	};
	return { loop, reads, transports, states, advance, flush, tasks };
}
test("a read slightly longer than the renewal interval does not skip an entire interval", async () => {
	const h = harness();
	h.loop.start();
	expect(h.reads.map((r) => r.at)).toEqual([0]);
	await h.advance(900);
	h.reads[0]!.resolve("first");
	await h.flush();
	await h.advance(2000);
	expect(h.reads.map((r) => r.at)).toEqual([0, 2000]);
	await h.advance(4027);
	h.reads[1]!.resolve("second");
	await h.flush();
	await h.advance(4027);
	expect(h.reads.map((r) => r.at)).toEqual([0, 2000, 4027]);
	await h.advance(5314);
	h.reads[2]!.resolve("third");
	await h.flush();
	expect(h.transports).toHaveLength(1);
	expect(h.transports[0]!.closed).toBe(false);
	h.loop.close();
});
test("expired content clears immediately and a newer authorized read reconnects with a fresh transport", async () => {
	const h = harness();
	h.loop.start();
	h.reads[0]!.resolve("first");
	await h.flush();
	await h.advance(2000);
	await h.advance(5000);
	expect(h.transports[0]!.closed).toBe(true);
	expect(h.states.at(-1)).toBe("paused");
	await h.advance(5100);
	h.reads[1]!.resolve("fresh");
	await h.flush();
	expect(h.transports).toHaveLength(2);
	expect(h.transports[1]!.published).toEqual([
		{ value: "fresh", deadline: 7000 },
	]);
	h.loop.close();
});
test("a late result cannot extend its read-start lease and failures retry without stale content", async () => {
	const h = harness();
	h.loop.start();
	await h.advance(5001);
	h.reads[0]!.resolve("expired");
	await h.flush();
	expect(h.transports).toEqual([]);
	expect(h.states.at(-1)).toBe("paused");
	await h.advance(7001);
	expect(h.reads).toHaveLength(2);
	h.reads[1]!.reject(Error("revoked"));
	await h.flush();
	expect(h.transports).toEqual([]);
	await h.advance(9001);
	h.reads[2]!.resolve("reauthorized");
	await h.flush();
	expect(h.transports[0]!.published).toEqual([
		{ value: "reauthorized", deadline: 14001 },
	]);
	h.loop.close();
});
test("a hung renewal clears the view without piling up concurrent queries", async () => {
	const h = harness();
	h.loop.start();
	h.reads[0]!.resolve("first");
	await h.flush();
	await h.advance(20000);
	expect(h.reads).toHaveLength(2);
	expect(h.transports[0]!.closed).toBe(true);
	h.loop.close();
	h.reads[1]!.resolve("late");
	await h.flush();
	expect(h.transports).toHaveLength(1);
	expect(h.tasks.size).toBe(0);
});
test("disposed scope cannot publish a pending result or disturb another lifecycle", async () => {
	const old = harness();
	old.loop.start();
	old.loop.close();
	const current = harness();
	current.loop.start();
	current.reads[0]!.resolve("current");
	await current.flush();
	old.reads[0]!.resolve("old");
	await old.flush();
	expect(old.transports).toEqual([]);
	expect(current.transports[0]!.closed).toBe(false);
	current.loop.close();
	expect(current.tasks.size).toBe(0);
});

test("a Website that never acknowledges the handshake is retired despite fresh reads", async () => {
	const h = harness(true);
	h.loop.start();
	h.reads[0]!.resolve("first");
	await h.flush();
	await h.advance(2000);
	h.reads[1]!.resolve("second");
	await h.flush();
	await h.advance(4000);
	h.reads[2]!.resolve("third");
	await h.flush();
	await h.advance(5000);
	expect(h.transports[0]!.closed).toBe(true);
	expect(h.states.at(-1)).toBe("unavailable");
	h.loop.close();
});

test("a server access deadline closes the preview before the normal renewal interval", async () => {
	const h = harness(false, () => 700);
	h.loop.start();
	h.reads[0]!.resolve("gated");
	await h.flush();
	expect(h.transports[0]!.published).toEqual([
		{ value: "gated", deadline: 700 },
	]);
	await h.advance(699);
	expect(h.transports[0]!.closed).toBe(false);
	await h.advance(700);
	expect(h.transports[0]!.closed).toBe(true);
	expect(h.states.at(-1)).toBe("paused");
	h.loop.close();
});
test("expired or invalid server access evidence cannot be renewed by a successful response", async () => {
	for (const deadline of [0, -1, Number.NaN, Infinity]) {
		const h = harness(false, () => deadline);
		h.loop.start();
		h.reads[0]!.resolve("stale");
		await h.flush();
		expect(h.transports).toEqual([]);
		expect(h.states.at(-1)).toBe("paused");
		h.loop.close();
	}
	const h = harness(false, () => 999999);
	h.loop.start();
	h.reads[0]!.resolve("bounded");
	await h.flush();
	expect(h.transports[0]!.published[0]!.deadline).toBe(5000);
	h.loop.close();
});

test("render acknowledgement updates native status immediately and cannot outlive its lifecycle", async () => {
	const h = harness(true);
	h.loop.start();
	h.reads[0]!.resolve("first");
	await h.flush();
	expect(h.states.at(-1)).toBe("connecting");
	h.transports[0]!.notify("received");
	expect(h.states.at(-1)).toBe("received");
	h.transports[0]!.notify("rendered");
	expect(h.states.at(-1)).toBe("connected");
	h.loop.close();
	const count = h.states.length;
	h.transports[0]!.notify("rendered");
	expect(h.states).toHaveLength(count);
	expect(h.tasks.size).toBe(0);
});
test("receiver rejection stops retries and late reads cannot reopen a failed preview", async () => {
	const h = harness(true);
	h.loop.start();
	h.reads[0]!.resolve("first");
	await h.flush();
	await h.advance(2000);
	h.transports[0]!.notify("rejected");
	expect(h.states.at(-1)).toBe("unavailable");
	expect(h.transports[0]!.closed).toBe(true);
	h.reads[1]!.resolve("late");
	await h.flush();
	await h.advance(20000);
	expect(h.transports).toHaveLength(1);
	expect(h.reads).toHaveLength(2);
	expect(h.tasks.size).toBe(0);
	h.loop.close();
});
test("receiving documents without rendering does not extend the acknowledgement deadline", async () => {
	const h = harness(true);
	h.loop.start();
	h.reads[0]!.resolve("first");
	await h.flush();
	h.transports[0]!.notify("received");
	for (const at of [2000, 4000]) {
		await h.advance(at);
		h.reads.at(-1)!.resolve("fresh");
		await h.flush();
		h.transports[0]!.notify("received");
	}
	await h.advance(5000);
	expect(h.states.at(-1)).toBe("unavailable");
	expect(h.transports[0]!.closed).toBe(true);
	await h.advance(20000);
	expect(h.transports).toHaveLength(1);
	h.loop.close();
});

test("draft refresh coalesces edits and discards an older in-flight response without replacing the frame", async () => {
	const h = harness();
	h.loop.start();
	h.reads[0]!.resolve("saved");
	await h.flush();
	h.loop.refresh();
	await h.advance(300);
	expect(h.reads).toHaveLength(2);
	h.loop.refresh();
	await h.advance(400);
	h.loop.refresh();
	h.reads[1]!.resolve("obsolete draft");
	await h.flush();
	expect(h.transports[0]!.published.map((item) => item.value)).toEqual([
		"saved",
	]);
	await h.advance(699);
	expect(h.reads).toHaveLength(2);
	await h.advance(700);
	expect(h.reads).toHaveLength(3);
	h.reads[2]!.resolve("latest draft");
	await h.flush();
	expect(h.transports).toHaveLength(1);
	expect(h.transports[0]!.published.map((item) => item.value)).toEqual([
		"saved",
		"latest draft",
	]);
	h.loop.close();
	h.loop.refresh();
	await h.advance(5000);
	expect(h.reads).toHaveLength(3);
});
