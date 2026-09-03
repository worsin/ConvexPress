import { api as controlApi } from "@control/convex/_generated/api";
import type { Id } from "@control/convex/_generated/dataModel";
import { useMutation, useQuery } from "convex/react";
import {
  Archive,
  Check,
  CircleAlert,
  Clock3,
  DatabaseBackup,
  FileWarning,
  GitBranch,
  Loader2,
  Rocket,
  RotateCcw,
  Square,
  X,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  canCancelOperation,
  canResumeOperation,
  formatByteCount,
  expectedRestoreConfirmation,
  expectedPromotionConfirmation,
  isPromotionConfirmationReady,
  isRestoreConfirmationReady,
  operationProgress,
  operationStateLabel,
  type LifecycleOperationState,
} from "./lifecycle-view";

type InstanceId = Id<"overseer_websiteInstances">;
type OperationId = Id<"overseer_siteOperations">;

export function LifecyclePanel({
  open,
  instance,
  environments,
  onClose,
  onEnvironmentReplaced,
}: {
  open: boolean;
  instance: {
    instanceId: InstanceId;
    instanceKey: string;
    kind: string;
    label: string | null;
  } | null;
  environments: Array<{
    instanceId: InstanceId;
    instanceKey: string;
    kind: string;
    label: string | null;
  }>;
  onClose: () => void;
  onEnvironmentReplaced: () => void;
}) {
  const operations = useQuery(
    controlApi.operations.queries.listForInstance,
    open && instance ? { instanceId: instance.instanceId, limit: 25 } : "skip",
  );
  const backups = useQuery(
    controlApi.operations.queries.listBackupsForInstance,
    open && instance ? { instanceId: instance.instanceId, limit: 25 } : "skip",
  );
  const websiteBackups = useQuery(
    controlApi.operations.queries.listBackupsForWebsite,
    open && instance
      ? { targetInstanceId: instance.instanceId, limit: 100 }
      : "skip",
  );
  const startBackup = useMutation(controlApi.operations.mutations.startBackup);
  const startClone = useMutation(controlApi.operations.mutations.startClone);
  const startPromotion = useMutation(
    controlApi.operations.mutations.startPromotion,
  );
  const startRestore = useMutation(controlApi.operations.mutations.startRestore);
  const cancelOperation = useMutation(
    controlApi.operations.mutations.cancelOperation,
  );
  const resumeOperation = useMutation(
    controlApi.operations.mutations.resumeOperation,
  );

  const [selectedOperationId, setSelectedOperationId] =
    useState<OperationId | null>(null);
  const [submitting, setSubmitting] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [confirmCancelId, setConfirmCancelId] =
    useState<OperationId | null>(null);
  const [selectedSnapshotId, setSelectedSnapshotId] = useState("");
  const [restoreConfirmation, setRestoreConfirmation] = useState("");
  const [sourceInstanceId, setSourceInstanceId] = useState("");
  const [promotionConfirmation, setPromotionConfirmation] = useState("");
  const pendingBackupKey = useRef<string | null>(null);
  const refreshedOperation = useRef<string | null>(null);

  useEffect(() => {
    setSelectedOperationId(null);
    setActionError(null);
    setConfirmCancelId(null);
    setSelectedSnapshotId("");
    setRestoreConfirmation("");
    setSourceInstanceId("");
    setPromotionConfirmation("");
    pendingBackupKey.current = null;
    refreshedOperation.current = null;
  }, [instance?.instanceId]);

  const effectiveOperationId = selectedOperationId ?? operations?.[0]?.operationId;
  const detail = useQuery(
    controlApi.operations.queries.get,
    open && effectiveOperationId
      ? { operationId: effectiveOperationId }
      : "skip",
  );
  const blockingOperation = operations?.find((operation) =>
    ["queued", "running", "waiting", "resuming", "interrupted"].includes(
      operation.state,
    ),
  );
  const progress = operationProgress(detail?.steps ?? []);
  const latestReceipt = detail?.receipts.at(-1) ?? null;
  const receiptSummary = useMemo(
    () => safeReceiptSummary(latestReceipt?.summaryJson ?? null),
    [latestReceipt?.summaryJson],
  );

  useEffect(() => {
    if (!detail) return;
    if (
      ["site.clone", "site.promote", "site.restore"].includes(
        detail.operation.operationCode,
      ) &&
      detail.operation.state === "succeeded" &&
      refreshedOperation.current !== String(detail.operation.operationId)
    ) {
      refreshedOperation.current = String(detail.operation.operationId);
      onEnvironmentReplaced();
    }
  }, [detail, onEnvironmentReplaced]);

  if (!open) return null;

  const runAction = async (label: string, work: () => Promise<unknown>) => {
    setSubmitting(label);
    setActionError(null);
    try {
      await work();
    } catch (error) {
      setActionError(friendlyLifecycleError(error));
    } finally {
      setSubmitting(null);
    }
  };

  const createBackup = () => {
    if (!instance) return;
    const idempotencyKey =
      pendingBackupKey.current ??
      `desktop-backup-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`;
    pendingBackupKey.current = idempotencyKey;
    void runAction("backup", async () => {
      const result = await startBackup({
        instanceId: instance.instanceId,
        idempotencyKey,
        includeStorage: true,
        provider: "manual",
      });
      pendingBackupKey.current = null;
      setSelectedOperationId(result.operationId);
    });
  };

  const restoreSnapshot = () => {
    if (!instance || !selectedSnapshotId) return;
    const idempotencyKey = `desktop-restore-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`;
    void runAction("restore", async () => {
      const result = await startRestore({
        instanceId: instance.instanceId,
        snapshotId: selectedSnapshotId,
        confirmation: restoreConfirmation,
        idempotencyKey,
        provider: "manual",
      });
      setSelectedOperationId(result.operationId);
      setRestoreConfirmation("");
    });
  };

  const cloneEnvironment = () => {
    if (!instance || !sourceInstanceId) return;
    const idempotencyKey = `desktop-clone-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`;
    void runAction("clone", async () => {
      const result = await startClone({
        instanceId: instance.instanceId,
        sourceInstanceId: sourceInstanceId as InstanceId,
        idempotencyKey,
        provider: "manual",
      });
      setSelectedOperationId(result.operationId);
    });
  };

  const promoteEnvironment = () => {
    if (!instance || !sourceInstanceId) return;
    const idempotencyKey = `desktop-promote-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`;
    void runAction("promote", async () => {
      const result = await startPromotion({
        instanceId: instance.instanceId,
        sourceInstanceId: sourceInstanceId as InstanceId,
        confirmation: promotionConfirmation,
        idempotencyKey,
        provider: "manual",
      });
      setSelectedOperationId(result.operationId);
      setPromotionConfirmation("");
    });
  };

  return (
    <aside
      aria-label="Site operations"
      className="absolute inset-y-0 right-0 z-[80] flex w-full max-w-[34rem] flex-col border-l border-slate-300 bg-[#f8fafc] shadow-2xl sm:w-[34rem]"
    >
      <div className="flex shrink-0 items-start justify-between gap-4 border-b border-slate-200 bg-white px-5 py-4">
        <div>
          <p className="text-[10px] font-extrabold uppercase tracking-[0.18em] text-blue-700">
            Isolated environment
          </p>
          <h2 className="mt-1 font-serif text-2xl tracking-tight">Site operations</h2>
          <p className="mt-1 break-all font-mono text-[11px] text-slate-500">
            {instance?.instanceKey ?? "No environment selected"}
          </p>
        </div>
        <Button
          aria-label="Close site operations"
          size="icon"
          variant="ghost"
          onClick={onClose}
        >
          <X className="size-4" />
        </Button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {actionError ? (
          <p role="alert" className="m-5 border border-red-200 bg-red-50 p-3 text-sm text-red-900">
            {actionError}
          </p>
        ) : null}
        <section aria-labelledby="backup-heading" className="border-b border-slate-200 bg-white p-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h3 id="backup-heading" className="font-semibold text-slate-950">
                Full site backup
              </h3>
              <p className="mt-1 text-sm leading-5 text-slate-600">
                Exports every site table and stored file from this database, then verifies the snapshot before recording it.
              </p>
            </div>
            <DatabaseBackup className="mt-0.5 size-5 shrink-0 text-blue-700" />
          </div>
          {blockingOperation ? (
            <p className="mt-4 border-l-4 border-amber-500 bg-amber-50 px-3 py-2 text-xs text-amber-950">
              {blockingOperation.state === "interrupted"
                ? "An interrupted operation must be resumed before another operation can start."
                : "Another operation currently owns this environment's exclusive lock."}
            </p>
          ) : null}
          <Button
            className="mt-4 w-full bg-blue-700 text-white hover:bg-blue-800"
            disabled={!instance || Boolean(blockingOperation) || submitting !== null}
            onClick={createBackup}
          >
            {submitting === "backup" ? (
              <Loader2 className="mr-2 size-4 animate-spin" />
            ) : (
              <Archive className="mr-2 size-4" />
            )}
            Create full backup
          </Button>
        </section>

        <section aria-labelledby="copy-heading" className="border-b border-slate-200 bg-white p-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h3 id="copy-heading" className="font-semibold text-slate-950">
                {instance?.kind === "live"
                  ? "Promote into live"
                  : "Clone into this environment"}
              </h3>
              <p className="mt-1 text-sm leading-5 text-slate-600">
                Copies a sibling environment from this website into the selected database. A verified target backup is created first, while this environment keeps its own identity and management authorities.
              </p>
            </div>
            {instance?.kind === "live" ? (
              <Rocket className="mt-0.5 size-5 shrink-0 text-red-700" />
            ) : (
              <GitBranch className="mt-0.5 size-5 shrink-0 text-blue-700" />
            )}
          </div>
          {instance?.kind === "live" ? (
            <p className="mt-4 border-l-4 border-red-600 bg-red-50 px-3 py-2 text-xs font-semibold text-red-950">
              Live promotion. Separate production authority and exact confirmation are enforced by the backend.
            </p>
          ) : null}
          <label className="mt-4 block text-xs font-bold uppercase tracking-[0.12em] text-slate-600" htmlFor="copy-source-environment">
            Source environment
          </label>
          <select
            id="copy-source-environment"
            className="mt-2 w-full border border-slate-300 bg-white px-3 py-2.5 text-sm outline-none focus:border-blue-700 focus:ring-2 focus:ring-blue-200"
            value={sourceInstanceId}
            onChange={(event) => {
              setSourceInstanceId(event.target.value);
              setPromotionConfirmation("");
              setActionError(null);
            }}
          >
            <option value="">Choose a different environment</option>
            {environments
              .filter(
                (environment) =>
                  environment.instanceId !== instance?.instanceId,
              )
              .map((environment) => (
                <option
                  key={environment.instanceId}
                  value={environment.instanceId}
                >
                  {environment.label || environment.kind} · {environment.instanceKey}
                </option>
              ))}
          </select>
          {sourceInstanceId && instance?.kind === "live" ? (
            <>
              <label className="mt-4 block text-xs font-bold uppercase tracking-[0.12em] text-slate-600" htmlFor="promotion-confirmation">
                Type <code className="normal-case text-red-700">{expectedPromotionConfirmation(instance.instanceKey)}</code>
              </label>
              <input
                id="promotion-confirmation"
                autoComplete="off"
                className="mt-2 w-full border border-slate-300 bg-white px-3 py-2.5 font-mono text-sm outline-none focus:border-red-700 focus:ring-2 focus:ring-red-200"
                spellCheck={false}
                value={promotionConfirmation}
                onChange={(event) => setPromotionConfirmation(event.target.value)}
              />
            </>
          ) : null}
          <Button
            className={`mt-4 w-full text-white ${
              instance?.kind === "live"
                ? "bg-red-700 hover:bg-red-800"
                : "bg-blue-700 hover:bg-blue-800"
            }`}
            disabled={
              !instance ||
              !sourceInstanceId ||
              (instance.kind === "live" &&
                !isPromotionConfirmationReady(
                  instance.instanceKey,
                  promotionConfirmation,
                )) ||
              Boolean(blockingOperation) ||
              submitting !== null
            }
            onClick={
              instance?.kind === "live"
                ? promoteEnvironment
                : cloneEnvironment
            }
          >
            {submitting === "clone" || submitting === "promote" ? (
              <Loader2 className="mr-2 size-4 animate-spin" />
            ) : instance?.kind === "live" ? (
              <Rocket className="mr-2 size-4" />
            ) : (
              <GitBranch className="mr-2 size-4" />
            )}
            {instance?.kind === "live"
              ? "Create pre-backup and promote"
              : "Create pre-backup and clone"}
          </Button>
        </section>

        <section aria-labelledby="restore-heading" className="border-b border-slate-200 bg-white p-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h3 id="restore-heading" className="font-semibold text-slate-950">
                Restore verified snapshot
              </h3>
              <p className="mt-1 text-sm leading-5 text-slate-600">
                Creates and verifies a fresh target backup before replacing this database. Target identity and management authorities stay bound to this environment.
              </p>
            </div>
            <FileWarning className="mt-0.5 size-5 shrink-0 text-red-700" />
          </div>
          {instance?.kind === "live" ? (
            <p className="mt-4 border-l-4 border-red-600 bg-red-50 px-3 py-2 text-xs font-semibold text-red-950">
              Live target. Separate production authority is required by the backend.
            </p>
          ) : null}
          <label className="mt-4 block text-xs font-bold uppercase tracking-[0.12em] text-slate-600" htmlFor="restore-snapshot">
            Verified snapshot
          </label>
          <select
            id="restore-snapshot"
            className="mt-2 w-full border border-slate-300 bg-white px-3 py-2.5 text-sm outline-none focus:border-blue-700 focus:ring-2 focus:ring-blue-200"
            value={selectedSnapshotId}
            onChange={(event) => {
              setSelectedSnapshotId(event.target.value);
              setRestoreConfirmation("");
              setActionError(null);
            }}
          >
            <option value="">Choose a verified snapshot</option>
            {websiteBackups?.map((backup) => (
              <option key={backup.backupId} value={backup.snapshotId}>
                {backup.environmentKind} · {backup.purpose} · {formatTimestamp(backup.createdAt)} · {backup.tableCount} tables
              </option>
            ))}
          </select>
          {selectedSnapshotId && instance ? (
            <>
              <label className="mt-4 block text-xs font-bold uppercase tracking-[0.12em] text-slate-600" htmlFor="restore-confirmation">
                Type <code className="normal-case text-red-700">{expectedRestoreConfirmation(instance.instanceKey)}</code>
              </label>
              <input
                id="restore-confirmation"
                autoComplete="off"
                className="mt-2 w-full border border-slate-300 bg-white px-3 py-2.5 font-mono text-sm outline-none focus:border-red-700 focus:ring-2 focus:ring-red-200"
                spellCheck={false}
                value={restoreConfirmation}
                onChange={(event) => setRestoreConfirmation(event.target.value)}
              />
            </>
          ) : null}
          <Button
            className="mt-4 w-full bg-red-700 text-white hover:bg-red-800"
            disabled={
              !instance ||
              !selectedSnapshotId ||
              !isRestoreConfirmationReady(
                instance?.instanceKey ?? "",
                restoreConfirmation,
              ) ||
              Boolean(blockingOperation) ||
              submitting !== null
            }
            onClick={restoreSnapshot}
          >
            {submitting === "restore" ? <Loader2 className="mr-2 size-4 animate-spin" /> : <RotateCcw className="mr-2 size-4" />}
            Create pre-backup and restore
          </Button>
        </section>

        <section aria-labelledby="current-operation-heading" className="border-b border-slate-200 p-5">
          <div className="flex items-center justify-between gap-3">
            <h3 id="current-operation-heading" className="font-semibold">
              Operation detail
            </h3>
            {detail ? (
              <StateBadge state={detail.operation.state as LifecycleOperationState} />
            ) : null}
          </div>
          {operations === undefined || (effectiveOperationId && detail === undefined) ? (
            <p className="mt-4 inline-flex items-center gap-2 text-sm text-slate-500">
              <Loader2 className="size-4 animate-spin" /> Loading operation history
            </p>
          ) : !detail ? (
            <p className="mt-4 text-sm text-slate-500">No lifecycle operations have run for this environment.</p>
          ) : (
            <div className="mt-4 space-y-4">
              <div>
                <div className="flex justify-between text-xs font-semibold text-slate-600">
                  <span>{detail.operation.operationCode}</span>
                  <span>{progress.completed} of {progress.total} steps</span>
                </div>
                <div
                  aria-label={`Operation progress: ${progress.percent}%`}
                  className="mt-2 h-2 overflow-hidden bg-slate-200"
                  role="progressbar"
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={progress.percent}
                >
                  <div className="h-full bg-blue-700 transition-[width] duration-300" style={{ width: `${progress.percent}%` }} />
                </div>
              </div>
              <ol className="space-y-2" aria-label="Durable operation checkpoints">
                {detail.steps.map((step) => (
                  <li key={step.stepId} className="flex items-center gap-3 bg-white px-3 py-2 text-xs shadow-sm ring-1 ring-slate-200">
                    <StepIcon state={step.state} />
                    <span className="min-w-0 flex-1 truncate font-mono">{step.stepKey}</span>
                    <span className="shrink-0 capitalize text-slate-500">{step.state}</span>
                  </li>
                ))}
              </ol>
              {detail.operation.failureMessage ? (
                <p role="alert" className="border-l-4 border-red-600 bg-red-50 p-3 text-sm text-red-900">
                  {detail.operation.failureMessage}
                </p>
              ) : null}
              {canResumeOperation(detail.operation.state as LifecycleOperationState) ? (
                <Button
                  className="w-full"
                  disabled={submitting !== null}
                  onClick={() =>
                    void runAction("resume", () =>
                      resumeOperation({ operationId: detail.operation.operationId }),
                    )
                  }
                >
                  {submitting === "resume" ? <Loader2 className="mr-2 size-4 animate-spin" /> : <RotateCcw className="mr-2 size-4" />}
                  Resume from {detail.operation.currentStep ?? "checkpoint"}
                </Button>
              ) : null}
              {canCancelOperation(detail.operation.state as LifecycleOperationState) ? (
                confirmCancelId === detail.operation.operationId ? (
                  <div role="group" aria-label="Confirm operation cancellation" className="border border-red-200 bg-red-50 p-3">
                    <p className="text-sm font-semibold text-red-950">Cancel this operation?</p>
                    <p className="mt-1 text-xs leading-5 text-red-800">The last durable checkpoint is preserved. A completed snapshot is never deleted.</p>
                    <div className="mt-3 flex gap-2">
                      <Button size="sm" variant="outline" onClick={() => setConfirmCancelId(null)}>Keep running</Button>
                      <Button
                        size="sm"
                        className="bg-red-700 text-white hover:bg-red-800"
                        disabled={submitting !== null}
                        onClick={() =>
                          void runAction("cancel", async () => {
                            await cancelOperation({ operationId: detail.operation.operationId });
                            setConfirmCancelId(null);
                          })
                        }
                      >
                        Confirm cancel
                      </Button>
                    </div>
                  </div>
                ) : (
                  <Button
                    className="w-full"
                    variant="outline"
                    onClick={() => setConfirmCancelId(detail.operation.operationId)}
                  >
                    <Square className="mr-2 size-3.5" /> Cancel operation
                  </Button>
                )
              ) : null}
              {latestReceipt ? (
                <div className="border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-950">
                  <p className="font-bold uppercase tracking-[0.12em]">Immutable receipt</p>
                  <p className="mt-2 font-mono">{latestReceipt.receiptId}</p>
                  {typeof receiptSummary?.checksumSha256 === "string" || typeof receiptSummary?.preparedChecksumSha256 === "string" ? (
                    <p className="mt-2 inline-flex items-center gap-1 font-semibold"><Check className="size-3.5" /> Snapshot checksum verified</p>
                  ) : null}
                </div>
              ) : null}
            </div>
          )}
        </section>

        <section aria-labelledby="backup-history-heading" className="border-b border-slate-200 bg-white p-5">
          <h3 id="backup-history-heading" className="font-semibold">Verified backups</h3>
          {backups === undefined ? (
            <p className="mt-3 text-sm text-slate-500">Loading backups</p>
          ) : backups.length === 0 ? (
            <p className="mt-3 text-sm text-slate-500">No verified backups yet.</p>
          ) : (
            <ul className="mt-3 space-y-2">
              {backups.map((backup) => (
                <li key={backup.backupId} className="border border-slate-200 p-3 text-xs">
                  <div className="flex items-center justify-between gap-3">
                    <span className="font-semibold">{formatTimestamp(backup.createdAt)}</span>
                    <span className="inline-flex items-center gap-1 font-semibold text-emerald-700"><Check className="size-3.5" /> {backup.verificationStatus}</span>
                  </div>
                  <p className="mt-2 font-mono text-[10px] text-slate-500">{backup.snapshotId}</p>
                  <p className="mt-2 text-slate-600">{backup.tableCount} tables · {backup.storageObjectCount} stored files · {formatByteCount(backup.sizeBytes)}</p>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section aria-labelledby="operation-history-heading" className="p-5">
          <h3 id="operation-history-heading" className="font-semibold">Operation history</h3>
          {operations && operations.length > 0 ? (
            <ul className="mt-3 space-y-2">
              {operations.map((operation) => (
                <li key={operation.operationId}>
                  <button
                    className={`w-full border p-3 text-left text-xs transition-colors ${
                      effectiveOperationId === operation.operationId
                        ? "border-blue-600 bg-blue-50"
                        : "border-slate-200 bg-white hover:border-slate-400"
                    }`}
                    onClick={() => setSelectedOperationId(operation.operationId)}
                  >
                    <span className="flex items-center justify-between gap-3">
                      <span className="font-semibold">{operation.operationCode}</span>
                      <StateBadge state={operation.state as LifecycleOperationState} />
                    </span>
                    <span className="mt-2 block text-slate-500">{formatTimestamp(operation.createdAt)}</span>
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
        </section>
      </div>
    </aside>
  );
}

function StateBadge({ state }: { state: LifecycleOperationState }) {
  const palette =
    state === "succeeded"
      ? "bg-emerald-100 text-emerald-800"
      : state === "failed" || state === "cancelled"
        ? "bg-red-100 text-red-800"
        : state === "interrupted"
          ? "bg-amber-100 text-amber-900"
          : "bg-blue-100 text-blue-800";
  return (
    <span className={`inline-flex shrink-0 items-center px-2 py-1 text-[10px] font-bold uppercase tracking-[0.1em] ${palette}`}>
      {operationStateLabel(state)}
    </span>
  );
}

function StepIcon({ state }: { state: string }) {
  if (state === "succeeded") return <Check aria-hidden="true" className="size-4 shrink-0 text-emerald-600" />;
  if (state === "running") return <Loader2 aria-hidden="true" className="size-4 shrink-0 animate-spin text-blue-700" />;
  if (state === "failed") return <CircleAlert aria-hidden="true" className="size-4 shrink-0 text-red-700" />;
  return <Clock3 aria-hidden="true" className="size-4 shrink-0 text-slate-400" />;
}

function formatTimestamp(value: number) {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function safeReceiptSummary(value: string | null): Record<string, unknown> | null {
  if (!value) return null;
  try {
    const parsed: unknown = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

function friendlyLifecycleError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  if (message.includes("CONTROL_PLANE_ACCESS_DENIED") || message.includes("not authorized")) {
    return "Your operator account is not authorized to perform this operation.";
  }
  if (message.includes("exclusive lifecycle operation")) {
    return "Another operation already owns this environment. Wait for it to finish or resume the interrupted operation.";
  }
  if (message.includes("stale")) {
    return "The environment changed before the operation started. Review the selected target and try again.";
  }
  return "The operation could not be started. The target was not changed.";
}
