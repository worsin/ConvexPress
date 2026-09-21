import { expect, test } from "bun:test";
import {
  controlAuthStorage,
  flushControlAuthStorage,
  initializeControlAuthStorage,
} from "./auth-storage";

test("a failed session write is reported without preventing logout cleanup or a new login", async () => {
  const previous = globalThis.window;
  const saved = new Map([["better-auth_cookie", "old synthetic session"]]);
  let fail = true;
  globalThis.window = {
    convexpress: {},
    electronAuth: {
      getItem: async (key: string) => saved.get(key) ?? null,
      setItem: async (key: string, value: string) => {
        if (fail) {
          fail = false;
          throw new Error("synthetic storage failure");
        }
        saved.set(key, value);
      },
      removeItem: async (key: string) => {
        saved.delete(key);
      },
    },
  } as unknown as Window & typeof globalThis;
  try {
    await initializeControlAuthStorage();
    controlAuthStorage.setItem("better-auth_cookie", "failed synthetic session");
    let failure: unknown;
    try {
      await flushControlAuthStorage();
    } catch (error) {
      failure = error;
    }
    expect(failure instanceof Error ? failure.message : failure).toBe("synthetic storage failure");
    controlAuthStorage.removeItem("better-auth_cookie");
    await flushControlAuthStorage();
    expect(saved.has("better-auth_cookie")).toBe(false);
    controlAuthStorage.setItem("better-auth_cookie", "new synthetic session");
    await flushControlAuthStorage();
    expect(saved.get("better-auth_cookie")).toBe("new synthetic session");
  } finally {
    globalThis.window = previous;
  }
});
