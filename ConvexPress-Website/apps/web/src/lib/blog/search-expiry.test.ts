import { expect, test } from "bun:test";
import { subscribeSearchDisplay, type SearchDisplay } from "./search-expiry";
function fixture() {
	let now = 0,
		callback = () => {},
		value: unknown;
	const pending = new Map<number, () => void>();
	let id = 0,
		stopped = false;
	const timers = {
		now: () => now,
		schedule: (fn: () => void, _delay: number) => {
			pending.set(++id, fn);
			return id;
		},
		cancel: (key: unknown) => {
			pending.delete(key as number);
		},
	};
	const watch = {
		localQueryResult: () => value,
		onUpdate: (fn: () => void) => {
			callback = fn;
			return () => {
				stopped = true;
			};
		},
	};
	return {
		timers,
		watch,
		pending,
		stopped: () => stopped,
		deliver: (v: unknown) => {
			value = v;
			callback();
		},
		advance: (t: number) => {
			now = t;
			const calls = [...pending.values()];
			pending.clear();
			for (const fn of calls) fn();
		},
	};
}
type Value = {
	results: string[];
	displayLease: { evaluatedAt: number; expiresAt: number } | null;
};
test("expiry withdraws results and ignores late old-query updates before replacement", () => {
	const f = fixture(),
		seen: SearchDisplay<Value>[] = [];
	let renew = 0;
	const stop = subscribeSearchDisplay<Value>(f.watch, (v) => seen.push(v), {
		timers: f.timers,
		onExpired: () => renew++,
	});
	f.advance(400);
	f.deliver({
		results: ["old"],
		displayLease: { evaluatedAt: 100000, expiresAt: 101000 },
	});
	expect(seen.length).toBe(1);
	f.advance(1000);
	expect(seen.at(-1)).toEqual({ expired: true });
	expect(renew).toBe(1);
	f.deliver({
		results: ["resurrection"],
		displayLease: { evaluatedAt: 101000, expiresAt: 102000 },
	});
	expect(seen.length).toBe(2);
	expect(renew).toBe(1);
	stop();
	expect(f.stopped()).toBe(true);
	expect(f.pending.size).toBe(0);
});
test("zero-result future matches refresh too, and cleanup cancels their deadline", () => {
	const f = fixture(),
		seen: SearchDisplay<Value>[] = [];
	let renew = 0;
	const stop = subscribeSearchDisplay<Value>(f.watch, (v) => seen.push(v), {
		timers: f.timers,
		onExpired: () => renew++,
	});
	f.deliver({
		results: [],
		displayLease: { evaluatedAt: 5000, expiresAt: 6000 },
	});
	expect(seen.at(-1)).toEqual({
		value: {
			results: [],
			displayLease: { evaluatedAt: 5000, expiresAt: 6000 },
		},
	});
	stop();
	f.advance(2000);
	f.deliver({ results: ["late"], displayLease: null });
	expect(renew).toBe(0);
	expect(seen.length).toBe(1);
});
test("expired or malformed transport responses never become accepted display", () => {
	const f = fixture(),
		seen: SearchDisplay<Value>[] = [];
	let renew = 0;
	subscribeSearchDisplay<Value>(f.watch, (v) => seen.push(v), {
		timers: f.timers,
		onExpired: () => renew++,
	});
	f.advance(1200);
	f.deliver({
		results: ["old"],
		displayLease: { evaluatedAt: 100000, expiresAt: 101000 },
	});
	expect(seen).toEqual([{ expired: true }]);
	expect(renew).toBe(1);
	const g = fixture(),
		errors: SearchDisplay<Value>[] = [];
	subscribeSearchDisplay<Value>(g.watch, (v) => errors.push(v), {
		timers: g.timers,
		onExpired: () => {},
	});
	g.deliver({
		results: ["invalid"],
		displayLease: { evaluatedAt: -1, expiresAt: 1 },
	});
	expect(errors).toEqual([{ error: true }]);
});

test("a response from another viewer cannot enter the current generation", () => {
	const f = fixture(),
		seen: SearchDisplay<Value>[] = [];
	subscribeSearchDisplay<Value>(f.watch, (v) => seen.push(v), {
		viewerSubject: null,
		timers: f.timers,
		onExpired: () => {},
	});
	f.deliver({
		results: ["member"],
		viewerSubject: "previous-user",
		displayLease: null,
	});
	expect(seen).toEqual([{ error: true }]);
	f.deliver({ results: ["public"], viewerSubject: null, displayLease: null });
	expect(seen.at(-1)).toEqual({
		value: { results: ["public"], viewerSubject: null, displayLease: null },
	});
});
