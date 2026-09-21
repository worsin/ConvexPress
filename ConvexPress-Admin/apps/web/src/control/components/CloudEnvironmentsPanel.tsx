import { useControlAccessChecks } from "../ControlAccessProvider";
import { DeploymentCredentialRecovery } from "./DeploymentCredentialRecovery";
import {
  InitializeDeploymentPanel,
  canInitializeDeployments,
} from "../sites/dialogs/InitializeDeploymentPanel";
import { api } from "@control/convex/_generated/api";
import type { Id } from "@control/convex/_generated/dataModel";
import { useAction, useMutation, useQuery } from "convex/react";
import { useId, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useControlShell } from "../ControlShellContext";
type Props = {
  primaryDomain: string;
  websiteKey: string;
  organizationId: string;
  businessId: string;
  websiteId: string;
  name: string;
};
type Environments = {
  receiptId: Id<"overseer_hostingProvisioning">;
  projectId: number;
  production: { name: string; deploymentUrl: string };
  staging: { name: string; deploymentUrl: string };
};
export function CloudEnvironmentsPanel(props: Props) {
  const shell = useControlShell();
  const agency = !!shell && ["owner", "admin"].includes(shell.operator.role);
  const access = useControlAccessChecks(agency
      ? {
          checks: [
            {
              selectorType: "capability",
              code: "connection.manage",
              organizationId: props.organizationId,
              businessId: props.businessId,
            },
            {
              selectorType: "capability",
              code: "site.deploy",
              organizationId: props.organizationId,
              businessId: props.businessId,
              websiteId: props.websiteId,
            },
          ],
        }
      : "skip",
  );
  return agency && access?.every((a) => a.allowed) ? (
    <EnvironmentsForm key={props.websiteId} {...props} />
  ) : null;
}
function EnvironmentsForm(props: Props) {
  const fieldId = useId();
  const accounts = useQuery(api.hosting.accounts.list, {
    organizationId: props.organizationId as Id<"overseer_organizations">,
    businessId: props.businessId as Id<"overseer_businesses">,
  });
  const available = accounts?.filter((a) => a.provider === "convex" && a.status === "active");
  const [selected, setSelected] = useState("");
  const accountId = (selected || available?.[0]?.accountId) as
    | Id<"overseer_hostingAccounts">
    | undefined;
  const selectedAvailable = available?.some((a) => a.accountId === accountId);
  const receipt = useQuery(
    api.hosting.provisioning.forWebsite,
    accountId && selectedAvailable
      ? { accountId, websiteId: props.websiteId as Id<"overseer_websites"> }
      : "skip",
  );
  const create = useAction(api.hosting.provision.createConvexEnvironments);
  const adopt = useAction(api.hosting.provision.adoptConvexProject);
  const [adoptId, setAdoptId] = useState("");
  const [mode, setMode] = useState<"create" | "adopt">("create");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Environments | null>(null);
  const [requestId] = useState(() => crypto.randomUUID());
  const adoptedProject = receipt?.name.match(/^Adopt project (\d+)$/)?.[1];
  const effectiveMode = receipt ? (adoptedProject ? "adopt" : "create") : mode;
  const effectiveProjectId = adoptedProject ?? adoptId;
  async function run() {
    if (!accountId) return;
    setBusy(true);
    setError(null);
    try {
      const common = { accountId, websiteId: props.websiteId as Id<"overseer_websites"> };
      const value =
        effectiveMode === "adopt"
          ? await adopt({ ...common, projectId: Number(effectiveProjectId) })
          : await create({
              ...common,
              idempotencyKey: requestId,
              name: receipt?.name ?? props.name,
            });
      setResult(value);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Cloud provisioning failed");
    } finally {
      setBusy(false);
    }
  }
  return (
    <section
      aria-label="Cloud environments"
      className="space-y-3 rounded-xl border border-border p-4"
    >
      <h2 className="text-[15px] font-semibold">Cloud environments</h2>
      <p className="text-sm text-muted-foreground">
        Create separate production and staging databases for this website, or adopt an existing
        Convex project. Provider plan charges apply.
      </p>
      {!available?.length ? (
        <p className="text-sm text-muted-foreground">
          Connect a Convex team account in this business or organization first.
        </p>
      ) : (
        <>
          <div className="grid gap-1 text-sm">
            <label htmlFor={`${fieldId}-account`}>Convex account</label>
            <select
              id={`${fieldId}-account`}
              className="h-9 rounded-md border border-input bg-background px-3"
              value={accountId ?? ""}
              disabled={busy}
              onChange={(e) => {
                setSelected(e.target.value);
                setResult(null);
                setError(null);
              }}
            >
              {available.map((a) => (
                <option key={a.accountId} value={a.accountId}>
                  {a.label}
                </option>
              ))}
            </select>
          </div>
          {receipt && (
            <div className="text-sm">
              <p>Provisioning: {receipt.state.replaceAll("_", " ")}</p>
              {receipt.resources.map((r) => (
                <p key={r.step} className="text-muted-foreground">
                  {r.step}: {r.externalId ?? r.state}
                </p>
              ))}
            </div>
          )}
          {receipt?.state !== "succeeded" && (
            <>
              <div className="grid gap-1 text-sm">
                <label htmlFor={`${fieldId}-setup`}>Setup</label>
                <select
                  id={`${fieldId}-setup`}
                  className="h-9 rounded-md border border-input bg-background px-3"
                  value={effectiveMode}
                  disabled={busy || !!receipt}
                  onChange={(e) => setMode(e.target.value as "create" | "adopt")}
                >
                  <option value="create">Create new project and environments</option>
                  <option value="adopt">Adopt an existing project</option>
                </select>
              </div>
              {effectiveMode === "adopt" && (
                <div className="grid gap-1 text-sm">
                  <label htmlFor={`${fieldId}-project`}>Existing project ID</label>
                  <Input
                    id={`${fieldId}-project`}
                    inputMode="numeric"
                    pattern="[0-9]+"
                    value={effectiveProjectId}
                    disabled={busy || !!receipt}
                    onChange={(e) => setAdoptId(e.target.value)}
                  />
                </div>
              )}
              <Button
                disabled={
                  busy ||
                  !selectedAvailable ||
                  receipt === undefined ||
                  (effectiveMode === "adopt" &&
                    (!/^\d+$/.test(effectiveProjectId) || Number(effectiveProjectId) <= 0))
                }
                onClick={run}
              >
                {busy
                  ? "Provisioning…"
                  : receipt
                    ? "Reconcile and continue"
                    : effectiveMode === "adopt"
                      ? "Verify and adopt project"
                      : "Create cloud environments"}
              </Button>
            </>
          )}
          {receipt?.state === "succeeded" && (
            <AttachCloudEnvironments
              key={receipt.receiptId}
              receiptId={receipt.receiptId}
              websiteKey={props.websiteKey}
              name={props.name}
              primaryDomain={props.primaryDomain}
            />
          )}
          {result && (
            <div className="text-sm">
              <p>Project {result.projectId}</p>
              <p>Production: {result.production.deploymentUrl}</p>
              <p>Staging: {result.staging.deploymentUrl}</p>
            </div>
          )}
        </>
      )}
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </section>
  );
}

function AttachCloudEnvironments(props: {
  receiptId: Id<"overseer_hostingProvisioning">;
  websiteKey: string;
  name: string;
  primaryDomain: string;
}) {
  const fieldId = useId();
  const attached = useQuery(api.hosting.instances.get, { receiptId: props.receiptId });
  const attach = useMutation(api.hosting.instances.attach);
  const initial = props.primaryDomain.startsWith("https://")
    ? props.primaryDomain
    : `https://${props.primaryDomain}`;
  const [productionSiteOrigin, setProductionSiteOrigin] = useState(initial);
  const [stagingSiteOrigin, setStagingSiteOrigin] = useState(() => {
    try {
      const url = new URL(initial);
      url.hostname = url.hostname.endsWith(".workers.dev")
        ? url.hostname.replace(".", "-staging.")
        : `staging.${url.hostname}`;
      return url.origin;
    } catch {
      return "";
    }
  });
  const [busy, setBusy] = useState(false),
    [error, setError] = useState<string | null>(null);
  if (attached)
    return (
      <div className="space-y-4 border-t border-border pt-3">
        <p className="text-sm font-medium">Production and staging are registered.</p>
        {[attached.production, attached.staging].map((instance) => (
          <div key={instance.instanceId} className="space-y-2 rounded-lg border border-border p-3">
            <p className="text-sm">
              {instance.label ?? instance.kind} · {instance.siteOrigin}
            </p>
            {instance.status === "active" && (
              <DeploymentCredentialRecovery instanceId={instance.instanceId} />
            )}
            {instance.status !== "active" ? (
              <p role="alert" className="text-sm text-destructive">
                This environment is archived. Reconcile its registration before initializing.
              </p>
            ) : canInitializeDeployments() ? (
              <InitializeDeploymentPanel
                target={{
                  instanceId: instance.instanceId,
                  websiteKey: props.websiteKey,
                  instanceKey: instance.instanceKey,
                  environmentKind: instance.kind,
                  deploymentOrigin: instance.deploymentOrigin,
                  managementOrigin: instance.managementOrigin,
                  siteOrigin: instance.siteOrigin,
                  siteTitle: props.name,
                }}
                connectionName="ConvexPress cloud controller"
                accountLabel={instance.label ?? instance.kind}
                onDone={() => {}}
              />
            ) : (
              <p className="text-sm text-muted-foreground">
                Open ConvexPress Desktop to initialize this environment.
              </p>
            )}
          </div>
        ))}
      </div>
    );
  return (
    <form
      className="space-y-3 border-t border-border pt-3"
      onSubmit={async (event) => {
        event.preventDefault();
        setBusy(true);
        setError(null);
        try {
          await attach({ receiptId: props.receiptId, productionSiteOrigin, stagingSiteOrigin });
        } catch (e) {
          setError(e instanceof Error ? e.message : "Could not register cloud environments");
        } finally {
          setBusy(false);
        }
      }}
    >
      <h3 className="text-sm font-medium">Register website environments</h3>
      <p className="text-sm text-muted-foreground">
        Enter each website's public address. This binds the confirmed databases to this website; it
        does not publish the frontend or change DNS.
      </p>
      <div className="grid gap-1 text-sm">
        <label htmlFor={`${fieldId}-production-origin`}>Production website address</label>
        <Input
          id={`${fieldId}-production-origin`}
          type="url"
          required
          value={productionSiteOrigin}
          disabled={busy}
          onChange={(e) => setProductionSiteOrigin(e.target.value)}
        />
      </div>
      <div className="grid gap-1 text-sm">
        <label htmlFor={`${fieldId}-staging-origin`}>Staging website address</label>
        <Input
          id={`${fieldId}-staging-origin`}
          type="url"
          required
          value={stagingSiteOrigin}
          disabled={busy}
          onChange={(e) => setStagingSiteOrigin(e.target.value)}
        />
      </div>
      <Button type="submit" disabled={busy || attached === undefined}>
        {busy ? "Registering…" : "Register production and staging"}
      </Button>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </form>
  );
}
