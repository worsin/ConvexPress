/**
 * Create and edit dialogs for organizations, businesses, websites, and
 * environment details. Each one commits a single mutation and reports back
 * through the workspace notice.
 */

import { api as controlApi } from "@control/convex/_generated/api";
import type { Id } from "@control/convex/_generated/dataModel";
import { useMutation, useQuery } from "convex/react";
import { Loader2 } from "lucide-react";
import { useEffect, useState, type FormEvent, type ReactNode } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { slugifyPortablePart } from "../../components/site-manager-view";
import type { WorkspaceApi } from "../SitesWorkspace";
import { CheckField, Notice, SelectField, TextAreaField, TextField } from "../forms";
import { findBusiness, findWebsite, type TreeEnvironment } from "../sites-model";
import { friendlyError } from "../useWorkspaceActions";

function RecordDialog({
  title,
  description,
  onSubmit,
  submitLabel,
  busy,
  error,
  children,
  onClose,
  formLabel,
}: {
  title: ReactNode;
  description?: ReactNode;
  onSubmit: (event: FormEvent) => void;
  submitLabel: string;
  busy: boolean;
  error: string | null;
  children: ReactNode;
  onClose: () => void;
  formLabel: string;
}) {
  return (
    <Dialog open onOpenChange={(open) => !open && !busy && onClose()}>
      <DialogContent className="max-w-lg">
        <form aria-label={formLabel} onSubmit={onSubmit} className="contents">
          <DialogHeader>
            <DialogTitle className="font-serif text-[26px] font-normal leading-none tracking-[-0.01em]">
              {title}
            </DialogTitle>
            {description && (
              <DialogDescription className="text-[13.5px] leading-6">{description}</DialogDescription>
            )}
          </DialogHeader>
          {error && <Notice tone="error">{error}</Notice>}
          <div className="grid gap-4">{children}</div>
          <DialogFooter>
            <Button type="button" variant="ghost" disabled={busy} onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={busy}>
              {busy && <Loader2 data-icon="inline-start" className="animate-spin" aria-hidden="true" />}
              {submitLabel}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function useSubmit(api: WorkspaceApi) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const submit = async (key: string, work: () => Promise<string | void>) => {
    setBusy(true);
    setError(null);
    const result = await api.run(key, work, (message) => (typeof message === "string" ? message : ""));
    setBusy(false);
    if (result.ok) api.closeDialog();
    else setError(result.error ?? friendlyError(new Error("failed")));
  };
  return { busy, error, submit };
}

// ─── Organization ───────────────────────────────────────────────────────────

export function OrganizationDialog({ api, organizationId }: { api: WorkspaceApi; organizationId?: string }) {
  const existing = useQuery(controlApi.organizations.list, organizationId ? {} : "skip");
  const current = existing?.find((entry) => String(entry.organizationId) === organizationId);
  const create = useMutation(controlApi.organizations.create);
  const update = useMutation(controlApi.organizations.update);
  const { busy, error, submit } = useSubmit(api);
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);
  const [description, setDescription] = useState("");

  useEffect(() => {
    if (current) {
      setName(current.name);
      setSlug(current.slug);
      setSlugTouched(true);
      setDescription(current.description ?? "");
    }
  }, [current?.organizationId, current?.updatedAt]);

  const editing = Boolean(organizationId);
  if (editing && !current) return null;

  return (
    <RecordDialog
      formLabel={editing ? "Edit organization" : "Create organization"}
      title={editing ? "Edit organization" : "New organization"}
      description={
        editing
          ? undefined
          : "An organization is the top of the portfolio: an agency, a company, or simply you. Businesses and their websites live inside it."
      }
      submitLabel={editing ? "Save organization" : "Create organization"}
      busy={busy}
      error={error}
      onClose={api.closeDialog}
      onSubmit={(event) => {
        event.preventDefault();
        void submit(editing ? "edit-organization" : "create-organization", async () => {
          if (editing && current) {
            await update({ organizationId: current.organizationId, name, slug, description });
            return "Organization updated.";
          }
          const created = await create({
            name,
            ...(slug ? { slug } : {}),
            ...(description ? { description } : {}),
          });
          api.select({ type: "organization", id: String(created.organizationId) });
          return `Organization ${created.name} created.`;
        });
      }}
    >
      <TextField
        label="Organization name"
        value={name}
        onChange={(value) => {
          setName(value);
          if (!slugTouched) setSlug(slugifyPortablePart(value));
        }}
        placeholder="Northstar Group"
        required
        autoFocus
      />
      <TextField
        label="Slug"
        value={slug}
        onChange={(value) => {
          setSlug(value);
          setSlugTouched(true);
        }}
        mono
        required
        hint="Used in keys and URLs. Lowercase letters, numbers, and dashes."
      />
      <TextAreaField label="Description" value={description} onChange={setDescription} optional />
    </RecordDialog>
  );
}

// ─── Business ───────────────────────────────────────────────────────────────

export function BusinessDialog({
  api,
  organizationId,
  businessId,
}: {
  api: WorkspaceApi;
  organizationId?: string;
  businessId?: string;
}) {
  const found = businessId ? findBusiness(api.tree, businessId) : null;
  const details = useQuery(
    controlApi.businesses.list,
    found ? { organizationId: found.organization.organizationId as Id<"overseer_organizations"> } : "skip",
  );
  const current = details?.find((entry) => String(entry.businessId) === businessId);
  const create = useMutation(controlApi.businesses.create);
  const update = useMutation(controlApi.businesses.update);
  const { busy, error, submit } = useSubmit(api);
  const [targetOrganization, setTargetOrganization] = useState(
    organizationId ?? api.tree[0]?.organizationId ?? "",
  );
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);
  const [description, setDescription] = useState("");
  const [accentColor, setAccentColor] = useState("");

  useEffect(() => {
    if (current) {
      setName(current.name);
      setSlug(current.slug);
      setSlugTouched(true);
      setDescription(current.description ?? "");
      setAccentColor(current.accentColor ?? "");
    }
  }, [current?.businessId, current?.updatedAt]);

  const editing = Boolean(businessId);
  if (editing && !current) return null;

  return (
    <RecordDialog
      formLabel={editing ? "Edit business" : "Create business"}
      title={editing ? "Edit business" : "New business"}
      description={
        editing
          ? undefined
          : "A business groups the websites of one client or brand. Access can be granted at this level."
      }
      submitLabel={editing ? "Save business" : "Create business"}
      busy={busy}
      error={error}
      onClose={api.closeDialog}
      onSubmit={(event) => {
        event.preventDefault();
        void submit(editing ? "edit-business" : "create-business", async () => {
          if (editing && current) {
            await update({ businessId: current.businessId, name, slug, description, accentColor });
            return "Business updated.";
          }
          const created = await create({
            organizationId: targetOrganization as Id<"overseer_organizations">,
            name,
            ...(slug ? { slug } : {}),
            ...(description ? { description } : {}),
            ...(accentColor ? { accentColor } : {}),
          });
          api.select({ type: "business", id: String(created.businessId) });
          return `Business ${created.name} created.`;
        });
      }}
    >
      {!editing && (
        <SelectField
          label="Organization"
          value={targetOrganization}
          onChange={setTargetOrganization}
          options={api.tree.map((organization) => ({
            value: organization.organizationId,
            label: organization.name,
          }))}
        />
      )}
      <TextField
        label="Business name"
        value={name}
        onChange={(value) => {
          setName(value);
          if (!slugTouched) setSlug(slugifyPortablePart(value));
        }}
        placeholder="Northstar Commerce"
        required
        autoFocus
      />
      <TextField
        label="Slug"
        value={slug}
        onChange={(value) => {
          setSlug(value);
          setSlugTouched(true);
        }}
        mono
        required
      />
      <TextAreaField label="Description" value={description} onChange={setDescription} optional />
      <TextField
        label="Accent color"
        value={accentColor}
        onChange={setAccentColor}
        optional
        placeholder="#B4623B"
        mono
        hint="Shown beside the business name."
      />
    </RecordDialog>
  );
}

// ─── Website ────────────────────────────────────────────────────────────────

export function WebsiteDialog({ api, websiteId }: { api: WorkspaceApi; websiteId: string }) {
  const found = findWebsite(api.tree, websiteId);
  const details = useQuery(
    controlApi.websites.list,
    found ? { businessId: found.business.businessId as Id<"overseer_businesses"> } : "skip",
  );
  const current = details?.find((entry) => String(entry.websiteId) === websiteId);
  const update = useMutation(controlApi.websites.update);
  const { busy, error, submit } = useSubmit(api);
  const [title, setTitle] = useState("");
  const [primaryDomain, setPrimaryDomain] = useState("");
  const [description, setDescription] = useState("");
  const [makeDefault, setMakeDefault] = useState(false);

  useEffect(() => {
    if (current) {
      setTitle(current.title);
      setPrimaryDomain(current.primaryDomain);
      setDescription(current.description ?? "");
      setMakeDefault(current.isDefault);
    }
  }, [current?.websiteId, current?.updatedAt]);

  if (!current || !found) return null;

  return (
    <RecordDialog
      formLabel="Edit website"
      title="Edit website"
      description={<span className="font-mono text-[12px]">{current.websiteKey}</span>}
      submitLabel="Save website"
      busy={busy}
      error={error}
      onClose={api.closeDialog}
      onSubmit={(event) => {
        event.preventDefault();
        void submit("edit-website", async () => {
          await update({
            websiteId: current.websiteId,
            title,
            primaryDomain,
            description,
            ...(makeDefault && !current.isDefault ? { makeDefault: true } : {}),
          });
          return "Website updated.";
        });
      }}
    >
      <TextField label="Title" value={title} onChange={setTitle} required autoFocus />
      <TextField label="Primary domain" value={primaryDomain} onChange={setPrimaryDomain} required mono />
      <TextAreaField label="Description" value={description} onChange={setDescription} optional />
      {!current.isDefault && (
        <CheckField
          label={`Make this the default website for ${found.business.name}`}
          checked={makeDefault}
          onChange={setMakeDefault}
        />
      )}
    </RecordDialog>
  );
}

// ─── Environment details ────────────────────────────────────────────────────

export function EnvironmentDialog({
  api,
  websiteId,
  environment,
}: {
  api: WorkspaceApi;
  websiteId: string;
  environment: TreeEnvironment;
}) {
  const environments = useQuery(controlApi.websiteInstances.list, {
    websiteId: websiteId as Id<"overseer_websites">,
  });
  const current = environments?.find((entry) => String(entry.instanceId) === environment.instanceId);
  const update = useMutation(controlApi.websiteInstances.update);
  const { busy, error, submit } = useSubmit(api);
  const [label, setLabel] = useState(environment.label ?? "");
  const [deploymentOrigin, setDeploymentOrigin] = useState(environment.deploymentOrigin);
  const [managementOrigin, setManagementOrigin] = useState(environment.managementOrigin);
  const [siteOrigin, setSiteOrigin] = useState(environment.siteOrigin);
  const [contract, setContract] = useState("");
  const [schema, setSchema] = useState("");
  const [engine, setEngine] = useState("");

  useEffect(() => {
    if (current) {
      setContract(current.siteContractVersion ?? "");
      setSchema(current.schemaVersion ?? "");
      setEngine(current.engineVersion ?? "");
    }
  }, [current?.instanceId, current?.updatedAt]);

  return (
    <RecordDialog
      formLabel="Edit environment"
      title={`Edit ${environment.label ?? environment.kind}`}
      description="Changing an address requires revoking the active controller connection first, so the wrong database can never be reached with old authority."
      submitLabel="Save environment"
      busy={busy}
      error={error}
      onClose={api.closeDialog}
      onSubmit={(event) => {
        event.preventDefault();
        void submit("edit-environment", async () => {
          await update({
            instanceId: environment.instanceId as Id<"overseer_websiteInstances">,
            label: label || null,
            deploymentOrigin,
            managementOrigin,
            siteOrigin,
            siteContractVersion: contract || null,
            schemaVersion: schema || null,
            engineVersion: engine || null,
          });
          return "Environment details updated.";
        });
      }}
    >
      <TextField label="Label" value={label} onChange={setLabel} placeholder={environment.kind} />
      <TextField label="Convex deployment URL" value={deploymentOrigin} onChange={setDeploymentOrigin} required mono />
      <TextField label="Convex site / management URL" value={managementOrigin} onChange={setManagementOrigin} required mono />
      <TextField label="Public website URL" value={siteOrigin} onChange={setSiteOrigin} required mono />
      <div className="grid gap-4 sm:grid-cols-3">
        <TextField label="Contract" value={contract} onChange={setContract} mono optional />
        <TextField label="Schema" value={schema} onChange={setSchema} mono optional />
        <TextField label="Engine" value={engine} onChange={setEngine} mono optional />
      </div>
    </RecordDialog>
  );
}
