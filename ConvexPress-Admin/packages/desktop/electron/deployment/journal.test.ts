import { spawn } from "node:child_process";
import { expect, test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { DeploymentJournal } from "./journal";

const plan = {
  kind: "initialize" as const,
  targetOrigin: "https://alpha.convex.cloud",
  identity: {
    websiteKey: "site_alpha",
    instanceKey: "instance_alpha",
    instanceId: "outer_instance_alpha",
    managementOrigin: "https://alpha.convex.site",
    siteOrigin: "https://alpha.example",
  },
};

test("journal recovers every interrupted phase with fresh attempts and immutable targets", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "convexpress-journal-test-"));
  try {
    for (const phase of ["environment", "codegen", "deploy", "identity", "connect", "media-index"] as const) {
      const file = path.join(dir, `${phase}.json`);
      const first = new DeploymentJournal(file);
      const run = first.begin(plan);
      first.checkpoint(run.runId, phase, "started");
      first.recordMediaIndex(run.runId, {status:"building",generation:"epoch_123456789012:version",sequence:4,owner:"posts",completedOwners:1,totalOwners:26,pages:4,documents:15});
      const restarted = new DeploymentJournal(file);
      expect(restarted.status(plan.targetOrigin)?.phase).toBe("interrupted");
      expect(() =>
        restarted.begin({ ...plan, identity: { ...plan.identity, websiteKey: "site_other" } }),
      ).toThrow("identity");
      const resumed = restarted.begin(plan);
      expect(resumed.runId).toBe(run.runId);
      expect(resumed.attempt).toBe(2);
      expect(resumed.mediaIndex?.sequence).toBe(4);
      expect(resumed.receipts.some((entry) => entry.phase === phase)).toBe(true);
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("journal excludes secrets, permits sibling runs and excludes same-target concurrency", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "convexpress-journal-test-"));
  try {
    const file = path.join(dir, "runs.json");
    const journal = new DeploymentJournal(file);
    const run = journal.begin(plan);
    expect(() => journal.begin(plan)).toThrow("running");
    const sibling = journal.begin({
      ...plan,
      targetOrigin: "https://beta.convex.cloud",
      identity: { ...plan.identity, websiteKey: "site_beta" },
    });
    journal.finish(run.runId, false);
    expect(journal.status(sibling.targetOrigin)?.ok).toBe(null);
    const serialized = readFileSync(file, "utf8");
    expect(serialized).not.toContain("authToken");
    expect(serialized).not.toContain("adminKey");
    expect(serialized).not.toContain("envChanges");
    writeFileSync(file, "broken json");
    expect(() => new DeploymentJournal(file)).toThrow("journal");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("restart retains the target lock while its recorded subprocess is alive", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "convexpress-journal-test-"));
  try {
    const file = path.join(dir, "runs.json");
    const first = new DeploymentJournal(file);
    const run = first.begin(plan);
    const child = spawn(process.execPath, ["-e", "setInterval(() => {}, 1000)"], {
      detached: process.platform !== "win32",
      stdio: "ignore",
    });
    first.process(run.runId, child.pid!);
    const restarted = new DeploymentJournal(file);
    try {
      expect(() => restarted.begin(plan)).toThrow("still alive");
    } finally {
      child.kill("SIGKILL");
    }
    restarted.process(run.runId, null);
    expect(restarted.begin(plan).attempt).toBe(2);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
