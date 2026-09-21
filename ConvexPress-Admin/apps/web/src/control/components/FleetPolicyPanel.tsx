import { api as controlApi } from "@control/convex/_generated/api";
import type { Id } from "@control/convex/_generated/dataModel";
import { useMutation, usePaginatedQuery, useQuery } from "convex/react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";

const messages: Record<string, string> = {
  POLICY_SAVED: "Maintenance settings saved",
  POLICY_REMOVED: "Maintenance disabled",
  POLICY_AUTHORIZATION_LOST:
    "Maintenance paused: operator access or environment availability changed",
  POLICY_AUTHORIZED: "Maintenance authorization restored",
  SCHEDULED_BACKUP_QUEUED: "Scheduled backup queued",
  SCHEDULED_BACKUP_FAILED: "Scheduled backup needs attention",
  SCHEDULED_BACKUP_RECOVERED: "Scheduled backups recovered",
  SCHEDULED_BACKUP_TARGET_BUSY: "Backup deferred while another operation is active",
  SCHEDULED_BACKUP_TARGET_READY: "Environment is ready for scheduled backups",
  FLEET_HEALTH_FAILED: "The site health check failed",
  FLEET_HEALTH_RECOVERED: "Site health recovered",
  SCHEDULED_BACKUP_EXPIRED: "An expired scheduled backup was removed",
};
const defaults = {
  backupEnabled: false,
  backupIntervalHours: 24,
  healthEnabled: false,
  healthIntervalMinutes: 5,
  retentionEnabled: false,
  retentionDays: 30,
  keepBackups: 7,
};
export function FleetPolicyPanel({ instanceId }: { instanceId: Id<"overseer_websiteInstances"> }) {
  const data = useQuery(controlApi.fleet.queries.get, { instanceId });
  const events = usePaginatedQuery(
    controlApi.fleet.queries.history,
    data === undefined ? "skip" : { instanceId },
    { initialNumItems: 10 },
  );
  const save = useMutation(controlApi.fleet.mutations.save);
  const remove = useMutation(controlApi.fleet.mutations.remove);
  const acknowledge = useMutation(controlApi.fleet.mutations.acknowledge);
  const [form, setForm] = useState(defaults);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const revision = data?.policy?.revision;
  useEffect(() => {
    const p = data?.policy;
    setForm(
      p
        ? {
            backupEnabled: p.backupEnabled,
            backupIntervalHours: p.backupIntervalHours,
            healthEnabled: p.healthEnabled,
            healthIntervalMinutes: p.healthIntervalMinutes,
            retentionEnabled: p.retentionEnabled,
            retentionDays: p.retentionDays,
            keepBackups: p.keepBackups,
          }
        : defaults,
    );
    setError(null);
  }, [instanceId, revision]);
  const run = async (work: () => Promise<unknown>) => {
    setBusy(true);
    setError(null);
    try {
      await work();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Maintenance settings could not be saved");
    } finally {
      setBusy(false);
    }
  };
  const numberField = (
    key: "backupIntervalHours" | "healthIntervalMinutes" | "retentionDays" | "keepBackups",
    label: string,
    min: number,
    max: number,
  ) => (
    <label className="grid gap-1 text-xs">
      {label}
      <input
        type="number"
        min={min}
        max={max}
        value={form[key]}
        onChange={(event) => setForm({ ...form, [key]: Number(event.target.value) })}
        className="w-full rounded border border-border bg-background px-2 py-1.5"
      />
    </label>
  );
  return (
    <section className="border-b border-border bg-card p-5" aria-labelledby="maintenance-heading">
      <h3 id="maintenance-heading" className="font-semibold">
        Scheduled maintenance
      </h3>
      <p className="mt-1 text-xs text-muted-foreground">
        Full backups include uploaded files. Health checks continue while the desktop app is closed.
      </p>
      {data?.policy?.pauseCode && (
        <p role="alert" className="mt-3 text-xs text-destructive">
          {messages[data.policy.pauseCode] ?? "Maintenance is paused"}. Save these settings to
          reauthorize.
        </p>
      )}
      {error && (
        <p role="alert" className="mt-3 text-xs text-destructive">
          {error}
        </p>
      )}
      <fieldset disabled={!data?.canManage || busy} className="mt-4 grid gap-3">
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={form.backupEnabled}
            onChange={(event) => setForm({ ...form, backupEnabled: event.target.checked })}
          />
          Schedule full backups
        </label>
        {form.backupEnabled && numberField("backupIntervalHours", "Hours between backups", 1, 720)}
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={form.healthEnabled}
            onChange={(event) => setForm({ ...form, healthEnabled: event.target.checked })}
          />
          Monitor site health
        </label>
        {form.healthEnabled &&
          numberField("healthIntervalMinutes", "Minutes between health checks", 5, 1440)}
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={form.retentionEnabled}
            onChange={(event) => setForm({ ...form, retentionEnabled: event.target.checked })}
          />
          Delete expired scheduled backups
        </label>
        {form.retentionEnabled && (
          <>
            <div className="grid grid-cols-2 gap-3">
              {numberField("retentionDays", "Retain for at least (days)", 1, 3650)}
              {numberField("keepBackups", "Always keep newest", 1, 100)}
            </div>
            <p className="text-xs text-muted-foreground">
              Manual backups and backups required for recovery or handoff are preserved.
            </p>
          </>
        )}
        <div className="flex gap-2">
          <Button
            type="button"
            size="sm"
            onClick={() =>
              void run(() =>
                save({ ...form, instanceId, expectedRevision: data?.policy?.revision ?? 0 }),
              )
            }
          >
            {busy ? "Saving…" : "Save maintenance"}
          </Button>
          {data?.policy?.enabled && (
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() =>
                void run(() =>
                  remove({
                    policyId: data.policy!.policyId,
                    expectedRevision: data.policy!.revision,
                  }),
                )
              }
            >
              Disable all
            </Button>
          )}
        </div>
      </fieldset>
      {data && !data.canManage && (
        <p className="mt-2 text-xs text-muted-foreground">
          Your access allows viewing these settings.
        </p>
      )}
      {data?.policy?.enabled && data.policy.backupEnabled && (
        <p className="mt-3 text-xs text-muted-foreground">
          Next scheduled backup: {new Date(data.policy.nextBackupAt).toLocaleString()}
        </p>
      )}
      {data?.policy?.lastHealthAt && (
        <p className="mt-3 text-xs text-muted-foreground">
          Last health check: {data.policy.lastHealthStatus} ·{" "}
          {new Date(data.policy.lastHealthAt).toLocaleString()}
        </p>
      )}
      {data?.policy?.lastBackupSuccessAt && (
        <p className="mt-1 text-xs text-muted-foreground">
          Last scheduled backup: {new Date(data.policy.lastBackupSuccessAt).toLocaleString()}
        </p>
      )}
      {data?.incidents.map((incident) => (
        <div
          key={incident.incidentId}
          className="mt-3 rounded border border-destructive/30 p-2 text-xs"
          role="status"
        >
          <p>{messages[incident.code] ?? "Maintenance needs attention"}</p>
          {!incident.acknowledged && data.canManage && (
            <Button
              size="sm"
              variant="ghost"
              disabled={busy}
              onClick={() => void run(() => acknowledge({ incidentId: incident.incidentId }))}
            >
              Acknowledge
            </Button>
          )}
        </div>
      ))}
      <details className="mt-4 text-xs">
        <summary className="cursor-pointer font-medium">Maintenance history</summary>
        <ol className="mt-2 space-y-2">
          {events.results.map((event) => (
            <li key={event.eventId}>
              <span className="text-muted-foreground">
                {new Date(event.createdAt).toLocaleString()}
              </span>
              <p>{messages[event.code] ?? "Maintenance event recorded"}</p>
            </li>
          ))}
        </ol>
        {events.status === "CanLoadMore" && (
          <Button size="sm" variant="ghost" onClick={() => events.loadMore(20)}>
            Load older events
          </Button>
        )}
      </details>
    </section>
  );
}
