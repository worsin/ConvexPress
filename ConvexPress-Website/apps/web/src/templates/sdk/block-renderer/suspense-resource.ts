/** A cached Suspense resource for a code chunk. Once loaded, `read` returns it
 * synchronously, so hydrating a server-rendered tree never suspends on code the
 * page already has. Preloads consume failures; the next read reports the same
 * error to the document boundary instead of retrying a missing chunk. */
export function suspenseResource<T>(load: () => Promise<T>) {
  let state: "idle" | "pending" | "ready" | "failed" = "idle";
  let value: T, error: unknown, pending: Promise<void>;
  const start = () => {
    if (state === "idle") {
      state = "pending";
      pending = Promise.resolve().then(load).then(
        result => { value = result; state = "ready"; },
        reason => { error = reason; state = "failed"; },
      );
    }
    return pending;
  };
  return {
    start,
    async get() { await start(); if (state === "failed") throw error; return value; },
    read() { start(); if (state === "pending") throw pending; if (state === "failed") throw error; return value; },
  };
}
