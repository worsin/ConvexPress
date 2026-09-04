/**
 * InitializeDeploymentPanel — the "this deployment is empty" path.
 *
 * A brand-new Convex deployment (cloud project or self-hosted backend) has no
 * ConvexPress code, no site identity and no roles, so the controller's health
 * probe fails and "Connect" cannot succeed. The desktop app can do all of it
 * with the admin key entered once in the protected window: write the auth
 * environment, deploy the backend, configure identity, seed roles, verify the
 * health endpoint, and enroll the controller connection.
 *
 * Shared by the Add Website flow and the Connect dialog on an environment.
 */

import { CheckCircle2, Loader2, Rocket, XCircle } from "lucide-react";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { useControlShell } from "@/control/ControlShellContext";
import { getElectronBridge, type SiteDeployProgress, type SiteInitializeRequest } from "@/lib/electron";
import { cn } from "@/lib/utils";

import { Notice } from "../forms";
import { friendlyError } from "../useWorkspaceActions";

export interface InitializeTarget {
  instanceId: string;
  websiteKey: string;
  instanceKey: string;
  environmentKind: SiteInitializeRequest["environmentKind"];
  deploymentOrigin: string;
  managementOrigin: string;
  siteOrigin: string;
  siteTitle: string;
}

export function canInitializeDeployments(): boolean {
  return Boolean(getElectronBridge()?.siteDeploy?.initialize);
}

export function InitializeDeploymentPanel({
  target,
  connectionName,
  accountLabel,
  disabled,
  onDone,
  onRunningChange,
}: {
  target: InitializeTarget;
  connectionName: string;
  accountLabel: string;
  disabled?: boolean;
  onDone: (result: { connectionId: string | null }) => void;
  /** Lets the host dialog lock its own footer while the install runs. */
  onRunningChange?: (running: boolean) => void;
}) {
  const shell = useControlShell();
  const [running, setRunning] = useState(false);
  const [log, setLog] = useState<SiteDeployProgress[]>([]);
  const [phase, setPhase] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const bridge = getElectronBridge();

  useEffect(() => {
    onRunningChange?.(running);
  }, [running, onRunningChange]);

  useEffect(() => {
    if (!bridge?.siteDeploy) return;
    return bridge.siteDeploy.onProgress((event) => {
      setLog((current) => [...current.slice(-80), event]);
      setPhase(event.phase);
    });
  }, [bridge]);

  const start = async () => {
    if (!bridge?.siteDeploy?.initialize || !shell) return;
    setError(null);
    setLog([]);
    setPhase("environment");
    setRunning(true);
    try {
      const authToken = await shell.getControlToken();
      if (!authToken) throw new Error("Your protected operator session must be refreshed before connecting.");
      const result = await bridge.siteDeploy.initialize({
        ...target,
        connectionName: connectionName.trim() || "Standalone ConvexPress controller",
        ...(accountLabel.trim() ? { accountLabel: accountLabel.trim() } : {}),
        authToken,
        adminOrigins: typeof window !== "undefined" ? [window.location.origin] : [],
      });
      if (result.cancelled) {
        setPhase(null);
        return;
      }
      if (!result.ok) throw new Error(result.error ?? "Initialization failed.");
      onDone({ connectionId: result.connectionId });
    } catch (cause) {
      setPhase("failed");
      setError(friendlyError(cause));
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="space-y-3">
      {error && <Notice tone="error">{error}</Notice>}
      <div className="flex flex-wrap items-center gap-3">
        <Button type="button" onClick={start} disabled={disabled || running || !canInitializeDeployments()}>
          {running ? (
            <Loader2 data-icon="inline-start" className="animate-spin" aria-hidden="true" />
          ) : (
            <Rocket data-icon="inline-start" aria-hidden="true" />
          )}
          Install ConvexPress and connect
        </Button>
        <span className="text-[12.5px] text-muted-foreground">
          Env, deploy, identity, roles, health check, connection. A few minutes.
        </span>
      </div>
      {log.length > 0 && (
        <div className="rounded-lg border border-border bg-surface-2/60 p-3">
          <div className="mb-2 flex items-center gap-2 text-[12px] font-medium">
            {phase === "complete" ? (
              <CheckCircle2 className="size-3.5 text-success" aria-hidden="true" />
            ) : phase === "failed" ? (
              <XCircle className="size-3.5 text-destructive" aria-hidden="true" />
            ) : (
              <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
            )}
            {phase === "complete" ? "Done" : phase === "failed" ? "Failed" : `Working: ${phase}`}
          </div>
          <ol
            className={cn(
              "max-h-44 min-w-0 space-y-0.5 overflow-y-auto overflow-x-hidden font-mono text-[11px] leading-relaxed text-ink-2",
            )}
            aria-label="Install log"
          >
            {log.map((entry, index) => (
              <li key={`${entry.at}-${index}`} className="grid grid-cols-[92px_minmax(0,1fr)] gap-2">
                <span className="truncate text-muted-foreground">{entry.phase}</span>
                <span className="min-w-0 break-words [overflow-wrap:anywhere]">{entry.message}</span>
              </li>
            ))}
          </ol>
        </div>
      )}
    </div>
  );
}
