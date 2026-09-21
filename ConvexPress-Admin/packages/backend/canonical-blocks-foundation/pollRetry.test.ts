import { expect, test } from "bun:test";
import { retryPollWrite, isPollWriteConflict } from "./pollRetry";
const conflict = () => new Error(JSON.stringify({ code: "OptimisticConcurrencyControlFailure" }));
test("bounded poll conflict retries reuse the operation, back off and stop on revoked authority", async () => {
  const delays: number[] = []; let calls = 0;
  expect(await retryPollWrite(async () => { if (++calls < 3) throw conflict(); return "recorded"; }, { pause: async ms => { delays.push(ms); }, random: () => 0 })).toBe("recorded");
  expect(calls).toBe(3); expect(delays).toEqual([150, 300]);
  calls = 0;
  await expect(retryPollWrite(async () => { calls++; throw conflict(); }, { pause: async () => {}, active: () => calls === 0 })).rejects.toThrow("authority changed");
  expect(calls).toBe(1);
  calls = 0;
  await expect(retryPollWrite(async () => { calls++; throw conflict(); }, { pause: async () => {} })).rejects.toThrow();
  expect(calls).toBe(5);
});
test("poll retries recognize the actual system error but never retry policy, CAPTCHA, rate or transport failures", async () => {
  expect(isPollWriteConflict(new Error('Server Error: Documents read from or written to the "form_poll_tallies" table changed while this mutation was being run and on every subsequent retry.'))).toBe(true);
  for (const message of ["POLL_UNAVAILABLE", "POLL_RATE_LIMIT", "POLL_VERIFICATION_REQUIRED", "Network disconnected", "Unrelated error"]) {
    let calls = 0;
    await expect(retryPollWrite(async () => { calls++; throw new Error(message); })).rejects.toThrow(message);
    expect(calls).toBe(1);
  }
});
