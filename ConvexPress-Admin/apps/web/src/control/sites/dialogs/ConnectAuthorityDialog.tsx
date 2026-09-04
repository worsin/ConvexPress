/**
 * Grant this controller authority over one environment.
 *
 * The deployment admin key is entered in a separate protected Electron window
 * and never passes through this page. The result is an encrypted credential
 * envelope on the control plane plus a public-key authority on the site.
 */

import { KeyRound, Loader2, ShieldCheck } from "lucide-react";
import { useState } from "react";

import { EnvironmentChip } from "@/components/shell/EnvironmentChip";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useControlShell } from "@/control/ControlShellContext";
import { getElectronBridge } from "@/lib/electron";
import type { WorkspaceApi } from "../SitesWorkspace";
import { Notice, TextField } from "../forms";
import { findWebsite, type TreeEnvironment } from "../sites-model";
import { friendlyError } from "../useWorkspaceActions";
import { InitializeDeploymentPanel, canInitializeDeployments } from "./InitializeDeploymentPanel";

export const DEFAULT_CONNECTION_NAME = "Standalone ConvexPress controller";

export async function provisionThroughElectron(input: {
  instanceId: string;
  name: string;
  accountLabel: string;
  getControlToken: () => Promise<string | null>;
}) {
  const bridge = getElectronBridge();
  if (!bridge) {
    throw new Error("Open ConvexPress Desktop to enter a deployment credential securely.");
  }
  const authToken = await input.getControlToken();
  if (!authToken) {
    throw new Error("Your protected operator session must be refreshed before connecting.");
  }
  const result = await bridge.connections.provision({
    instanceId: input.instanceId,
    name: input.name,
    ...(input.accountLabel ? { accountLabel: input.accountLabel } : {}),
    authToken,
  });
  return result;
}

export function ConnectAuthorityDialog({
  api,
  websiteId,
  environment,
}: {
  api: WorkspaceApi;
  websiteId: string;
  environment: TreeEnvironment;
}) {
  const shell = useControlShell()!;
  const website = findWebsite(api.tree, websiteId)?.website ?? null;
  const [name, setName] = useState(DEFAULT_CONNECTION_NAME);
  const [accountLabel, setAccountLabel] = useState("");
  const [busy, setBusy] = useState(false);
  const [installing, setInstalling] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const desktop = Boolean(getElectronBridge());
  const locked = busy || installing;

  return (
    <Dialog open onOpenChange={(open) => !open && !locked && api.closeDialog()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="font-serif text-[26px] font-normal leading-none tracking-[-0.01em]">
            Connect the controller
          </DialogTitle>
          <DialogDescription className="text-[13.5px] leading-6">
            <span className="inline-flex items-center gap-2">
              <EnvironmentChip environment={environment} size="sm" />
              <span className="font-mono text-[12px]">{environment.instanceKey}</span>
            </span>
          </DialogDescription>
        </DialogHeader>
        {error && <Notice tone="error">{error}</Notice>}
        <div className="grid gap-4">
          <div className="flex gap-3 rounded-lg border border-border bg-surface-2/60 p-3.5 text-[13px] leading-5 text-ink-2">
            <ShieldCheck aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-success" />
            <span>
              The deployment admin key is requested in a separate protected window. It is used once to
              enroll this controller's public key on the site, then sealed in an encrypted envelope.
              It never enters this page or any log.
            </span>
          </div>
          <TextField label="Connection name" value={name} onChange={setName} required autoFocus />
          <TextField
            label="Account label"
            value={accountLabel}
            onChange={setAccountLabel}
            optional
            placeholder="Client production"
            hint="A reminder of which Convex account owns the deployment."
          />
          {!desktop && (
            <Notice tone="info">
              Enter keys from ConvexPress Desktop. The browser build can view connections but never
              collects deployment credentials.
            </Notice>
          )}
          {desktop && canInitializeDeployments() && (
            <div className="rounded-lg border border-dashed border-border p-3.5">
              <p className="text-[13px] font-medium text-foreground">Brand-new deployment?</p>
              <p className="mt-1 text-[12.5px] leading-5 text-ink-2">
                If the health check fails because ConvexPress was never deployed here, install it
                first; the connection is enrolled at the end with the same key.
              </p>
              <div className="mt-3">
                <InitializeDeploymentPanel
                  target={{
                    instanceId: environment.instanceId,
                    websiteKey: website?.websiteKey ?? "",
                    instanceKey: environment.instanceKey,
                    environmentKind: environment.kind as never,
                    deploymentOrigin: environment.deploymentOrigin,
                    managementOrigin: environment.managementOrigin,
                    siteOrigin: environment.siteOrigin,
                    siteTitle: website?.title ?? environment.instanceKey,
                  }}
                  connectionName={name}
                  accountLabel={accountLabel}
                  disabled={busy}
                  onDone={() => api.closeDialog()}
                  onRunningChange={setInstalling}
                />
              </div>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button type="button" variant="ghost" disabled={locked} onClick={api.closeDialog}>
            Cancel
          </Button>
          <Button
            type="button"
            disabled={locked || !name.trim() || !desktop}
            onClick={() => {
              setBusy(true);
              setError(null);
              void api
                .run(
                  "connect",
                  async () => {
                    const result = await provisionThroughElectron({
                      instanceId: environment.instanceId,
                      name: name.trim(),
                      accountLabel: accountLabel.trim(),
                      getControlToken: shell.getControlToken,
                    });
                    return result.cancelled ? "" : "Controller authority enrolled and encrypted.";
                  },
                  (message) => message,
                )
                .then((result) => {
                  setBusy(false);
                  if (result.ok) api.closeDialog();
                  else setError(result.error ?? friendlyError(new Error("failed")));
                });
            }}
          >
            {busy ? (
              <Loader2 data-icon="inline-start" className="animate-spin" aria-hidden="true" />
            ) : (
              <KeyRound data-icon="inline-start" aria-hidden="true" />
            )}
            Enter key in protected window
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
