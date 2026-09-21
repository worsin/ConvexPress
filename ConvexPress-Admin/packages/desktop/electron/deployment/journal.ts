import { parseMediaIndexProgress, type MediaIndexProgress } from "@convexpress/runtime-clients/media-index-maintenance";
import { randomUUID } from "node:crypto";
import {
  closeSync,
  existsSync,
  fsyncSync,
  mkdirSync,
  openSync,
  readFileSync,
  renameSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";

export type DeploymentPhase =
  | "environment"
  | "codegen"
  | "deploy"
  | "identity"
  | "connect"
  | "media-index"
  | "complete"
  | "failed"
  | "interrupted";
export interface DeploymentPlan {
  kind: "initialize" | "deploy";
  targetOrigin: string;
  identity?: {
    websiteKey: string;
    instanceKey: string;
    instanceId: string;
    managementOrigin: string;
    siteOrigin: string;
  };
}
export interface DeploymentRun extends DeploymentPlan {
  runId: string;
  label: string;
  startedAt: number;
  finishedAt: number | null;
  phase: DeploymentPhase;
  ok: boolean | null;
  error: string | null;
  attempt: number;
  receipts: {
    phase: DeploymentPhase;
    status: "started" | "completed";
    at: number;
    attempt: number;
  }[];
  connectionId: string | null;
  childPid: number | null;
  log: string[];
  mediaIndex?: MediaIndexProgress | null;
}

function copyIdentity(identity: DeploymentPlan["identity"]): DeploymentPlan["identity"] {
  return identity
    ? {
        websiteKey: identity.websiteKey,
        instanceKey: identity.instanceKey,
        instanceId: identity.instanceId,
        managementOrigin: identity.managementOrigin,
        siteOrigin: identity.siteOrigin,
      }
    : undefined;
}

function identityKey(plan: DeploymentPlan): string {
  const identity = plan.identity;
  return JSON.stringify([
    plan.kind,
    plan.targetOrigin,
    identity?.websiteKey,
    identity?.instanceKey,
    identity?.instanceId,
    identity?.managementOrigin,
    identity?.siteOrigin,
  ]);
}

const phases = new Set<DeploymentPhase>([
  "environment",
  "codegen",
  "deploy",
  "identity",
  "connect",
  "media-index",
  "complete",
  "failed",
  "interrupted",
]);
function readRun(value: unknown): DeploymentRun {
  const run = value as DeploymentRun;
  const text = (value: unknown) =>
    typeof value === "string" && value.length > 0 && value.length <= 500;
  if (
    !run ||
    !text(run.runId) ||
    !text(run.targetOrigin) ||
    !["initialize", "deploy"].includes(run.kind) ||
    !phases.has(run.phase) ||
    ![true, false, null].includes(run.ok) ||
    !Number.isFinite(run.startedAt) ||
    !(run.finishedAt === null || Number.isFinite(run.finishedAt)) ||
    !Number.isSafeInteger(run.attempt) ||
    run.attempt < 1 ||
    !Array.isArray(run.receipts) ||
    run.receipts.length > 200 ||
    !(run.childPid == null || (Number.isSafeInteger(run.childPid) && run.childPid > 0)) ||
    !(run.connectionId === null || text(run.connectionId))
  )
    throw new Error("invalid run");
  if (
    run.kind === "initialize" &&
    (!run.identity ||
      ![
        run.identity.websiteKey,
        run.identity.instanceKey,
        run.identity.instanceId,
        run.identity.managementOrigin,
        run.identity.siteOrigin,
      ].every(text))
  )
    throw new Error("invalid identity");
  const receipts = run.receipts.map((receipt) => {
    if (
      !phases.has(receipt.phase) ||
      !["started", "completed"].includes(receipt.status) ||
      !Number.isFinite(receipt.at) ||
      !Number.isSafeInteger(receipt.attempt)
    )
      throw new Error("invalid receipt");
    return {
      phase: receipt.phase,
      status: receipt.status,
      at: receipt.at,
      attempt: receipt.attempt,
    };
  });
  return {
    kind: run.kind,
    targetOrigin: run.targetOrigin,
    identity: copyIdentity(run.identity),
    runId: run.runId,
    label: run.kind === "initialize" ? `Initialize ${run.identity?.websiteKey}` : "Site deployment",
    startedAt: run.startedAt,
    finishedAt: run.finishedAt,
    phase: run.phase,
    ok: run.ok,
    error: run.ok === false ? "Deployment requires reconciliation." : null,
    attempt: run.attempt,
    receipts,
    connectionId: run.connectionId,
    childPid: run.childPid ?? null,
    log: [],
    ...(run.mediaIndex === undefined ? {} : { mediaIndex: run.mediaIndex === null ? null : parseMediaIndexProgress(run.mediaIndex) }),
  };
}

/** Atomic local receipts. Credentials and command output are deliberately not a journal field. */
export class DeploymentJournal {
  private runs: DeploymentRun[] = [];
  constructor(private readonly file: string) {
    if (!existsSync(file)) return;
    try {
      if (statSync(file).size > 16 * 1024 * 1024) throw new Error("oversized");
      const state = JSON.parse(readFileSync(file, "utf8"));
      if (state.version !== 1 || !Array.isArray(state.runs) || state.runs.length > 500)
        throw new Error("invalid");
      this.runs = state.runs.map(readRun);
      if (new Set(this.runs.map((run) => run.runId)).size !== this.runs.length)
        throw new Error("duplicate run");
      let recovered = false;
      for (const run of this.runs) {
        if (run.ok === null) {
          run.phase = "interrupted";
          run.ok = false;
          run.finishedAt = Date.now();
          run.error =
            "The previous process stopped. Retry with fresh credentials to reconcile this deployment.";
          recovered = true;
        }
      }
      if (recovered) this.persist();
    } catch {
      throw new Error(
        "Deployment journal cannot be read safely; repair the local journal before provisioning.",
      );
    }
  }

  begin(plan: DeploymentPlan): DeploymentRun {
    const previous = [...this.runs].reverse().find((run) => run.targetOrigin === plan.targetOrigin);
    if (previous?.childPid) {
      let alive = true;
      try {
        process.kill(process.platform === "win32" ? previous.childPid : -previous.childPid, 0);
      } catch (error) {
        alive = (error as NodeJS.ErrnoException).code !== "ESRCH";
      }
      if (alive)
        throw new Error(
          "The previous deployment process is still alive; wait for it to exit before retrying.",
        );
      previous.childPid = null;
    }
    if (previous?.ok === null) throw new Error("A deployment is already running for this target.");
    const priorIdentity = [...this.runs]
      .reverse()
      .find((run) => run.targetOrigin === plan.targetOrigin && run.kind === "initialize");
    if (
      plan.kind === "initialize" &&
      priorIdentity &&
      identityKey(priorIdentity) !== identityKey(plan)
    )
      throw new Error("Deployment target identity differs from the recorded initialization.");
    if (previous && !previous.ok && identityKey(previous) !== identityKey(plan))
      throw new Error(
        "The unfinished deployment identity must be reconciled before starting a different request.",
      );
    const retry = previous?.ok === false ? previous : null;
    if (!retry && this.runs.length >= 500) {
      const obsolete = this.runs.findIndex(
        (run, index) =>
          run.ok === true &&
          this.runs
            .slice(index + 1)
            .some(
              (later) =>
                later.targetOrigin === run.targetOrigin &&
                (run.kind !== "initialize" || later.kind === "initialize"),
            ),
      );
      if (obsolete >= 0) this.runs.splice(obsolete, 1);
    }
    if (!retry && this.runs.length >= 500)
      throw new Error(
        "Deployment journal is full; archive completed receipts before provisioning.",
      );
    const now = Date.now();
    const run: DeploymentRun = retry ?? {
      kind: plan.kind,
      targetOrigin: plan.targetOrigin,
      identity: copyIdentity(plan.identity),
      runId: `deploy_${randomUUID()}`,
      label:
        plan.kind === "initialize" ? `Initialize ${plan.identity?.websiteKey}` : "Site deployment",
      startedAt: now,
      finishedAt: null,
      phase: "environment",
      ok: null,
      error: null,
      attempt: 0,
      receipts: [],
      connectionId: null,
      childPid: null,
      log: [],
    };
    run.attempt += 1;
    run.finishedAt = null;
    run.phase = "environment";
    run.ok = null;
    run.error = null;
    run.log = [];
    if (!retry) this.runs.push(run);
    this.persist();
    return run;
  }

  process(runId: string, childPid: number | null): void {
    this.require(runId).childPid = childPid;
    this.persist();
  }

  checkpoint(runId: string, phase: DeploymentPhase, status: "started" | "completed") {
    const run = this.require(runId);
    run.phase = phase;
    run.receipts.push({ phase, status, at: Date.now(), attempt: run.attempt });
    if (run.receipts.length > 200) run.receipts.splice(0, run.receipts.length - 200);
    this.persist();
  }

  recordMediaIndex(runId: string, progress: MediaIndexProgress | null): void {
    this.require(runId).mediaIndex = progress === null ? null : parseMediaIndexProgress(progress);
    this.persist();
  }

  finish(runId: string, ok: boolean, connectionId: string | null = null): void {
    const run = this.require(runId);
    run.ok = ok;
    run.phase = ok ? "complete" : "failed";
    run.finishedAt = Date.now();
    run.connectionId = connectionId;
    run.error = ok
      ? null
      : "Deployment did not finish. Retry with fresh credentials to reconcile its recorded phases.";
    this.persist();
  }

  status(targetOrigin?: string): DeploymentRun | null {
    const run = [...this.runs]
      .reverse()
      .find((entry) => !targetOrigin || entry.targetOrigin === targetOrigin);
    return run ? { ...run, receipts: [...run.receipts], log: run.log.slice(-60) } : null;
  }

  history(): DeploymentRun[] {
    return this.runs
      .slice(-100)
      .reverse()
      .map((run) => ({ ...run, receipts: [...run.receipts], log: [] }));
  }

  private require(runId: string): DeploymentRun {
    const run = this.runs.find((entry) => entry.runId === runId);
    if (!run) throw new Error("Deployment run not found");
    return run;
  }

  private persist(): void {
    mkdirSync(path.dirname(this.file), { recursive: true, mode: 0o700 });
    const temp = `${this.file}.${randomUUID()}.tmp`;
    const runs = this.runs.map((run) => ({
      kind: run.kind,
      targetOrigin: run.targetOrigin,
      identity: copyIdentity(run.identity),
      runId: run.runId,
      label: run.label,
      startedAt: run.startedAt,
      finishedAt: run.finishedAt,
      phase: run.phase,
      ok: run.ok,
      error: run.error === null ? null : "Deployment requires reconciliation.",
      attempt: run.attempt,
      receipts: run.receipts,
      connectionId: run.connectionId,
      childPid: run.childPid,
      ...(run.mediaIndex === undefined ? {} : { mediaIndex: run.mediaIndex }),
    }));
    let descriptor: number | undefined;
    try {
      descriptor = openSync(temp, "wx", 0o600);
      writeFileSync(descriptor, JSON.stringify({ version: 1, runs }));
      fsyncSync(descriptor);
      closeSync(descriptor);
      descriptor = undefined;
      renameSync(temp, this.file);
    } finally {
      if (descriptor !== undefined) closeSync(descriptor);
      if (existsSync(temp)) unlinkSync(temp);
    }
  }
}
