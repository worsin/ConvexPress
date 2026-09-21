import { expect, test } from "bun:test";
import { importConvexSnapshot, type SnapshotImportState } from "../snapshotImportApi";
import { epochFixture } from "./epoch-fixture.test-support";
const ORIGIN = "http://127.0.0.1:4830";
const BASE = {
  deploymentOrigin: ORIGIN,
  deploymentAdminKey: "synthetic-admin-key-long-enough",
  importKey: "a".repeat(24),
  approvedReplaceAll: true,
  bytes: new Uint8Array([1, 2, 3, 4, 5, 6, 7]),
  chunkSizeBytes: 4,
  pollIntervalMs: 0,
  listImports: async () => [],
};
function provider() {
  let epoch: { name: string; value: string } | null = null;
  const calls: Array<{ url: string; init: RequestInit }> = [];
  const state = { fail: "", loseActivationAck: false };
  const fixture = epochFixture(() => epoch);
  return {
    calls,
    state,
    fixture,
    get epoch() {
      return epoch;
    },
    fetchImpl: async (url: string | URL | Request, init: RequestInit = {}) => {
      const name = String(url);
      calls.push({ url: name, init });
      if (name.endsWith("update_environment_variables")) {
        if (state.fail === "env") throw Error("provider private failure");
        epoch = JSON.parse(String(init.body)).changes[0];
        if (state.loseActivationAck && epoch!.value.startsWith("mi_ready_"))
          throw Error("lost activation acknowledgement");
        return Response.json({});
      }
      if (state.fail && name.includes(state.fail)) throw Error("provider private failure");
      if (name.includes("start_upload")) return Response.json({ uploadToken: "upload" });
      if (name.includes("upload_part")) return Response.json({ partToken: "part" });
      if (name.includes("finish_upload")) return Response.json({ importId: "importsafe" });
      if (name.includes("perform_import")) return Response.json({});
      throw Error("Unexpected provider URL");
    },
  };
}
test("actual site authority fences upload, binds known ID before perform, activates only completed import and durably avoids replay", async () => {
  const p = provider();
  const states: SnapshotImportState[] = [
    { state: "uploaded" },
    { state: "waiting_for_confirmation" },
    { state: "in_progress" },
    { state: "completed", num_rows_written: 42n },
  ];
  const input = {
    ...BASE,
    ...p.fixture,
    fetchImpl: p.fetchImpl,
    readImportState: async () => states.shift()!,
  };
  expect(await importConvexSnapshot(input)).toEqual({
    importId: "importsafe",
    rowsWritten: 42,
    recovered: false,
  });
  expect(p.calls.filter((call) => call.url.includes("upload_part"))).toHaveLength(2);
  const env = p.calls
    .filter((call) => call.url.endsWith("update_environment_variables"))
    .map((call) => JSON.parse(String(call.init.body)).changes[0].value);
  expect(env).toHaveLength(3);
  expect(env[0]).toStartWith("mi_pending_");
  expect(env[1]).toBe(`${env[0]}_importsafe`);
  expect(env[2]).toStartWith("mi_ready_");
  expect(p.calls.findIndex((call) => call.url.includes("perform_import"))).toBeGreaterThan(
    p.calls.findIndex(
      (call) =>
        call.url.endsWith("update_environment_variables") &&
        String(call.init.body).includes("importsafe"),
    ),
  );
  const count = p.calls.length;
  expect(
    await importConvexSnapshot({
      ...input,
      readImportState: async () => ({ state: "completed", num_rows_written: 42 }),
    }),
  ).toEqual({ importId: "importsafe", rowsWritten: 42, recovered: true });
  expect(p.calls).toHaveLength(count);
  expect(
    p.calls.every(
      (call) =>
        new Headers(call.init.headers).get("Authorization") === `Convex ${BASE.deploymentAdminKey}`,
    ),
  ).toBe(true);
});
test("unknown upload response survives retries without epoch rotation or another upload", async () => {
  const p = provider();
  p.state.fail = "start_upload";
  const input = { ...BASE, ...p.fixture, fetchImpl: p.fetchImpl };
  await expect(importConvexSnapshot(input)).rejects.toThrow("request failed safely");
  const count = p.calls.length;
  await expect(importConvexSnapshot(input)).rejects.toThrow("unresolved upload identity");
  expect(p.calls).toHaveLength(count);
  expect(p.epoch?.value).toStartWith("mi_pending_");
});
test("lost environment response with no write remains fenced across retries before any bytes are consumed", async () => {
  const p = provider();
  p.state.fail = "env";
  let consumed = false;
  const input = {
    ...BASE,
    bytes: undefined,
    ...p.fixture,
    fetchImpl: p.fetchImpl,
    stream: (async function* () {
      consumed = true;
      yield new Uint8Array([1]);
    })(),
  };
  await expect(importConvexSnapshot(input)).rejects.toThrow("invalidation could not be verified");
  await expect(importConvexSnapshot(input)).rejects.toThrow("invalidation could not be verified");
  expect(consumed).toBe(false);
  expect(p.calls).toHaveLength(1);
});
test("known import polling timeout resumes the same ID; lost activation acknowledgement resolves by exact site readback", async () => {
  const p = provider();
  const input = { ...BASE, ...p.fixture, fetchImpl: p.fetchImpl, maxPollAttempts: 1 };
  await expect(
    importConvexSnapshot({ ...input, readImportState: async () => ({ state: "in_progress" }) }),
  ).rejects.toThrow("safe wait window");
  p.state.loseActivationAck = true;
  expect(
    await importConvexSnapshot({
      ...input,
      readImportState: async (id) => {
        expect(id).toBe("importsafe");
        return { state: "completed", num_rows_written: 1 };
      },
    }),
  ).toMatchObject({ importId: "importsafe", recovered: true });
  expect(p.calls.filter((call) => call.url.includes("start_upload"))).toHaveLength(1);
  expect(p.epoch?.value).toStartWith("mi_ready_");
});
test("approval, other active imports, wrong source identity and failed imports cannot authorize replacement or ready", async () => {
  const p = provider();
  const input = { ...BASE, ...p.fixture, fetchImpl: p.fetchImpl };
  await expect(importConvexSnapshot({ ...input, approvedReplaceAll: false })).rejects.toThrow(
    "not approved",
  );
  await expect(
    importConvexSnapshot({
      ...input,
      listImports: async () => [{ state: { state: "in_progress" } }],
    }),
  ).rejects.toThrow("already in progress");
  expect(p.calls).toHaveLength(0);
  await expect(
    importConvexSnapshot({ ...input, readImportState: async () => ({ state: "failed" }) }),
  ).rejects.toThrow("failed safely");
  expect(p.epoch?.value).toStartWith("mi_pending_");
  await expect(importConvexSnapshot({ ...input, importKey: "b".repeat(24) })).rejects.toThrow(
    "Another snapshot import",
  );
});

test("lost final verification request recovers its known dispatched activation without a new epoch write or upload", async () => {
  const p = provider();
  let drop = true;
  const input = {
    ...BASE,
    ...p.fixture,
    fetchImpl: p.fetchImpl,
    readImportState: async () => ({ state: "completed" as const, num_rows_written: 3 }),
    coordinateEpoch: async (...args: Parameters<typeof p.fixture.coordinateEpoch>) => {
      if (args[0] === "verify" && args[1].kind === "activate" && drop) {
        drop = false;
        throw Error("verification request never arrived");
      }
      return p.fixture.coordinateEpoch(...args);
    },
  };
  await expect(importConvexSnapshot(input)).rejects.toThrow("never arrived");
  const count = p.calls.length;
  expect((await p.fixture.readCompletedImport())?.verified).toBe(false);
  expect(await importConvexSnapshot(input)).toEqual({
    importId: "importsafe",
    rowsWritten: 3,
    recovered: true,
  });
  expect(p.calls).toHaveLength(count);
  expect((await p.fixture.readCompletedImport())?.verified).toBe(true);
});
