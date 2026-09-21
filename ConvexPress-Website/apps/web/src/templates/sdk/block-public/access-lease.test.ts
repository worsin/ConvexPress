import { expect, test } from 'bun:test';
import { createPublicLeaseClock, type PublicLeaseTimers } from './access-lease';
export function fakeLeaseTimers() {
  let now = 0, id = 0;
  const pending = new Map<number, { callback: () => void; due: number }>();
  const timers: PublicLeaseTimers = {
    now: () => now,
    schedule(callback, delay) { const key = ++id; pending.set(key, { callback, due: now + delay }); return key; },
    cancel(handle) { pending.delete(handle as number); },
  };
  return { timers, pending, advance(ms: number, deliver = true) {
    now += ms;
// eslint-disable-next-line unicorn/no-useless-spread -- Snapshot callbacks so newly scheduled jobs wait for the next simulated tick.
    if (deliver) for (const [key, job] of [...pending]) if (job.due <= now) { pending.delete(key); job.callback(); }
  } };
}
test('server clock skew and network delay cannot extend an initial access lease', () => {
  for (const serverTime of [1000, 9_000_000_000_000]) {
    const fake = fakeLeaseTimers(); let expired = 0;
    const clock = createPublicLeaseClock(fake.timers, () => expired++);
    fake.advance(2000);
    expect(clock.install({ evaluatedAt: serverTime, expiresAt: serverTime + 5000 })).toBe(true);
    fake.advance(2999); expect(expired).toBe(0);
    fake.advance(1); expect(expired).toBe(1);
    clock.dispose(); expect(fake.pending.size).toBe(0);
  }
});
test('late results, old evaluations, and duplicate delivery cannot revive or extend expired authority', () => {
  const fake = fakeLeaseTimers(); let expired = 0;
  const clock = createPublicLeaseClock(fake.timers, () => expired++);
  const lease = { evaluatedAt: 100000, expiresAt: 105000 };
  expect(clock.install(lease)).toBe(true);
  fake.advance(3000); expect(clock.install(lease)).toBe(true);
  fake.advance(2000); expect(expired).toBe(1);
  expect(clock.install(lease)).toBe(false);
  expect(clock.install({ evaluatedAt: 99000, expiresAt: 110000 })).toBe(false);
  const late = createPublicLeaseClock(fake.timers, () => expired++);
  fake.advance(6000); expect(late.install(lease)).toBe(false);
  clock.dispose(); late.dispose();
});
test('a real newer evaluation can renew authority, while wake and cleanup invalidate suspended views', () => {
  const fake = fakeLeaseTimers(); let expired = 0;
  const clock = createPublicLeaseClock(fake.timers, () => expired++);
  expect(clock.install({ evaluatedAt: 100000, expiresAt: 105000 })).toBe(true);
  fake.advance(3000);
  expect(clock.install({ evaluatedAt: 103000, expiresAt: 108000 })).toBe(true);
  fake.advance(3000); expect(expired).toBe(0);
  fake.advance(3000, false); expect(expired).toBe(0);
  clock.check(); expect(expired).toBe(1);
  expect(clock.install(null)).toBe(true);
  expect(fake.pending.size).toBe(0);
  clock.dispose(); expect(clock.install({ evaluatedAt: 109000, expiresAt: 110000 })).toBe(false);
});
