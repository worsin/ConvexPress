/**
 * Add website — the guided flow for registering a new site.
 *
 *   1. Where it belongs   (business; create the org/business inline if needed)
 *   2. The website        (title, domain, portable key)
 *   3. Its deployment     (kind + the three addresses)
 *   4. Connect            (admin key in the protected window)
 *   5. Done               (open it)
 *
 * Every step commits as it completes, so a failure later never loses the
 * earlier records; the flow simply resumes from where it stopped.
 */

import { api as controlApi } from "@control/convex/_generated/api";
import type { Id } from "@control/convex/_generated/dataModel";
import { useMutation, useQuery } from "convex/react";
import { Check, ChevronRight, KeyRound, Loader2, ShieldCheck } from "lucide-react";
import { useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { useControlShell } from "@/control/ControlShellContext";
import { getElectronBridge } from "@/lib/electron";
import { cn } from "@/lib/utils";
import {
  buildEnvironmentKey,
  buildWebsiteKey,
  slugifyPortablePart,
} from "../../components/site-manager-view";
import type { WorkspaceApi } from "../SitesWorkspace";
import { Notice, SelectField, TextField } from "../forms";
import { findBusiness } from "../sites-model";
import { friendlyError } from "../useWorkspaceActions";
import { DEFAULT_CONNECTION_NAME, provisionThroughElectron } from "./ConnectAuthorityDialog";
import { DeploymentFields, emptyDeploymentDraft } from "./DeploymentFields";

const STEPS = ["Where", "Website", "Deployment", "Connect", "Done"] as const;
type Step = 0 | 1 | 2 | 3 | 4;

interface Created {
  organizationId: string;
  businessId: string;
  websiteId: string | null;
  websiteTitle: string;
  websiteKey: string;
  instanceId: string | null;
  environmentLabel: string;
  connected: boolean;
}

export function AddWebsiteDialog({
  api,
  organizationId,
  businessId,
}: {
  api: WorkspaceApi;
  organizationId?: string;
  businessId?: string;
}) {
  const shell = useControlShell()!;
  const createOrganization = useMutation(controlApi.organizations.create);
  const createBusiness = useMutation(controlApi.businesses.create);
  const createWebsite = useMutation(controlApi.websites.create);
  const attachEnvironment = useMutation(controlApi.websiteInstances.attach);
  const hierarchyAccess = useQuery(controlApi.rbac.queries.checkMyAccess, {
    selectorType: "capability",
    code: "hierarchy.manage",
  });

  const businesses = useMemo(
    () =>
      api.tree.flatMap((organization) =>
        organization.businesses.map((business) => ({
          value: business.businessId,
          label: `${organization.name} › ${business.name}`,
          organizationId: organization.organizationId,
          slug: business.slug,
        })),
      ),
    [api.tree],
  );
  const canCreateHierarchy = hierarchyAccess?.allowed === true;
  const mustCreate = businesses.length === 0;

  const [step, setStep] = useState<Step>(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Step 1
  const [mode, setMode] = useState<"existing" | "new">(mustCreate ? "new" : "existing");
  const [selectedBusiness, setSelectedBusiness] = useState(businessId ?? businesses[0]?.value ?? "");
  const [newOrganizationMode, setNewOrganizationMode] = useState<"existing" | "new">(
    api.tree.length === 0 ? "new" : "existing",
  );
  const [newOrganizationId, setNewOrganizationId] = useState(organizationId ?? api.tree[0]?.organizationId ?? "");
  const [newOrganizationName, setNewOrganizationName] = useState("");
  const [newBusinessName, setNewBusinessName] = useState("");

  // Step 2
  const [title, setTitle] = useState("");
  const [domain, setDomain] = useState("");
  const [websiteKey, setWebsiteKey] = useState("");
  const [keyTouched, setKeyTouched] = useState(false);

  // Step 3
  const [deployment, setDeployment] = useState(() => emptyDeploymentDraft("live"));
  const liveAccess = useQuery(
    controlApi.rbac.queries.checkMyAccess,
    selectedBusiness && mode === "existing"
      ? {
          selectorType: "capability",
          code: "environment.live.operate",
          organizationId: businesses.find((b) => b.value === selectedBusiness)?.organizationId ?? "",
          businessId: selectedBusiness,
        }
      : "skip",
  );
  const liveAllowed = mode === "new" ? true : liveAccess === undefined ? true : liveAccess.allowed === true;

  // Step 4
  const [connectionName, setConnectionName] = useState(DEFAULT_CONNECTION_NAME);
  const [accountLabel, setAccountLabel] = useState("");
  const desktop = Boolean(getElectronBridge());

  const [created, setCreated] = useState<Created | null>(null);

  const businessSlug =
    mode === "existing"
      ? businesses.find((b) => b.value === selectedBusiness)?.slug ?? ""
      : slugifyPortablePart(newBusinessName || "business");
  const suggestedWebsiteKey = title ? buildWebsiteKey(businessSlug, title) : "";
  const effectiveKey = websiteKey || suggestedWebsiteKey;
  const suggestedEnvironmentKey = buildEnvironmentKey({
    websiteKey: created?.websiteKey || effectiveKey || "site",
    kind: deployment.kind,
    label: deployment.label,
    existingKeys: [],
  });

  const fail = (cause: unknown) => {
    setError(friendlyError(cause));
    setBusy(false);
  };

  // ── Step handlers: each one commits and advances ────────────────────────
  const commitWhere = async () => {
    setBusy(true);
    setError(null);
    try {
      let orgId = newOrganizationId;
      let bizId = selectedBusiness;
      if (mode === "new") {
        if (newOrganizationMode === "new") {
          const organization = await createOrganization({ name: newOrganizationName });
          orgId = String(organization.organizationId);
        }
        const business = await createBusiness({
          organizationId: orgId as Id<"overseer_organizations">,
          name: newBusinessName,
        });
        bizId = String(business.businessId);
      } else {
        orgId = businesses.find((b) => b.value === selectedBusiness)?.organizationId ?? "";
      }
      setCreated({
        organizationId: orgId,
        businessId: bizId,
        websiteId: null,
        websiteTitle: "",
        websiteKey: "",
        instanceId: null,
        environmentLabel: "",
        connected: false,
      });
      setStep(1);
      setBusy(false);
    } catch (cause) {
      fail(cause);
    }
  };

  const commitWebsite = async () => {
    if (!created) return;
    setBusy(true);
    setError(null);
    try {
      const website = await createWebsite({
        organizationId: created.organizationId as Id<"overseer_organizations">,
        businessId: created.businessId as Id<"overseer_businesses">,
        websiteKey: effectiveKey,
        title,
        primaryDomain: domain,
      });
      setCreated({
        ...created,
        websiteId: String(website.websiteId),
        websiteTitle: website.title,
        websiteKey: website.websiteKey,
      });
      setDeployment((draft) =>
        draft.siteTouched ? draft : { ...draft, siteOrigin: `https://${website.primaryDomain}` },
      );
      setStep(2);
      setBusy(false);
    } catch (cause) {
      fail(cause);
    }
  };

  const commitDeployment = async () => {
    if (!created?.websiteId) return;
    setBusy(true);
    setError(null);
    try {
      const instance = await attachEnvironment({
        websiteId: created.websiteId as Id<"overseer_websites">,
        instanceKey: deployment.instanceKey || suggestedEnvironmentKey,
        kind: deployment.kind,
        ...(deployment.label ? { label: deployment.label } : {}),
        deploymentOrigin: deployment.deploymentOrigin,
        managementOrigin: deployment.managementOrigin || deployment.deploymentOrigin,
        siteOrigin: deployment.siteOrigin,
        ...(deployment.siteContractVersion ? { siteContractVersion: deployment.siteContractVersion } : {}),
        ...(deployment.schemaVersion ? { schemaVersion: deployment.schemaVersion } : {}),
        ...(deployment.engineVersion ? { engineVersion: deployment.engineVersion } : {}),
        makeDefault: true,
      });
      setCreated({
        ...created,
        instanceId: String(instance.instanceId),
        environmentLabel: instance.label ?? instance.kind,
      });
      setStep(3);
      setBusy(false);
    } catch (cause) {
      fail(cause);
    }
  };

  const commitConnect = async () => {
    if (!created?.instanceId) return;
    setBusy(true);
    setError(null);
    try {
      const result = await provisionThroughElectron({
        instanceId: created.instanceId,
        name: connectionName.trim(),
        accountLabel: accountLabel.trim(),
        getControlToken: shell.getControlToken,
      });
      setBusy(false);
      if (result.cancelled) return;
      setCreated({ ...created, connected: true });
      setStep(4);
    } catch (cause) {
      fail(cause);
    }
  };

  const finish = () => {
    if (created?.websiteId) api.select({ type: "website", id: created.websiteId });
    api.closeDialog();
  };

  const whereReady =
    mode === "existing"
      ? Boolean(selectedBusiness)
      : Boolean(newBusinessName.trim()) &&
        (newOrganizationMode === "existing" ? Boolean(newOrganizationId) : Boolean(newOrganizationName.trim()));
  const websiteReady = Boolean(title.trim()) && Boolean(domain.trim()) && Boolean(effectiveKey);
  const deploymentReady =
    Boolean(deployment.deploymentOrigin.trim()) &&
    Boolean(deployment.siteOrigin.trim()) &&
    Boolean(deployment.label.trim()) &&
    (deployment.kind !== "live" || liveAllowed);

  return (
    <Dialog open onOpenChange={(open) => !open && !busy && (step === 4 ? finish() : api.closeDialog())}>
      <DialogContent className="max-w-2xl gap-0 p-0">
        <div className="grid sm:grid-cols-[200px_minmax(0,1fr)]">
          {/* Steps rail */}
          <aside className="hidden border-r border-border bg-sidebar/60 p-5 sm:block">
            <p className="eyebrow">Add website</p>
            <ol className="mt-4 space-y-1">
              {STEPS.map((label, index) => {
                const state = index < step ? "done" : index === step ? "current" : "todo";
                return (
                  <li
                    key={label}
                    aria-current={state === "current" ? "step" : undefined}
                    className={cn(
                      "flex items-center gap-2.5 rounded-lg px-2 py-1.5 text-[13px]",
                      state === "current" && "bg-card font-semibold text-foreground shadow-soft",
                      state === "todo" && "text-muted-foreground",
                      state === "done" && "text-ink-2",
                    )}
                  >
                    <span
                      className={cn(
                        "grid size-5 place-items-center rounded-full text-[11px] font-semibold",
                        state === "done" && "bg-success-soft text-success",
                        state === "current" && "bg-primary text-primary-foreground",
                        state === "todo" && "border border-line-strong text-muted-foreground",
                      )}
                    >
                      {state === "done" ? <Check aria-hidden="true" className="size-3" /> : index + 1}
                    </span>
                    {label}
                  </li>
                );
              })}
            </ol>
            {created && (
              <dl className="mt-6 space-y-2 border-t border-border pt-4 text-[12px]">
                {created.websiteTitle && (
                  <div>
                    <dt className="text-muted-foreground">Website</dt>
                    <dd className="truncate font-medium text-foreground">{created.websiteTitle}</dd>
                  </div>
                )}
                {created.environmentLabel && (
                  <div>
                    <dt className="text-muted-foreground">Environment</dt>
                    <dd className="font-medium text-foreground">{created.environmentLabel}</dd>
                  </div>
                )}
              </dl>
            )}
          </aside>

          <section className="p-6">
            <p className="eyebrow sm:hidden">
              Step {step + 1} of {STEPS.length} · {STEPS[step]}
            </p>

            {error && <Notice tone="error" className="mb-4">{error}</Notice>}

            {/* ── 1. Where ─────────────────────────────────────────── */}
            {step === 0 && (
              <form
                aria-label="Choose where the website belongs"
                onSubmit={(event) => {
                  event.preventDefault();
                  if (whereReady) void commitWhere();
                }}
                className="space-y-5"
              >
                <header>
                  <h2 className="font-serif text-[26px] leading-none tracking-[-0.01em]">Where does it belong?</h2>
                  <p className="mt-2 text-[13.5px] leading-6 text-ink-2">
                    Websites live inside a business. Pick one, or start a new business for a new client or brand.
                  </p>
                </header>
                {!mustCreate && (
                  <div role="radiogroup" aria-label="Business choice" className="grid gap-2 sm:grid-cols-2">
                    <ChoiceCard
                      selected={mode === "existing"}
                      onClick={() => setMode("existing")}
                      title="An existing business"
                      detail="Add another website beside the ones already there."
                    />
                    <ChoiceCard
                      selected={mode === "new"}
                      onClick={() => setMode("new")}
                      title="A new business"
                      detail="A new client or brand with its own websites."
                      disabled={!canCreateHierarchy}
                    />
                  </div>
                )}
                {mode === "existing" ? (
                  <SelectField label="Business" value={selectedBusiness} onChange={setSelectedBusiness} options={businesses} />
                ) : (
                  <div className="grid gap-4">
                    {api.tree.length > 0 && (
                      <div role="radiogroup" aria-label="Organization choice" className="grid gap-2 sm:grid-cols-2">
                        <ChoiceCard
                          selected={newOrganizationMode === "existing"}
                          onClick={() => setNewOrganizationMode("existing")}
                          title="In an existing organization"
                          detail="Keep it with the businesses you already manage."
                        />
                        <ChoiceCard
                          selected={newOrganizationMode === "new"}
                          onClick={() => setNewOrganizationMode("new")}
                          title="In a new organization"
                          detail="Start a separate portfolio."
                        />
                      </div>
                    )}
                    {newOrganizationMode === "existing" && api.tree.length > 0 ? (
                      <SelectField
                        label="Organization"
                        value={newOrganizationId}
                        onChange={setNewOrganizationId}
                        options={api.tree.map((o) => ({ value: o.organizationId, label: o.name }))}
                      />
                    ) : (
                      <TextField
                        label="Organization name"
                        value={newOrganizationName}
                        onChange={setNewOrganizationName}
                        placeholder="Northstar Group"
                        required
                        autoFocus={api.tree.length === 0}
                        hint="An agency, a company, or simply you."
                      />
                    )}
                    <TextField
                      label="Business name"
                      value={newBusinessName}
                      onChange={setNewBusinessName}
                      placeholder="Northstar Commerce"
                      required
                    />
                  </div>
                )}
                <Footer
                  busy={busy}
                  onCancel={api.closeDialog}
                  primaryLabel="Continue"
                  primaryDisabled={!whereReady}
                />
              </form>
            )}

            {/* ── 2. Website ───────────────────────────────────────── */}
            {step === 1 && (
              <form
                aria-label="Register website"
                onSubmit={(event) => {
                  event.preventDefault();
                  if (websiteReady) void commitWebsite();
                }}
                className="space-y-5"
              >
                <header>
                  <h2 className="font-serif text-[26px] leading-none tracking-[-0.01em]">The website</h2>
                  <p className="mt-2 text-[13.5px] leading-6 text-ink-2">
                    What it is called and where visitors find it. The portable key follows the site if it is ever handed to another controller.
                  </p>
                </header>
                <TextField
                  label="Website title"
                  value={title}
                  onChange={(value) => {
                    setTitle(value);
                    if (!keyTouched) setWebsiteKey("");
                  }}
                  placeholder="Northstar Shop"
                  required
                  autoFocus
                />
                <TextField
                  label="Primary domain"
                  value={domain}
                  onChange={setDomain}
                  placeholder="shop.northstar.com"
                  required
                  mono
                />
                <TextField
                  label="Portable website key"
                  value={websiteKey || suggestedWebsiteKey}
                  onChange={(value) => {
                    setWebsiteKey(value);
                    setKeyTouched(true);
                  }}
                  mono
                  hint="Generated from the business and title. Change it only if you need a specific key."
                />
                <Footer
                  busy={busy}
                  onCancel={api.closeDialog}
                  primaryLabel="Register website"
                  primaryDisabled={!websiteReady}
                />
              </form>
            )}

            {/* ── 3. Deployment ────────────────────────────────────── */}
            {step === 2 && (
              <form
                aria-label="Attach environment"
                onSubmit={(event) => {
                  event.preventDefault();
                  if (deploymentReady) void commitDeployment();
                }}
                className="space-y-5"
              >
                <header>
                  <h2 className="font-serif text-[26px] leading-none tracking-[-0.01em]">Its deployment</h2>
                  <p className="mt-2 text-[13.5px] leading-6 text-ink-2">
                    Every environment is an isolated Convex database. Give ConvexPress the addresses of the one you already run; it never creates infrastructure for you.
                  </p>
                </header>
                <DeploymentFields
                  draft={deployment}
                  onChange={setDeployment}
                  liveAllowed={liveAllowed}
                  primaryDomain={domain}
                  suggestedKey={suggestedEnvironmentKey}
                />
                <Footer
                  busy={busy}
                  onCancel={finish}
                  cancelLabel="Skip for now"
                  primaryLabel="Attach environment"
                  primaryDisabled={!deploymentReady}
                />
              </form>
            )}

            {/* ── 4. Connect ───────────────────────────────────────── */}
            {step === 3 && (
              <form
                aria-label="Connect controller"
                onSubmit={(event) => {
                  event.preventDefault();
                  void commitConnect();
                }}
                className="space-y-5"
              >
                <header>
                  <h2 className="font-serif text-[26px] leading-none tracking-[-0.01em]">Connect the controller</h2>
                  <p className="mt-2 text-[13.5px] leading-6 text-ink-2">
                    Hand over the deployment admin key once, in a protected window. ConvexPress enrolls its own signing key on the site and seals the credential in an encrypted envelope.
                  </p>
                </header>
                <div className="flex gap-3 rounded-lg border border-border bg-surface-2/60 p-3.5 text-[13px] leading-5 text-ink-2">
                  <ShieldCheck aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-success" />
                  The key never enters this page, browser storage, or any log.
                </div>
                <TextField label="Connection name" value={connectionName} onChange={setConnectionName} required />
                <TextField
                  label="Account label"
                  value={accountLabel}
                  onChange={setAccountLabel}
                  optional
                  placeholder="Client production"
                  hint="Which Convex account owns this deployment."
                />
                {!desktop && (
                  <Notice tone="info">
                    Deployment keys are entered from ConvexPress Desktop. You can skip this now and connect later from the website page.
                  </Notice>
                )}
                <Footer
                  busy={busy}
                  onCancel={() => setStep(4)}
                  cancelLabel="Connect later"
                  primaryLabel="Enter key in protected window"
                  primaryIcon={<KeyRound data-icon="inline-start" aria-hidden="true" />}
                  primaryDisabled={!desktop || !connectionName.trim()}
                />
              </form>
            )}

            {/* ── 5. Done ──────────────────────────────────────────── */}
            {step === 4 && created && (
              <div className="space-y-5">
                <header>
                  <span className="grid size-10 place-items-center rounded-xl bg-success-soft text-success">
                    <Check aria-hidden="true" className="size-5" />
                  </span>
                  <h2 className="mt-4 font-serif text-[26px] leading-none tracking-[-0.01em]">
                    {created.connected ? "Wired and ready" : "Registered, not yet connected"}
                  </h2>
                  <p className="mt-2 text-[13.5px] leading-6 text-ink-2">
                    {created.connected
                      ? `${created.websiteTitle} is registered and this controller holds encrypted authority over its ${created.environmentLabel} environment.`
                      : created.instanceId
                        ? `${created.websiteTitle} and its ${created.environmentLabel} environment are registered. Connect the controller from the website page when you have the admin key.`
                        : `${created.websiteTitle} is registered. Attach its deployment from the website page whenever you are ready.`}
                  </p>
                </header>
                <div className="flex flex-wrap justify-end gap-2">
                  <Button variant="outline" onClick={finish}>
                    View website page
                  </Button>
                  {created.connected && created.websiteId && created.instanceId && (
                    <Button onClick={() => api.openInShell(created.websiteId!, created.instanceId)}>
                      Open in ConvexPress
                      <ChevronRight data-icon="inline-end" aria-hidden="true" />
                    </Button>
                  )}
                </div>
              </div>
            )}
          </section>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function ChoiceCard({
  selected,
  onClick,
  title,
  detail,
  disabled,
}: {
  selected: boolean;
  onClick: () => void;
  title: string;
  detail: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "rounded-lg border p-3.5 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-50",
        selected ? "border-primary bg-primary-soft/60" : "border-border bg-card hover:border-line-strong",
      )}
    >
      <span className="block text-[13.5px] font-semibold text-foreground">{title}</span>
      <span className="mt-0.5 block text-[12.5px] leading-5 text-muted-foreground">{detail}</span>
    </button>
  );
}

function Footer({
  busy,
  onCancel,
  cancelLabel = "Cancel",
  primaryLabel,
  primaryDisabled,
  primaryIcon,
}: {
  busy: boolean;
  onCancel: () => void;
  cancelLabel?: string;
  primaryLabel: string;
  primaryDisabled?: boolean;
  primaryIcon?: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-end gap-2 border-t border-border pt-4">
      <Button type="button" variant="ghost" disabled={busy} onClick={onCancel}>
        {cancelLabel}
      </Button>
      <Button type="submit" disabled={busy || primaryDisabled}>
        {busy ? <Loader2 data-icon="inline-start" className="animate-spin" aria-hidden="true" /> : primaryIcon}
        {primaryLabel}
      </Button>
    </div>
  );
}
