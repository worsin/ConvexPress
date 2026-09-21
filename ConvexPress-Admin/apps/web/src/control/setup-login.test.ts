import { expect, test } from "bun:test";
import { rejects } from "node:assert/strict";
import { completeControlSetupLogin } from "./setup-login";

const credentials = () => ({
  identifier: "operator@example.test",
  password: "synthetic-test-only",
  createdAt: Date.now(),
  expiresAt: Date.now() + 60_000,
});

test("native operator handoff clears persisted credentials before authenticating", async () => {
  const calls: string[] = [];
  const handoff = credentials();
  expect(await completeControlSetupLogin({
    credentials: handoff,
    clear: async () => { calls.push("clear"); },
    signIn: async (email, password) => {
      expect(email).toBe(handoff.identifier);
      expect(password).toBe(handoff.password);
      calls.push("sign-in");
    },
  })).toBeUndefined();
  expect(calls).toEqual(["clear", "sign-in"]);
});

test("failed sign-in consumes the handoff and returns only a safe retry message", async () => {
  let saved: unknown = credentials();
  let attempts = 0;
  const input = {
    clear: async () => { saved = null; },
    signIn: async () => { attempts++; throw new Error("private provider response"); },
  };
  const message = await completeControlSetupLogin({ ...input, credentials: saved });
  expect(message).toContain("Please sign in again");
  expect(message).not.toContain("private provider response");
  await completeControlSetupLogin({ ...input, credentials: saved });
  expect(attempts).toBe(1);
});

test("expired or malformed handoffs are cleared without authentication", async () => {
  for (const handoff of [{ ...credentials(), expiresAt: 1 }, { password: "invalid" }]) {
    let cleared = false;
    let called = false;
    expect(await completeControlSetupLogin({
      credentials: handoff,
      clear: async () => { cleared = true; },
      signIn: async () => { called = true; },
    })).toContain("expired");
    expect(cleared).toBe(true);
    expect(called).toBe(false);
  }
});

test("storage cleanup failure prevents an authentication request", async () => {
  let called = false;
  await rejects(completeControlSetupLogin({
    credentials: credentials(),
    clear: async () => { throw new Error("storage unavailable"); },
    signIn: async () => { called = true; },
  }), /storage unavailable/);
  expect(called).toBe(false);
});
