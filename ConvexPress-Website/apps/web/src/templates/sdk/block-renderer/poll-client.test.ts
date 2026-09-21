import { pollDefaultSecurity } from "../block-data/portable/pollDataContracts";
import { test, expect } from "bun:test";
import { ensurePollVisitor, readPollVisitor, pollStorageKey, subscribePoll, pollResponseError, PollInteractionError } from "./poll-client";
import { parsePollDefinition, pollDefinitionVersion } from "../block-data/portable/pollContracts";
import type { PublicLeaseTimers } from "../block-public/access-lease";
const attrs = parsePollDefinition({ question: "A question", options: [{ key: "a", label: "First" }, { key: "b", label: "Second" }] });
const snapshot = { security: pollDefaultSecurity, postId: "page", blockId: "poll", definitionVersion: pollDefinitionVersion(attrs), question: attrs.question, options: attrs.options.map(option => ({ ...option, count: 0 })), total: 0, responsePolicy: "visitor" as const, canVote: true, votedKey: null, asOf: 100000, nextChangeAt: 105000 };
test("known response failures give safe recovery instructions without exposing raw provider errors", () => {
  for (const code of ["POLL_VERIFICATION_REQUIRED", "POLL_VERIFICATION_UNAVAILABLE", "POLL_RATE_LIMIT", "POLL_UNAVAILABLE"]) {
    const error = pollResponseError({ data: { code, message: "PRIVATE PROVIDER DETAILS" } });
    expect(error).toBeInstanceOf(PollInteractionError);
    expect((error as Error).message).not.toContain("PRIVATE");
  }
  const unknown = { data: { code: "constructor", message: "unsafe" } };
  expect(pollResponseError(unknown)).toBe(unknown);
  expect(pollResponseError(new Error("Network unavailable"))).not.toBeInstanceOf(PollInteractionError);
});
function clock() {
  let time = 0, next = 0; const jobs = new Map<number, { callback: () => void; due: number }>();
  const timers: PublicLeaseTimers = { now: () => time, schedule(callback, delay) { const id = ++next; jobs.set(id, { callback, due: time + delay }); return id; }, cancel(id) { jobs.delete(id as number); } };
// eslint-disable-next-line unicorn/no-useless-spread -- Snapshot callbacks so newly scheduled jobs wait for the next simulated tick.
  return { timers, jobs, advance(ms: number) { time += ms; for (const [id, job] of [...jobs]) if (job.due <= time) { jobs.delete(id); job.callback(); } } };
}
test("visitor identity is created only on submit, persists before a retry and stays scoped to environment/page/ballot", () => {
  const values = new Map<string, string>(), writes: string[] = [];
  const storage = { getItem: (key: string) => values.get(key) ?? null, setItem(key: string, value: string) { writes.push(key); values.set(key, value); } };
  const key = pollStorageKey("site:staging", snapshot);
  expect(readPollVisitor(storage, key)).toBeUndefined(); expect(writes).toHaveLength(0);
  const token = ensurePollVisitor(storage, key, crypto);
  expect(token).toMatch(/^[a-f0-9]{64}$/); expect(writes).toHaveLength(1);
  expect(ensurePollVisitor(storage, key, crypto)).toBe(token); expect(writes).toHaveLength(1);
  for (const other of [pollStorageKey("site:production", snapshot), pollStorageKey("other:staging", snapshot), pollStorageKey("site:staging", { ...snapshot, postId: "copy" }), pollStorageKey("site:staging", { ...snapshot, blockId: "copy" }), pollStorageKey("site:staging", { ...snapshot, definitionVersion: "other" })]) expect(other).not.toBe(key);
  expect(() => ensurePollVisitor({ getItem: () => null, setItem: () => {} }, key, crypto)).toThrow("Allow browser storage");
  expect(() => ensurePollVisitor({ getItem: () => { throw Error(); }, setItem: () => { throw Error(); } }, key, crypto)).toThrow("Allow browser storage");
});
test("subscription clears expired authority and suppresses queued old results after expiry and cleanup", () => {
  const fake = clock(), states: unknown[] = []; let expired = 0, stopped = 0, callback = () => {}; let value: unknown;
  const stop = subscribePoll({ localQueryResult: () => value, onUpdate(fn) { callback = fn; return () => { stopped++; }; } }, snapshot, state => states.push(state), () => { expired++; }, fake.timers);
  expect(states).toHaveLength(0); fake.advance(2000); value = snapshot; callback(); expect(states.at(-1)).toEqual(snapshot);
  fake.advance(2999); expect(expired).toBe(0); fake.advance(1); expect(expired).toBe(1); expect(states.at(-1)).toBeNull();
  value = { ...snapshot, asOf: 106000, nextChangeAt: 110000 }; callback(); expect(states.at(-1)).toBeNull(); expect(expired).toBe(1);
  stop(); const length = states.length; callback(); expect(states).toHaveLength(length); expect(fake.jobs.size).toBe(0); expect(stopped).toBe(1);
});
test("wrong source, definition, aggregate, hidden disclosures and transport errors never replace the authorized snapshot", () => {
  const fake = clock(), states: unknown[] = []; let callback = () => {}, value: unknown = snapshot, error = false;
  const stop = subscribePoll({ localQueryResult() { if (error) throw Error("Transport failed"); return value; }, onUpdate(fn) { callback = fn; return () => {}; } }, snapshot, state => states.push(state), () => {}, fake.timers);
  expect(states.at(-1)).toEqual(snapshot);
  for (const patch of [{ postId: "other" }, { blockId: "other" }, { definitionVersion: "f".repeat(64) }, { question: "Not the same question" }, { total: 1 }, { total: null }]) { value = { ...snapshot, ...patch }; callback(); expect(states.at(-1)).toBeNull(); }
  error = true; callback(); expect(states.at(-1)).toBeNull(); stop();
});
test("public polls without a membership deadline still expire their read after one minute", () => {
  const fake = clock(); let expired = 0; const states: unknown[] = [];
  const stop = subscribePoll({ localQueryResult: () => ({ ...snapshot, nextChangeAt: null }), onUpdate: () => () => {} }, snapshot, state => states.push(state), () => { expired++; }, fake.timers);
  fake.advance(60000); expect(expired).toBe(1); expect(states.at(-1)).toBeNull(); stop();
});
