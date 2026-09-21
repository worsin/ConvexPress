import { api } from "@control/convex/_generated/api";
import type { Id } from "@control/convex/_generated/dataModel";
import { useAction, useQuery } from "convex/react";
import { useEffect, useId, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function DeploymentCredentialRecovery({ instanceId }: { instanceId: string }) {
  const target = { instanceId: instanceId as Id<"overseer_websiteInstances"> };
  const status = useQuery(api.hosting.deploymentCredentials.recoveryStatus, target);
  const recover = useAction(api.hosting.deploy.recoverCredential);
  const fieldId = useId();
  const [confirmation, setConfirmation] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!status) return;
    const timer = setInterval(() => setNow(Date.now()), 10_000);
    return () => clearInterval(timer);
  }, [status?.eligibleAt]);
  if (!status)
    return message ? (
      <p role="status" className="text-sm">
        {message}
      </p>
    ) : null;
  const eligible = now >= status.eligibleAt;
  return (
    <form
      className="space-y-2 rounded-md border border-amber-500/40 p-3"
      onSubmit={async (event) => {
        event.preventDefault();
        setBusy(true);
        setError(null);
        try {
          await recover({
            ...target,
            credentialId: status.credentialId,
            confirmationDeploymentName: confirmation,
          });
          setConfirmation("");
          setMessage(
            "Credential recovery completed. Retry initialization to create a replacement key.",
          );
        } catch (cause) {
          setError(
            cause instanceof Error ? cause.message : "Credential recovery could not be confirmed.",
          );
        } finally {
          setBusy(false);
        }
      }}
    >
      <p className="text-sm font-medium">Deployment credential needs recovery</p>
      <p className="text-sm text-muted-foreground">
        The previous key request could not be confirmed. Recovery checks this environment and
        revokes only the orphan key named for that request, then enables a fresh initialization
        attempt. It does not change other deployment keys.
      </p>
      {!eligible && (
        <p role="status" className="text-sm">
          Recovery becomes available at {new Date(status.eligibleAt).toLocaleTimeString()}. This
          wait protects an initialization request that may still be running.
        </p>
      )}
      <label htmlFor={fieldId} className="block text-sm">
        Type {status.deploymentName} to confirm recovery
      </label>
      <Input
        id={fieldId}
        value={confirmation}
        onChange={(event) => setConfirmation(event.target.value)}
        autoComplete="off"
        disabled={busy}
      />
      <Button
        type="submit"
        variant="outline"
        disabled={busy || !eligible || confirmation !== status.deploymentName}
      >
        {busy ? "Checking deployment key…" : "Recover deployment credential"}
      </Button>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </form>
  );
}
