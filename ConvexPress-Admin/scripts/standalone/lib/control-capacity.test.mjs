import { test } from "node:test";
import assert from "node:assert/strict";
import { assessControlCapacity, VERIFIED_IMAGE_REVISION } from "./control-capacity.mjs";
const knobs = workers => ({ MAX_ISOLATE_WORKERS: workers, APPLICATION_MAX_CONCURRENT_QUERIES: 8, APPLICATION_MAX_CONCURRENT_MUTATIONS: 8, APPLICATION_MAX_CONCURRENT_V8_ACTIONS: 4 });
test("rejects observed starvation configuration and admits headroom without increasing request limits", () => {
  const bad = assessControlCapacity({ imageRevision: VERIFIED_IMAGE_REVISION, environment: knobs(8) });
  assert.equal(bad.status, "unsafe");
  assert.equal(bad.outerAdmission, 20);
  const candidate = assessControlCapacity({ imageRevision: VERIFIED_IMAGE_REVISION, environment: knobs(32) });
  assert.equal(candidate.status, "headroom-present");
  assert.equal(candidate.spareWorkers, 12);
  assert.equal(candidate.workloadVerified, false);
  assert.equal(candidate.limits.APPLICATION_MAX_CONCURRENT_QUERIES, 8);
});
test("equal pool and outer admission is unsafe; absent overrides use only verified revision defaults", () => {
  assert.equal(assessControlCapacity({ imageRevision: VERIFIED_IMAGE_REVISION, environment: knobs(20) }).status, "unsafe");
  const defaulted = assessControlCapacity({ imageRevision: VERIFIED_IMAGE_REVISION, environment: {} });
  assert.equal(defaulted.limits.MAX_ISOLATE_WORKERS, 300);
  assert.equal(defaulted.outerAdmission, 96);
  assert.equal(defaulted.status, "headroom-present");
  assert.equal(assessControlCapacity({ imageRevision: "unknown", environment: knobs(32) }).status, "unverified-image");
});
test("invalid knob values fail closed without reflecting environment contents", () => {
  for (const value of [0, -1, 1.1, "", "8x", "1e2", null, false, 999999999999999999]) {
    const result = assessControlCapacity({ imageRevision: VERIFIED_IMAGE_REVISION, environment: { ...knobs(32), MAX_ISOLATE_WORKERS: value, SECRET: "never-echo-this" } });
    assert.equal(result.status, "invalid");
    assert.ok(!JSON.stringify(result).includes("never-echo-this"));
  }
});
test("Docker-style environment strings accept numeric knobs and redact unrelated values", () => {
  const environment = [...Object.entries(knobs(32)).map(([key, value]) => `${key}=${value}`), "CREDENTIAL=not-for-logs"];
  const result = assessControlCapacity({ imageRevision: VERIFIED_IMAGE_REVISION, environment });
  assert.equal(result.status, "headroom-present");
  assert.ok(!JSON.stringify(result).includes("not-for-logs"));
  environment.push("MAX_ISOLATE_WORKERS=99");
  assert.equal(assessControlCapacity({ imageRevision: VERIFIED_IMAGE_REVISION, environment }).status, "invalid");
});

test("malformed known environment entries cannot silently select a default", () => {
  assert.equal(assessControlCapacity({ imageRevision: VERIFIED_IMAGE_REVISION, environment: ["MAX_ISOLATE_WORKERS"] }).status, "invalid");
});

test("actual doctor CLI uses safe exit codes and never reflects malformed secret input", async () => {
  const { spawnSync } = await import("node:child_process");
  const { fileURLToPath } = await import("node:url");
  const run = input => spawnSync(process.execPath, [fileURLToPath(new URL("../check-control-capacity.mjs", import.meta.url))], { input, encoding: "utf8" });
  const good = run(JSON.stringify({ imageRevision: VERIFIED_IMAGE_REVISION, environment: knobs(32) }));
  assert.equal(good.status, 0);
  assert.equal(JSON.parse(good.stdout).workloadVerified, false);
  const unsafe = run(JSON.stringify({ imageRevision: VERIFIED_IMAGE_REVISION, environment: knobs(8) }));
  assert.equal(unsafe.status, 1);
  assert.equal(JSON.parse(unsafe.stdout).status, "unsafe");
  for (const input of ['{"SECRET":"never-echo-this",', "never-echo-this".repeat(30000)]) {
    const invalid = run(input);
    assert.equal(invalid.status, 1);
    assert.ok(!`${invalid.stdout}${invalid.stderr}`.includes("never-echo-this"));
    assert.equal(JSON.parse(invalid.stdout).status, "invalid");
  }
});
