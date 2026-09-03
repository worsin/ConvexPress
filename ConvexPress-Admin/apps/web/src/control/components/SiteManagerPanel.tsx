import { api as controlApi } from "@control/convex/_generated/api";
import type { Id } from "@control/convex/_generated/dataModel";
import { useAction, useMutation, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import {
  Activity,
  Building2,
  CheckCircle2,
  Database,
  Globe2,
  KeyRound,
  Loader2,
  Network,
  PencilLine,
  Plus,
  RefreshCw,
  ShieldCheck,
  Trash2,
  UserPlus,
  Users,
  X,
} from "lucide-react";
import {
  useEffect,
  useMemo,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";

import { Button } from "@/components/ui/button";
import { getElectronBridge } from "@/lib/electron";
import type { ControlAuthClient } from "../auth-client";
import type { ScopeSelection } from "./ScopeSwitcher";
import {
  buildEnvironmentKey,
  buildWebsiteKey,
  expectedConnectionRevocation,
  portfolioControlVisibility,
  slugifyPortablePart,
} from "./site-manager-view";

type OrganizationId = Id<"overseer_organizations">;
type BusinessId = Id<"overseer_businesses">;
type WebsiteId = Id<"overseer_websites">;
type InstanceId = Id<"overseer_websiteInstances">;
type ConnectionId = Id<"overseer_connections">;
type OrganizationSummary = FunctionReturnType<
  typeof controlApi.organizations.list
>[number];
type BusinessSummary = FunctionReturnType<
  typeof controlApi.businesses.list
>[number];
type WebsiteSummary = FunctionReturnType<typeof controlApi.websites.list>[number];
type EnvironmentSummary = FunctionReturnType<
  typeof controlApi.websiteInstances.list
>[number];
type ConnectionSummary = FunctionReturnType<
  typeof controlApi.connections.queries.listForInstance
>[number];
type OperatorSummary = FunctionReturnType<typeof controlApi.operators.list>[number];
type OrganizationView = Pick<
  OrganizationSummary,
  "organizationId" | "name" | "slug"
> &
  Partial<Omit<OrganizationSummary, "organizationId" | "name" | "slug">>;
type BusinessView = Pick<
  BusinessSummary,
  "businessId" | "organizationId" | "name" | "slug"
> &
  Partial<
    Omit<BusinessSummary, "businessId" | "organizationId" | "name" | "slug">
  >;
type WebsiteView = Pick<
  WebsiteSummary,
  | "websiteId"
  | "organizationId"
  | "businessId"
  | "websiteKey"
  | "title"
  | "primaryDomain"
> &
  Partial<
    Omit<
      WebsiteSummary,
      | "websiteId"
      | "organizationId"
      | "businessId"
      | "websiteKey"
      | "title"
      | "primaryDomain"
    >
  >;
type EnvironmentView = Pick<
  EnvironmentSummary,
  | "instanceId"
  | "websiteId"
  | "instanceKey"
  | "kind"
  | "label"
  | "deploymentOrigin"
  | "managementOrigin"
  | "siteOrigin"
  | "health"
  | "compatibility"
  | "isDefault"
> &
  Partial<
    Omit<
      EnvironmentSummary,
      | "instanceId"
      | "websiteId"
      | "instanceKey"
      | "kind"
      | "label"
      | "deploymentOrigin"
      | "managementOrigin"
      | "siteOrigin"
      | "health"
      | "compatibility"
      | "isDefault"
    >
  >;
type EnvironmentKind =
  | "live"
  | "staging"
  | "beta"
  | "preview"
  | "development"
  | "local"
  | "custom";

interface ManagerContext {
  organizations: Array<{
    organizationId: OrganizationId;
    name: string;
    slug: string;
  }>;
  businesses: Array<{
    businessId: BusinessId;
    organizationId: OrganizationId;
    name: string;
    slug: string;
  }>;
  websites: Array<{
    websiteId: WebsiteId;
    businessId: BusinessId;
    organizationId: OrganizationId;
    websiteKey: string;
    title: string;
    primaryDomain: string;
    isDefault: boolean;
  }>;
  environments: Array<{
    instanceId: InstanceId;
    websiteId: WebsiteId;
    instanceKey: string;
    kind: EnvironmentKind;
    label: string | null;
    deploymentOrigin: string;
    managementOrigin: string;
    siteOrigin: string;
    health: string;
    compatibility: string;
    isDefault: boolean;
  }>;
}

const inputClass =
  "mt-1.5 w-full border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-950 outline-none transition focus:border-cyan-700 focus:ring-2 focus:ring-cyan-100";
const labelClass =
  "text-[10px] font-extrabold uppercase tracking-[0.14em] text-slate-600";

export function SiteManagerPanel({
  open,
  context,
  selection,
  operatorRole,
  authClient,
  onChangeScope,
  onClose,
}: {
  open: boolean;
  context: ManagerContext;
  selection: ScopeSelection;
  operatorRole: string;
  authClient: ControlAuthClient;
  onChangeScope: (selection: ScopeSelection) => void;
  onClose: () => void;
}) {
  const [tab, setTab] = useState<
    "portfolio" | "environment" | "authority" | "people"
  >("portfolio");
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const selectedOrganizationId = selection.organizationId as OrganizationId | null;
  const selectedBusinessId = selection.businessId as BusinessId | null;
  const selectedWebsiteId = selection.websiteId as WebsiteId | null;
  const selectedInstanceId = selection.instanceId as InstanceId | null;

  const organizations = useQuery(
    controlApi.organizations.list,
    open ? {} : "skip",
  );
  const businesses = useQuery(
    controlApi.businesses.list,
    open && selectedOrganizationId
      ? { organizationId: selectedOrganizationId }
      : "skip",
  );
  const websites = useQuery(
    controlApi.websites.list,
    open && selectedBusinessId ? { businessId: selectedBusinessId } : "skip",
  );
  const environments = useQuery(
    controlApi.websiteInstances.list,
    open && selectedWebsiteId ? { websiteId: selectedWebsiteId } : "skip",
  );
  const connections = useQuery(
    controlApi.connections.queries.listForInstance,
    open && selectedInstanceId ? { instanceId: selectedInstanceId } : "skip",
  );
  const scopedProfile = useQuery(
    controlApi.operators.currentScopeProfile,
    open
      ? {
          ...(selectedOrganizationId
            ? { organizationId: selectedOrganizationId }
            : {}),
          ...(selectedBusinessId ? { businessId: selectedBusinessId } : {}),
          ...(selectedWebsiteId ? { websiteId: selectedWebsiteId } : {}),
          ...(selectedInstanceId ? { instanceId: selectedInstanceId } : {}),
        }
      : "skip",
  );
  const rbacAccess = useQuery(
    controlApi.rbac.queries.checkMyAccess,
    open
      ? { selectorType: "capability", code: "rbac.manage" }
      : "skip",
  );
  const operators = useQuery(
    controlApi.operators.list,
    open && tab === "people" && rbacAccess?.allowed === true
      ? { limit: 100 }
      : "skip",
  );

  const hierarchyAccess = useQuery(
    controlApi.rbac.queries.checkMyAccess,
    open
      ? { selectorType: "capability", code: "hierarchy.manage" }
      : "skip",
  );
  const businessAccess = useQuery(
    controlApi.rbac.queries.checkMyAccess,
    open && selectedOrganizationId && selectedBusinessId
      ? {
          selectorType: "capability",
          code: "business.update",
          organizationId: String(selectedOrganizationId),
          businessId: String(selectedBusinessId),
        }
      : "skip",
  );
  const websiteAccess = useQuery(
    controlApi.rbac.queries.checkMyAccess,
    open && selectedOrganizationId && selectedBusinessId && selectedWebsiteId
      ? {
          selectorType: "capability",
          code: "website.update",
          organizationId: String(selectedOrganizationId),
          businessId: String(selectedBusinessId),
          websiteId: String(selectedWebsiteId),
        }
      : "skip",
  );
  const connectionAccess = useQuery(
    controlApi.rbac.queries.checkMyAccess,
    open &&
      selectedOrganizationId &&
      selectedBusinessId &&
      selectedWebsiteId &&
      selectedInstanceId
      ? {
          selectorType: "capability",
          code: "connection.manage",
          organizationId: String(selectedOrganizationId),
          businessId: String(selectedBusinessId),
          websiteId: String(selectedWebsiteId),
          instanceId: String(selectedInstanceId),
        }
      : "skip",
  );
  const liveAccess = useQuery(
    controlApi.rbac.queries.checkMyAccess,
    open &&
      selectedOrganizationId &&
      selectedBusinessId &&
      selectedWebsiteId
      ? {
          selectorType: "capability",
          code: "environment.live.operate",
          organizationId: String(selectedOrganizationId),
          businessId: String(selectedBusinessId),
          websiteId: String(selectedWebsiteId),
          ...(selectedInstanceId
            ? { instanceId: String(selectedInstanceId) }
            : {}),
        }
      : "skip",
  );

  const selectedOrganization = organizations?.find(
    (entry) => entry.organizationId === selectedOrganizationId,
  ) ?? context.organizations.find(
    (entry) => entry.organizationId === selectedOrganizationId,
  );
  const selectedBusiness = businesses?.find(
    (entry) => entry.businessId === selectedBusinessId,
  ) ?? context.businesses.find(
    (entry) => entry.businessId === selectedBusinessId,
  );
  const selectedWebsite = websites?.find(
    (entry) => entry.websiteId === selectedWebsiteId,
  ) ?? context.websites.find(
    (entry) => entry.websiteId === selectedWebsiteId,
  );
  const selectedEnvironment = environments?.find(
    (entry) => entry.instanceId === selectedInstanceId,
  ) ?? context.environments.find(
    (entry) => entry.instanceId === selectedInstanceId,
  );
  const mayManageHierarchy = hierarchyAccess?.allowed === true;
  const mayManageBusiness = businessAccess?.allowed === true;
  const mayManageWebsite = websiteAccess?.allowed === true;
  const mayManageConnection =
    connectionAccess?.allowed === true &&
    (selectedEnvironment?.kind !== "live" || liveAccess?.allowed === true);
  const portfolioAccessPending =
    hierarchyAccess === undefined ||
    (selectedBusinessId !== null && businessAccess === undefined);
  const environmentAccessPending =
    selectedWebsiteId !== null &&
    (websiteAccess === undefined || liveAccess === undefined);
  const connectionAccessPending =
    selectedInstanceId !== null &&
    (connectionAccess === undefined ||
      (selectedEnvironment?.kind === "live" && liveAccess === undefined));

  const run = async (key: string, work: () => Promise<string | void>) => {
    setPending(key);
    setError(null);
    setSuccess(null);
    try {
      const message = await work();
      if (message) setSuccess(message);
    } catch (cause) {
      setError(managerError(cause));
    } finally {
      setPending(null);
    }
  };

  useEffect(() => {
    setError(null);
    setSuccess(null);
  }, [selection.organizationId, selection.businessId, selection.websiteId, selection.instanceId]);

  if (!open) return null;

  return (
    <aside
      aria-label="Manage websites"
      className="absolute inset-y-0 right-0 z-[86] flex w-full max-w-[45rem] flex-col border-l border-slate-300 bg-[#edf2f5] shadow-2xl sm:w-[45rem]"
    >
      <header className="shrink-0 border-b border-slate-300 bg-[#101827] px-5 pb-0 pt-5 text-white">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-[10px] font-extrabold uppercase tracking-[0.2em] text-cyan-300">
              Multisite portfolio
            </p>
            <h2 className="mt-1 font-serif text-2xl tracking-tight">Manage sites</h2>
            <p className="mt-1 text-xs text-slate-400">
              {selectedOrganization?.name ?? "Create your first organization"}
              {selectedBusiness ? ` / ${selectedBusiness.name}` : ""}
              {selectedWebsite ? ` / ${selectedWebsite.title}` : ""}
            </p>
          </div>
          <Button
            aria-label="Close site manager"
            className="text-white hover:bg-white/10"
            size="icon"
            variant="ghost"
            onClick={onClose}
          >
            <X className="size-4" />
          </Button>
        </div>
        <nav aria-label="Site manager sections" className="mt-5 flex gap-1">
          <TabButton active={tab === "portfolio"} onClick={() => setTab("portfolio")}>
            <Network className="size-3.5" /> Portfolio
          </TabButton>
          <TabButton active={tab === "environment"} onClick={() => setTab("environment")}>
            <Database className="size-3.5" /> Environment
          </TabButton>
          <TabButton active={tab === "authority"} onClick={() => setTab("authority")}>
            <ShieldCheck className="size-3.5" /> Authority
          </TabButton>
          <TabButton active={tab === "people"} onClick={() => setTab("people")}>
            <Users className="size-3.5" /> People
          </TabButton>
        </nav>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto p-5">
        {error ? (
          <p role="alert" className="mb-4 border border-red-200 bg-red-50 p-3 text-sm text-red-900">
            {error}
          </p>
        ) : null}
        {success ? (
          <p role="status" className="mb-4 flex items-center gap-2 border border-emerald-200 bg-emerald-50 p-3 text-sm font-semibold text-emerald-950">
            <CheckCircle2 className="size-4" /> {success}
          </p>
        ) : null}

        {tab === "portfolio" ? (
          <PortfolioSection
            context={context}
            organization={selectedOrganization}
            business={selectedBusiness}
            website={selectedWebsite}
            mayManageHierarchy={mayManageHierarchy}
            mayManageBusiness={mayManageBusiness}
            mayManageWebsite={mayManageWebsite}
            accessPending={portfolioAccessPending}
            pending={pending}
            run={run}
            onChangeScope={onChangeScope}
          />
        ) : null}
        {tab === "environment" ? (
          <EnvironmentSection
            website={selectedWebsite}
            environment={selectedEnvironment}
            environments={environments ?? []}
            mayManageWebsite={mayManageWebsite}
            liveAllowed={liveAccess?.allowed === true}
            accessPending={environmentAccessPending}
            pending={pending}
            run={run}
            onChangeScope={onChangeScope}
            selection={selection}
          />
        ) : null}
        {tab === "authority" ? (
          <AuthoritySection
            authClient={authClient}
            environment={selectedEnvironment}
            connections={connections ?? []}
            mayManage={mayManageConnection}
            accessPending={connectionAccessPending}
            pending={pending}
            run={run}
          />
        ) : null}
        {tab === "people" ? (
          <PeopleSection
            business={selectedBusiness}
            website={selectedWebsite}
            currentRoleLabel={scopedProfile?.effectiveLabel ?? operatorRole}
            mayManage={rbacAccess?.allowed === true}
            accessPending={rbacAccess === undefined || scopedProfile === undefined}
            operators={operators ?? []}
            operatorsPending={
              rbacAccess?.allowed === true && operators === undefined
            }
            pending={pending}
            run={run}
          />
        ) : null}
      </div>

      <footer className="shrink-0 border-t border-slate-300 bg-white px-5 py-3 text-xs text-slate-500">
        Signed in as <span className="font-semibold text-slate-800">{scopedProfile?.effectiveLabel ?? operatorRole}</span>. Every change is re-authorized by the control plane.
      </footer>
    </aside>
  );
}

function PortfolioSection({
  context,
  organization,
  business,
  website,
  mayManageHierarchy,
  mayManageBusiness,
  mayManageWebsite,
  accessPending,
  pending,
  run,
  onChangeScope,
}: {
  context: ManagerContext;
  organization: OrganizationView | undefined;
  business: BusinessView | undefined;
  website: WebsiteView | undefined;
  mayManageHierarchy: boolean;
  mayManageBusiness: boolean;
  mayManageWebsite: boolean;
  accessPending: boolean;
  pending: string | null;
  run: (key: string, work: () => Promise<string | void>) => Promise<void>;
  onChangeScope: (selection: ScopeSelection) => void;
}) {
  const createOrganization = useMutation(controlApi.organizations.create);
  const updateOrganization = useMutation(controlApi.organizations.update);
  const createBusiness = useMutation(controlApi.businesses.create);
  const updateBusiness = useMutation(controlApi.businesses.update);
  const createWebsite = useMutation(controlApi.websites.create);
  const updateWebsite = useMutation(controlApi.websites.update);
  const controls = portfolioControlVisibility({
    hierarchyManage: mayManageHierarchy,
    businessUpdate: mayManageBusiness,
    websiteUpdate: mayManageWebsite,
  });

  const [organizationName, setOrganizationName] = useState("");
  const [organizationSlug, setOrganizationSlug] = useState("");
  const [organizationDescription, setOrganizationDescription] = useState("");
  const [businessName, setBusinessName] = useState("");
  const [businessSlug, setBusinessSlug] = useState("");
  const [businessDescription, setBusinessDescription] = useState("");
  const [businessAccent, setBusinessAccent] = useState("#0891b2");
  const [websiteTitle, setWebsiteTitle] = useState("");
  const [websiteKey, setWebsiteKey] = useState("");
  const [websiteDomain, setWebsiteDomain] = useState("");
  const [websiteDescription, setWebsiteDescription] = useState("");

  const [editOrganization, setEditOrganization] = useState({ name: "", slug: "", description: "" });
  const [editBusiness, setEditBusiness] = useState({ name: "", slug: "", description: "", accentColor: "" });
  const [editWebsite, setEditWebsite] = useState({ title: "", primaryDomain: "", description: "" });

  useEffect(() => {
    setEditOrganization({
      name: organization?.name ?? "",
      slug: organization?.slug ?? "",
      description: organization?.description ?? "",
    });
  }, [organization?.organizationId, organization?.updatedAt]);
  useEffect(() => {
    setEditBusiness({
      name: business?.name ?? "",
      slug: business?.slug ?? "",
      description: business?.description ?? "",
      accentColor: business?.accentColor ?? "",
    });
  }, [business?.businessId, business?.updatedAt]);
  useEffect(() => {
    setEditWebsite({
      title: website?.title ?? "",
      primaryDomain: website?.primaryDomain ?? "",
      description: website?.description ?? "",
    });
  }, [website?.websiteId, website?.updatedAt]);

  const submitOrganization = (event: FormEvent) => {
    event.preventDefault();
    void run("create-organization", async () => {
      const created = await createOrganization({
        name: organizationName,
        ...(organizationSlug ? { slug: organizationSlug } : {}),
        ...(organizationDescription ? { description: organizationDescription } : {}),
      });
      setOrganizationName("");
      setOrganizationSlug("");
      setOrganizationDescription("");
      onChangeScope({ organizationId: String(created.organizationId), businessId: null, websiteId: null, instanceId: null });
      return `Organization ${created.name} created.`;
    });
  };

  const submitBusiness = (event: FormEvent) => {
    event.preventDefault();
    if (!organization) return;
    void run("create-business", async () => {
      const created = await createBusiness({
        organizationId: organization.organizationId,
        name: businessName,
        ...(businessSlug ? { slug: businessSlug } : {}),
        ...(businessDescription ? { description: businessDescription } : {}),
        ...(businessAccent ? { accentColor: businessAccent } : {}),
      });
      setBusinessName("");
      setBusinessSlug("");
      setBusinessDescription("");
      onChangeScope({ organizationId: String(organization.organizationId), businessId: String(created.businessId), websiteId: null, instanceId: null });
      return `Business ${created.name} created.`;
    });
  };

  const submitWebsite = (event: FormEvent) => {
    event.preventDefault();
    if (!organization || !business) return;
    void run("create-website", async () => {
      const created = await createWebsite({
        organizationId: organization.organizationId,
        businessId: business.businessId,
        websiteKey: websiteKey || buildWebsiteKey(business.slug, websiteTitle),
        title: websiteTitle,
        primaryDomain: websiteDomain,
        ...(websiteDescription ? { description: websiteDescription } : {}),
      });
      setWebsiteTitle("");
      setWebsiteKey("");
      setWebsiteDomain("");
      setWebsiteDescription("");
      onChangeScope({ organizationId: String(organization.organizationId), businessId: String(business.businessId), websiteId: String(created.websiteId), instanceId: null });
      return `Website ${created.title} registered.`;
    });
  };

  return (
    <div className="space-y-5">
      <section className="grid gap-px overflow-hidden border border-slate-300 bg-slate-300 sm:grid-cols-3">
        <PortfolioCard icon={<Building2 className="size-4" />} label="Organization" value={organization?.name ?? "None selected"} />
        <PortfolioCard icon={<Network className="size-4" />} label="Business" value={business?.name ?? "None selected"} />
        <PortfolioCard icon={<Globe2 className="size-4" />} label="Website" value={website?.title ?? "None selected"} />
      </section>

      {organization && controls.editOrganization ? (
        <details className="group border border-slate-300 bg-white">
          <summary className="flex cursor-pointer items-center justify-between px-4 py-3 text-sm font-bold"><span className="flex items-center gap-2"><PencilLine className="size-4 text-cyan-700" /> Edit organization</span><span className="text-xs text-slate-400">{organization.slug}</span></summary>
          <form className="grid gap-3 border-t border-slate-200 p-4" onSubmit={(event) => { event.preventDefault(); void run("edit-organization", async () => { await updateOrganization({ organizationId: organization.organizationId, name: editOrganization.name, slug: editOrganization.slug, description: editOrganization.description }); return "Organization updated."; }); }}>
            <TextField label="Name" value={editOrganization.name} onChange={(value) => setEditOrganization((current) => ({ ...current, name: value }))} />
            <TextField label="Slug" value={editOrganization.slug} onChange={(value) => setEditOrganization((current) => ({ ...current, slug: value }))} />
            <TextArea label="Description" value={editOrganization.description} onChange={(value) => setEditOrganization((current) => ({ ...current, description: value }))} />
            <SubmitButton pending={pending === "edit-organization"}>Save organization</SubmitButton>
          </form>
        </details>
      ) : null}

      {business && controls.editBusiness ? (
        <details className="group border border-slate-300 bg-white">
          <summary className="flex cursor-pointer items-center justify-between px-4 py-3 text-sm font-bold"><span className="flex items-center gap-2"><PencilLine className="size-4 text-cyan-700" /> Edit business</span><span className="text-xs text-slate-400">{business.slug}</span></summary>
          <form className="grid gap-3 border-t border-slate-200 p-4" onSubmit={(event) => { event.preventDefault(); void run("edit-business", async () => { await updateBusiness({ businessId: business.businessId, name: editBusiness.name, slug: editBusiness.slug, description: editBusiness.description, accentColor: editBusiness.accentColor }); return "Business updated."; }); }}>
            <TextField label="Name" value={editBusiness.name} onChange={(value) => setEditBusiness((current) => ({ ...current, name: value }))} />
            <TextField label="Slug" value={editBusiness.slug} onChange={(value) => setEditBusiness((current) => ({ ...current, slug: value }))} />
            <TextArea label="Description" value={editBusiness.description} onChange={(value) => setEditBusiness((current) => ({ ...current, description: value }))} />
            <TextField label="Accent color" value={editBusiness.accentColor} onChange={(value) => setEditBusiness((current) => ({ ...current, accentColor: value }))} />
            <SubmitButton pending={pending === "edit-business"}>Save business</SubmitButton>
          </form>
        </details>
      ) : null}

      {website && controls.editWebsite ? (
        <details className="group border border-slate-300 bg-white">
          <summary className="flex cursor-pointer items-center justify-between px-4 py-3 text-sm font-bold"><span className="flex items-center gap-2"><PencilLine className="size-4 text-cyan-700" /> Edit website</span><span className="max-w-64 truncate text-xs text-slate-400">{website.websiteKey}</span></summary>
          <form className="grid gap-3 border-t border-slate-200 p-4" onSubmit={(event) => { event.preventDefault(); void run("edit-website", async () => { await updateWebsite({ websiteId: website.websiteId, title: editWebsite.title, primaryDomain: editWebsite.primaryDomain, description: editWebsite.description }); return "Website updated."; }); }}>
            <TextField label="Title" value={editWebsite.title} onChange={(value) => setEditWebsite((current) => ({ ...current, title: value }))} />
            <TextField label="Primary domain" value={editWebsite.primaryDomain} onChange={(value) => setEditWebsite((current) => ({ ...current, primaryDomain: value }))} />
            <TextArea label="Description" value={editWebsite.description} onChange={(value) => setEditWebsite((current) => ({ ...current, description: value }))} />
            <SubmitButton pending={pending === "edit-website"}>Save website</SubmitButton>
          </form>
        </details>
      ) : null}

      <section aria-label="Add portfolio records" className="border border-slate-300 bg-white p-4">
        <p className="text-[10px] font-extrabold uppercase tracking-[0.16em] text-cyan-800">Add to the portfolio</p>
        <p className="mt-1 text-sm text-slate-600">New records inherit the current level selected in the scope bar.</p>

        {mayManageHierarchy ? (
          <details className="mt-4 border-t border-slate-200 pt-3" open={!organization}>
            <summary className="cursor-pointer text-sm font-bold">New organization</summary>
            <form aria-label="Create organization" className="mt-3 grid gap-3" onSubmit={submitOrganization}>
              <TextField label="Organization name" value={organizationName} onChange={(value) => { setOrganizationName(value); if (!organizationSlug) setOrganizationSlug(slugifyPortablePart(value)); }} required />
              <TextField label="Slug" value={organizationSlug} onChange={setOrganizationSlug} required />
              <TextArea label="Description" value={organizationDescription} onChange={setOrganizationDescription} />
              <SubmitButton pending={pending === "create-organization"}><Plus className="mr-2 size-4" /> Create organization</SubmitButton>
            </form>
          </details>
        ) : null}

        {organization && mayManageHierarchy ? (
          <details className="mt-4 border-t border-slate-200 pt-3" open={!business}>
            <summary className="cursor-pointer text-sm font-bold">New business in {organization.name}</summary>
            <form aria-label="Create business" className="mt-3 grid gap-3" onSubmit={submitBusiness}>
              <TextField label="Business name" value={businessName} onChange={(value) => { setBusinessName(value); if (!businessSlug) setBusinessSlug(slugifyPortablePart(value)); }} required />
              <TextField label="Slug" value={businessSlug} onChange={setBusinessSlug} required />
              <TextArea label="Description" value={businessDescription} onChange={setBusinessDescription} />
              <TextField label="Accent color" value={businessAccent} onChange={setBusinessAccent} />
              <SubmitButton pending={pending === "create-business"}><Plus className="mr-2 size-4" /> Create business</SubmitButton>
            </form>
          </details>
        ) : null}

        {organization && business && controls.createWebsite ? (
          <details className="mt-4 border-t border-slate-200 pt-3" open={!website}>
            <summary className="cursor-pointer text-sm font-bold">New website in {business.name}</summary>
            <form aria-label="Register website" className="mt-3 grid gap-3" onSubmit={submitWebsite}>
              <TextField label="Website title" value={websiteTitle} onChange={(value) => { setWebsiteTitle(value); if (!websiteKey) setWebsiteKey(buildWebsiteKey(business.slug, value)); }} required />
              <TextField label="Portable website key" value={websiteKey} onChange={setWebsiteKey} required />
              <TextField label="Primary domain" value={websiteDomain} onChange={setWebsiteDomain} placeholder="shop.example.com" required />
              <TextArea label="Description" value={websiteDescription} onChange={setWebsiteDescription} />
              <SubmitButton pending={pending === "create-website"}><Plus className="mr-2 size-4" /> Register website</SubmitButton>
            </form>
          </details>
        ) : null}

        {accessPending ? (
          <p role="status" className="mt-4 flex items-center gap-2 border-l-4 border-cyan-500 bg-cyan-50 px-3 py-2 text-sm text-cyan-950">
            <Loader2 className="size-4 animate-spin" /> Checking portfolio permissions…
          </p>
        ) : !mayManageHierarchy && !mayManageBusiness ? (
          <p className="mt-4 border-l-4 border-slate-400 bg-slate-50 px-3 py-2 text-sm text-slate-600">Your assigned role can view this portfolio but cannot change its hierarchy.</p>
        ) : null}
      </section>
    </div>
  );
}

function EnvironmentSection({
  website,
  environment,
  environments,
  mayManageWebsite,
  liveAllowed,
  accessPending,
  pending,
  run,
  onChangeScope,
  selection,
}: {
  website: WebsiteView | undefined;
  environment: EnvironmentView | undefined;
  environments: EnvironmentSummary[];
  mayManageWebsite: boolean;
  liveAllowed: boolean;
  accessPending: boolean;
  pending: string | null;
  run: (key: string, work: () => Promise<string | void>) => Promise<void>;
  onChangeScope: (selection: ScopeSelection) => void;
  selection: ScopeSelection;
}) {
  const attachEnvironment = useMutation(controlApi.websiteInstances.attach);
  const updateEnvironment = useMutation(controlApi.websiteInstances.update);
  const setDefault = useMutation(controlApi.websiteInstances.setDefault);
  const archiveEnvironment = useMutation(controlApi.websiteInstances.archive);
  const [kind, setKind] = useState<EnvironmentKind>("staging");
  const [label, setLabel] = useState("Staging");
  const [instanceKey, setInstanceKey] = useState("");
  const [deploymentOrigin, setDeploymentOrigin] = useState("");
  const [managementOrigin, setManagementOrigin] = useState("");
  const [siteOrigin, setSiteOrigin] = useState("");
  const [siteContractVersion, setSiteContractVersion] = useState("1.0.0");
  const [schemaVersion, setSchemaVersion] = useState("2026.9.0");
  const [engineVersion, setEngineVersion] = useState("1.0.0");
  const [makeDefault, setMakeDefault] = useState(false);
  const [editEnvironment, setEditEnvironment] = useState({ label: "", deploymentOrigin: "", managementOrigin: "", siteOrigin: "", siteContractVersion: "", schemaVersion: "", engineVersion: "" });
  const [archiveConfirmation, setArchiveConfirmation] = useState("");

  useEffect(() => {
    setEditEnvironment({
      label: environment?.label ?? "",
      deploymentOrigin: environment?.deploymentOrigin ?? "",
      managementOrigin: environment?.managementOrigin ?? "",
      siteOrigin: environment?.siteOrigin ?? "",
      siteContractVersion: environment?.siteContractVersion ?? "",
      schemaVersion: environment?.schemaVersion ?? "",
      engineVersion: environment?.engineVersion ?? "",
    });
    setArchiveConfirmation("");
  }, [environment?.instanceId, environment?.updatedAt]);

  const submitEnvironment = (event: FormEvent) => {
    event.preventDefault();
    if (!website) return;
    void run("create-environment", async () => {
      const key = instanceKey || buildEnvironmentKey({ websiteKey: website.websiteKey, kind, label, existingKeys: environments.map((entry) => entry.instanceKey) });
      const created = await attachEnvironment({
        websiteId: website.websiteId,
        instanceKey: key,
        kind,
        ...(label ? { label } : {}),
        deploymentOrigin,
        managementOrigin: managementOrigin || deploymentOrigin,
        siteOrigin,
        ...(siteContractVersion ? { siteContractVersion } : {}),
        ...(schemaVersion ? { schemaVersion } : {}),
        ...(engineVersion ? { engineVersion } : {}),
        makeDefault,
      });
      setInstanceKey("");
      setDeploymentOrigin("");
      setManagementOrigin("");
      setSiteOrigin("");
      onChangeScope({ ...selection, instanceId: String(created.instanceId) });
      return `${created.label ?? created.kind} environment attached. Connect its authority next.`;
    });
  };

  if (!website) {
    return <EmptyState icon={<Globe2 className="size-6" />} title="Select or create a website" copy="An environment belongs to one website and always points to its own isolated Convex deployment." />;
  }

  return (
    <div className="space-y-5">
      {environment ? (
        <section aria-label="Current environment details" className="border border-slate-300 bg-white">
          <div className="flex items-start justify-between gap-4 border-b border-slate-200 p-4">
            <div><p className="text-[10px] font-extrabold uppercase tracking-[0.15em] text-cyan-800">Current environment</p><h3 className="mt-1 font-serif text-xl">{environment.label ?? environment.kind}</h3><p className="mt-1 break-all font-mono text-[10px] text-slate-500">{environment.instanceKey}</p></div>
            <div className="text-right text-xs"><p className="font-bold uppercase text-slate-700">{environment.kind}</p><p className="mt-1 text-slate-500">{environment.health} / {environment.compatibility}</p></div>
          </div>
          {mayManageWebsite ? (
            <form className="grid gap-3 p-4" onSubmit={(event) => { event.preventDefault(); void run("edit-environment", async () => { await updateEnvironment({ instanceId: environment.instanceId, label: editEnvironment.label || null, deploymentOrigin: editEnvironment.deploymentOrigin, managementOrigin: editEnvironment.managementOrigin, siteOrigin: editEnvironment.siteOrigin, siteContractVersion: editEnvironment.siteContractVersion || null, schemaVersion: editEnvironment.schemaVersion || null, engineVersion: editEnvironment.engineVersion || null }); return "Environment details updated."; }); }}>
              <div className="grid gap-3 sm:grid-cols-2"><TextField label="Label" value={editEnvironment.label} onChange={(value) => setEditEnvironment((current) => ({ ...current, label: value }))} /><TextField label="Site URL" value={editEnvironment.siteOrigin} onChange={(value) => setEditEnvironment((current) => ({ ...current, siteOrigin: value }))} required /></div>
              <TextField label="Convex deployment URL" value={editEnvironment.deploymentOrigin} onChange={(value) => setEditEnvironment((current) => ({ ...current, deploymentOrigin: value }))} required />
              <TextField label="Convex site / management URL" value={editEnvironment.managementOrigin} onChange={(value) => setEditEnvironment((current) => ({ ...current, managementOrigin: value }))} required />
              <div className="grid gap-3 sm:grid-cols-3"><TextField label="Contract" value={editEnvironment.siteContractVersion} onChange={(value) => setEditEnvironment((current) => ({ ...current, siteContractVersion: value }))} /><TextField label="Schema" value={editEnvironment.schemaVersion} onChange={(value) => setEditEnvironment((current) => ({ ...current, schemaVersion: value }))} /><TextField label="Engine" value={editEnvironment.engineVersion} onChange={(value) => setEditEnvironment((current) => ({ ...current, engineVersion: value }))} /></div>
              <div className="flex flex-wrap gap-2"><SubmitButton pending={pending === "edit-environment"}>Save environment</SubmitButton>{!environment.isDefault ? <Button type="button" variant="outline" disabled={pending !== null || (environment.kind === "live" && !liveAllowed)} onClick={() => void run("default-environment", async () => { await setDefault({ instanceId: environment.instanceId }); return "Default environment changed."; })}>Make default</Button> : <span className="self-center text-xs font-semibold text-emerald-700">Default environment</span>}</div>
            </form>
          ) : null}
          {mayManageWebsite && (!environment.kind || environment.kind !== "live" || liveAllowed) ? (
            <div className="border-t border-red-200 bg-red-50 p-4">
              <p className="text-xs font-bold text-red-950">Archive this environment</p>
              <p className="mt-1 text-xs text-red-800">First revoke its active controller connection. Then type <code className="font-bold">ARCHIVE ENVIRONMENT {environment.instanceKey}</code>.</p>
              <div className="mt-3 flex gap-2"><input aria-label="Environment archive confirmation" className={`${inputClass} mt-0 flex-1`} value={archiveConfirmation} onChange={(event) => setArchiveConfirmation(event.target.value)} /><Button type="button" className="bg-red-700 text-white hover:bg-red-800" disabled={pending !== null || archiveConfirmation !== `ARCHIVE ENVIRONMENT ${environment.instanceKey}`} onClick={() => void run("archive-environment", async () => { await archiveEnvironment({ instanceId: environment.instanceId, confirmation: archiveConfirmation }); onChangeScope({ ...selection, instanceId: null }); return "Environment archived."; })}><Trash2 className="mr-2 size-4" /> Archive</Button></div>
            </div>
          ) : null}
        </section>
      ) : null}

      {mayManageWebsite ? (
        <section aria-label="Attach environment" className="border border-slate-300 bg-white p-4">
          <p className="text-[10px] font-extrabold uppercase tracking-[0.16em] text-cyan-800">Attach another isolated deployment</p>
          <p className="mt-1 text-sm text-slate-600">ConvexPress records the addresses; this standalone app does not provision infrastructure automatically.</p>
          <form className="mt-4 grid gap-3" onSubmit={submitEnvironment}>
            <div className="grid gap-3 sm:grid-cols-2"><label className={labelClass}>Environment kind<select className={inputClass} value={kind} onChange={(event) => { const next = event.target.value as EnvironmentKind; setKind(next); setLabel(next.charAt(0).toUpperCase() + next.slice(1)); }}><option value="live">Live</option><option value="staging">Staging</option><option value="beta">Beta</option><option value="preview">Preview</option><option value="development">Development</option><option value="local">Local</option><option value="custom">Custom</option></select></label><TextField label="Label" value={label} onChange={setLabel} required /></div>
            {kind === "live" && !liveAllowed ? <p role="alert" className="border-l-4 border-red-500 bg-red-50 px-3 py-2 text-xs text-red-900">Your role cannot attach a production environment.</p> : null}
            <TextField label="Portable environment key" value={instanceKey} onChange={setInstanceKey} placeholder={buildEnvironmentKey({ websiteKey: website.websiteKey, kind, label, existingKeys: environments.map((entry) => entry.instanceKey) })} />
            <TextField label="Convex deployment URL" value={deploymentOrigin} onChange={setDeploymentOrigin} placeholder="https://deployment.convex.cloud" required />
            <TextField label="Convex site / management URL" value={managementOrigin} onChange={setManagementOrigin} placeholder="Defaults to deployment URL for local installs" />
            <TextField label="Public website URL" value={siteOrigin} onChange={setSiteOrigin} placeholder="https://shop.example.com" required />
            <div className="grid gap-3 sm:grid-cols-3"><TextField label="Contract version" value={siteContractVersion} onChange={setSiteContractVersion} /><TextField label="Schema version" value={schemaVersion} onChange={setSchemaVersion} /><TextField label="Engine version" value={engineVersion} onChange={setEngineVersion} /></div>
            <label className="flex items-center gap-2 text-sm font-semibold text-slate-700"><input type="checkbox" checked={makeDefault} onChange={(event) => setMakeDefault(event.target.checked)} /> Make this the website default</label>
            <SubmitButton pending={pending === "create-environment"} disabled={kind === "live" && !liveAllowed}><Plus className="mr-2 size-4" /> Attach environment</SubmitButton>
          </form>
        </section>
      ) : accessPending ? (
        <p role="status" className="flex items-center gap-2 border-l-4 border-cyan-500 bg-white px-3 py-3 text-sm text-cyan-950"><Loader2 className="size-4 animate-spin" /> Checking environment permissions…</p>
      ) : (
        <p className="border-l-4 border-slate-400 bg-white px-3 py-3 text-sm text-slate-600">Your assigned role can view this environment but cannot change its deployment registration.</p>
      )}
    </div>
  );
}

function AuthoritySection({ authClient, environment, connections, mayManage, accessPending, pending, run }: { authClient: ControlAuthClient; environment: EnvironmentView | undefined; connections: ConnectionSummary[]; mayManage: boolean; accessPending: boolean; pending: string | null; run: (key: string, work: () => Promise<string | void>) => Promise<void> }) {
  const testConnection = useAction(controlApi.connections.actions.test);
  const rotateConnection = useAction(controlApi.connections.actions.rotate);
  const revokeConnection = useAction(controlApi.connections.actions.revoke);
  const [connectionName, setConnectionName] = useState("Standalone ConvexPress controller");
  const [accountLabel, setAccountLabel] = useState("");
  const [revokeId, setRevokeId] = useState<ConnectionId | null>(null);
  const [revokeConfirmation, setRevokeConfirmation] = useState("");
  const activeConnection = connections.find((entry) => entry.isActive && entry.status === "connected" && entry.hasCredentials);
  const selectedConnection = connections.find((entry) => entry.connectionId === revokeId) ?? connections[0];
  const history = useQuery(controlApi.connections.queries.healthHistory, selectedConnection ? { connectionId: selectedConnection.connectionId, limit: 8 } : "skip");

  useEffect(() => { setRevokeId(null); setRevokeConfirmation(""); setAccountLabel(""); }, [environment?.instanceId]);

  if (!environment) return <EmptyState icon={<Database className="size-6" />} title="Select an environment" copy="Controller authority is granted separately for every isolated environment." />;

  const connect = () => void run("connect", async () => {
    const bridge = getElectronBridge();
    if (!bridge) throw new Error("Open ConvexPress Desktop to enter a deployment credential securely.");
    const tokenResult = await authClient.convex.token({ fetchOptions: { throw: false } });
    const authToken = tokenResult.data?.token;
    if (!authToken) throw new Error("Your protected operator session must be refreshed before connecting.");
    const result = await bridge.connections.provision({ instanceId: String(environment.instanceId), name: connectionName, ...(accountLabel ? { accountLabel } : {}), authToken });
    if (result.cancelled) return;
    return "Controller authority enrolled and encrypted.";
  });

  return (
    <div className="space-y-5">
      <section aria-label="Controller authority" className="border border-slate-300 bg-white p-4">
        <div className="flex items-start justify-between gap-4"><div><p className="text-[10px] font-extrabold uppercase tracking-[0.16em] text-cyan-800">Controller authority</p><h3 className="mt-1 font-serif text-xl">{environment.label ?? environment.kind}</h3><p className="mt-1 text-xs text-slate-500">{environment.instanceKey}</p></div><KeyRound className="size-6 text-cyan-700" /></div>
        {connections.length ? <div className="mt-4 space-y-3">{connections.map((connection) => <article aria-label={`Controller connection ${connection.name}`} key={connection.connectionId} className="border border-slate-200 bg-slate-50 p-3"><div className="flex items-start justify-between gap-3"><div><p className="text-sm font-bold text-slate-950">{connection.name}</p><p className="mt-1 text-xs text-slate-500">{connection.accountLabel ?? "No account label"}</p></div><span className={`px-2 py-1 text-[10px] font-extrabold uppercase ${connection.status === "connected" ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-900"}`}>{connection.status}</span></div><div className="mt-3 flex flex-wrap gap-2"><Button size="sm" variant="outline" disabled={!mayManage || pending !== null} onClick={() => void run(`test-${connection.connectionId}`, async () => { await testConnection({ connectionId: connection.connectionId }); return "Connection health verified."; })}>{pending === `test-${connection.connectionId}` ? <Loader2 className="mr-2 size-3.5 animate-spin" /> : <Activity className="mr-2 size-3.5" />} Test</Button><Button size="sm" variant="outline" disabled={!mayManage || pending !== null} onClick={() => void run(`rotate-${connection.connectionId}`, async () => { await rotateConnection({ connectionId: connection.connectionId }); return "Controller signing authority rotated."; })}>{pending === `rotate-${connection.connectionId}` ? <Loader2 className="mr-2 size-3.5 animate-spin" /> : <RefreshCw className="mr-2 size-3.5" />} Rotate</Button><Button size="sm" variant="outline" className="border-red-300 text-red-800 hover:bg-red-50" disabled={!mayManage || pending !== null} onClick={() => { setRevokeId(connection.connectionId); setRevokeConfirmation(""); }}><Trash2 className="mr-2 size-3.5" /> Revoke</Button></div>{connection.credentialVersion !== null ? <p className="mt-3 text-[10px] uppercase tracking-[0.12em] text-slate-500">Encrypted envelope v{connection.credentialVersion} · updated {new Date(connection.updatedAt).toLocaleString()}</p> : null}</article>)}</div> : <p className="mt-4 border-l-4 border-amber-400 bg-amber-50 px-3 py-2 text-sm text-amber-950">This environment is registered but this controller has no authority to manage it.</p>}
      </section>

      {revokeId ? <section className="border border-red-300 bg-red-50 p-4"><p className="text-sm font-bold text-red-950">Revoke this controller authority</p><p className="mt-1 text-xs text-red-800">Type <code className="font-bold">{expectedConnectionRevocation(String(revokeId))}</code>. Confirm another trusted controller works first if this is a client handoff.</p><input aria-label="Connection revocation confirmation" className={`${inputClass} border-red-300`} value={revokeConfirmation} onChange={(event) => setRevokeConfirmation(event.target.value)} /><div className="mt-3 flex gap-2"><Button variant="outline" onClick={() => { setRevokeId(null); setRevokeConfirmation(""); }}>Cancel</Button><Button className="bg-red-700 text-white hover:bg-red-800" disabled={pending !== null || revokeConfirmation !== expectedConnectionRevocation(String(revokeId))} onClick={() => void run("revoke", async () => { await revokeConnection({ connectionId: revokeId }); setRevokeId(null); setRevokeConfirmation(""); return "Controller authority revoked."; })}>Revoke authority</Button></div></section> : null}

      {!activeConnection && mayManage ? <section className="border border-slate-300 bg-white p-4"><p className="text-[10px] font-extrabold uppercase tracking-[0.16em] text-cyan-800">Grant this controller access</p><p className="mt-1 text-sm text-slate-600">The deployment key is requested in a separate protected Electron window. It never enters this page.</p><div className="mt-4 grid gap-3"><TextField label="Connection name" value={connectionName} onChange={setConnectionName} required /><TextField label="Account label" value={accountLabel} onChange={setAccountLabel} placeholder="Client production" /><Button className="bg-cyan-700 text-white hover:bg-cyan-800" disabled={pending !== null || !connectionName.trim()} onClick={connect}>{pending === "connect" ? <Loader2 className="mr-2 size-4 animate-spin" /> : <KeyRound className="mr-2 size-4" />} Enter key in protected window</Button></div></section> : null}

      {accessPending ? <p role="status" className="flex items-center gap-2 border-l-4 border-cyan-500 bg-white px-3 py-3 text-sm text-cyan-950"><Loader2 className="size-4 animate-spin" /> Checking authority permissions…</p> : !mayManage ? <p className="border-l-4 border-slate-400 bg-white px-3 py-3 text-sm text-slate-600">Your assigned role may inspect this environment but cannot grant, rotate, or revoke controller authority.</p> : null}

      {history?.length ? <section className="border border-slate-300 bg-white p-4"><p className="text-[10px] font-extrabold uppercase tracking-[0.16em] text-cyan-800">Recent health checks</p><ol className="mt-3 divide-y divide-slate-200">{history.map((entry, index) => <li key={`${entry.checkedAt}-${index}`} className="flex items-center justify-between gap-3 py-2 text-xs"><span className="font-semibold capitalize text-slate-800">{entry.status}</span><span className="text-slate-500">{entry.latencyMs === null ? "—" : `${entry.latencyMs} ms`} · {new Date(entry.checkedAt).toLocaleString()}</span></li>)}</ol></section> : null}
    </div>
  );
}

type ProvisionProfile =
  | "administrator"
  | "business-manager"
  | "site-operator"
  | "member"
  | "viewer";

function PeopleSection({
  business,
  website,
  currentRoleLabel,
  mayManage,
  accessPending,
  operators,
  operatorsPending,
  pending,
  run,
}: {
  business: BusinessView | undefined;
  website: WebsiteView | undefined;
  currentRoleLabel: string;
  mayManage: boolean;
  accessPending: boolean;
  operators: OperatorSummary[];
  operatorsPending: boolean;
  pending: string | null;
  run: (key: string, work: () => Promise<string | void>) => Promise<void>;
}) {
  const provision = useMutation(controlApi.operators.provisionScoped);
  const setActive = useMutation(controlApi.operators.setActive);
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [profile, setProfile] = useState<ProvisionProfile>("viewer");

  const needsBusiness = profile === "business-manager";
  const needsWebsite =
    profile === "site-operator" || profile === "member" || profile === "viewer";
  const targetReady =
    (!needsBusiness || Boolean(business)) && (!needsWebsite || Boolean(website));

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!targetReady) return;
    void run("provision-operator", async () => {
      await provision({
        email,
        ...(name.trim() ? { name } : {}),
        profile,
        ...(needsBusiness && business ? { businessId: business.businessId } : {}),
        ...(needsWebsite && website ? { websiteId: website.websiteId } : {}),
      });
      setEmail("");
      setName("");
      return `${profileLabel(profile)} invitation prepared. The operator can now claim it with this exact email.`;
    });
  };

  return (
    <div className="space-y-5">
      <section className="border border-slate-300 bg-white p-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-[10px] font-extrabold uppercase tracking-[0.16em] text-cyan-800">
              Your outer access
            </p>
            <h3 className="mt-1 font-serif text-xl">{currentRoleLabel}</h3>
            <p className="mt-2 max-w-xl text-sm leading-6 text-slate-600">
              This role controls which organizations, businesses, websites, and
              environments appear in this multisite controller. Website customer
              accounts remain isolated inside each website database.
            </p>
          </div>
          <Users className="size-6 shrink-0 text-cyan-700" />
        </div>
      </section>

      {accessPending ? (
        <p role="status" className="flex items-center gap-2 border-l-4 border-cyan-500 bg-white px-3 py-3 text-sm text-cyan-950">
          <Loader2 className="size-4 animate-spin" /> Checking people-management permissions…
        </p>
      ) : mayManage ? (
        <>
          <section className="border border-slate-300 bg-white p-4">
            <div className="flex items-center gap-3">
              <span className="grid size-9 place-items-center bg-cyan-100 text-cyan-800">
                <UserPlus className="size-4" />
              </span>
              <div>
                <p className="text-[10px] font-extrabold uppercase tracking-[0.16em] text-cyan-800">
                  Add control-plane operator
                </p>
                <h3 className="mt-0.5 font-serif text-xl">Assign the narrowest useful scope</h3>
              </div>
            </div>
            <form className="mt-4 grid gap-3" onSubmit={submit}>
              <div className="grid gap-3 sm:grid-cols-2">
                <TextField label="Name" value={name} onChange={setName} />
                <TextField label="Login email" value={email} onChange={setEmail} required />
              </div>
              <label className={labelClass}>
                Outer access role
                <select
                  aria-label="Outer access role"
                  className={inputClass}
                  value={profile}
                  onChange={(event) => setProfile(event.target.value as ProvisionProfile)}
                >
                  <option value="administrator">Administrator — every organization</option>
                  <option value="business-manager">Business Manager — selected business</option>
                  <option value="site-operator">Site Operator — selected website operations</option>
                  <option value="member">Member — selected website content</option>
                  <option value="viewer">Viewer — selected website read-only</option>
                </select>
              </label>
              <div className="border-l-4 border-cyan-600 bg-cyan-50 px-3 py-2 text-sm text-cyan-950">
                {profile === "administrator"
                  ? "Scope: every organization, business, website, and environment in this installation."
                  : needsBusiness
                    ? `Scope: ${business?.name ?? "select a business above first"}.`
                    : `Scope: ${website?.title ?? "select a website above first"}, including its environments.`}
              </div>
              <SubmitButton
                pending={pending === "provision-operator"}
                disabled={!email.trim() || !targetReady}
              >
                <UserPlus className="mr-2 size-4" /> Prepare operator invitation
              </SubmitButton>
            </form>
          </section>

          <section aria-label="Control-plane operators" className="border border-slate-300 bg-white p-4">
            <p className="text-[10px] font-extrabold uppercase tracking-[0.16em] text-cyan-800">
              Current operators
            </p>
            {operatorsPending ? (
              <p role="status" className="mt-4 flex items-center gap-2 text-sm text-slate-600">
                <Loader2 className="size-4 animate-spin" /> Loading assigned access…
              </p>
            ) : (
              <div className="mt-3 divide-y divide-slate-200">
                {operators.map((operator) => (
                  <article
                    aria-label={`Operator ${operator.email ?? operator.name ?? operator.userId}`}
                    className="py-3"
                    key={operator.userId}
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-bold text-slate-950">
                          {operator.name ?? operator.email ?? "Unnamed operator"}
                        </p>
                        <p className="mt-0.5 truncate text-xs text-slate-500">
                          {operator.email ?? "No login email"} · {operatorProfileSummary(operator)}
                        </p>
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        <span className={`px-2 py-1 text-[9px] font-extrabold uppercase tracking-[0.1em] ${operator.isActive ? "bg-emerald-100 text-emerald-800" : "bg-slate-200 text-slate-600"}`}>
                          {operator.isActive ? (operator.hasLogin ? "Active login" : "Claimable") : "Inactive"}
                        </span>
                        {operator.role !== "owner" ? (
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={pending !== null}
                            onClick={() =>
                              void run(`active-${operator.userId}`, async () => {
                                await setActive({
                                  userId: operator.userId,
                                  isActive: !operator.isActive,
                                });
                                return `${operator.name ?? operator.email ?? "Operator"} ${operator.isActive ? "deactivated" : "reactivated"}.`;
                              })
                            }
                          >
                            {operator.isActive ? "Deactivate" : "Reactivate"}
                          </Button>
                        ) : null}
                      </div>
                    </div>
                    {operator.access.length ? (
                      <ul className="mt-2 flex flex-wrap gap-1.5">
                        {operator.access.map((grant) => (
                          <li
                            className="border border-slate-200 bg-slate-50 px-2 py-1 text-[10px] text-slate-600"
                            key={`${grant.targetType}-${grant.targetId}`}
                          >
                            {grant.targetLabel} · {grant.level}
                            {grant.includeEnvironments ? " + environments" : ""}
                          </li>
                        ))}
                      </ul>
                    ) : null}
                  </article>
                ))}
              </div>
            )}
          </section>
        </>
      ) : (
        <p className="border-l-4 border-slate-400 bg-white px-3 py-3 text-sm text-slate-600">
          Only the installation owner or an administrator can add operators or change outer access. Your assigned sites remain available through the scope switcher.
        </p>
      )}
    </div>
  );
}

function profileLabel(profile: ProvisionProfile): string {
  switch (profile) {
    case "administrator":
      return "Administrator";
    case "business-manager":
      return "Business Manager";
    case "site-operator":
      return "Site Operator";
    case "member":
      return "Member";
    case "viewer":
      return "Viewer";
  }
}

function operatorProfileSummary(operator: OperatorSummary): string {
  if (operator.role === "owner") return "Owner";
  if (operator.role === "admin") return "Administrator";
  if (
    operator.access.some(
      (grant) => grant.targetType === "business" && grant.level === "manage",
    )
  ) {
    return "Business Manager";
  }
  if (
    operator.access.some(
      (grant) => grant.targetType === "website" && grant.level === "manage",
    )
  ) {
    return "Site Operator";
  }
  return operator.role === "member" ? "Member" : "Viewer";
}

function TabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) { return <button type="button" className={`inline-flex items-center gap-2 border-b-2 px-3 py-2.5 text-xs font-bold transition ${active ? "border-cyan-300 bg-white/10 text-white" : "border-transparent text-slate-400 hover:bg-white/5 hover:text-white"}`} aria-current={active ? "page" : undefined} onClick={onClick}>{children}</button>; }
function PortfolioCard({ icon, label, value }: { icon: ReactNode; label: string; value: string }) { return <div className="bg-white p-4"><span className="text-cyan-700">{icon}</span><p className="mt-3 text-[9px] font-extrabold uppercase tracking-[0.16em] text-slate-500">{label}</p><p className="mt-1 truncate text-sm font-bold text-slate-950">{value}</p></div>; }
function TextField({ label, value, onChange, required = false, placeholder }: { label: string; value: string; onChange: (value: string) => void; required?: boolean; placeholder?: string }) { return <label className={labelClass}>{label}<input className={inputClass} value={value} required={required} placeholder={placeholder} onChange={(event) => onChange(event.target.value)} /></label>; }
function TextArea({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) { return <label className={labelClass}>{label}<textarea className={`${inputClass} min-h-20 resize-y`} value={value} onChange={(event) => onChange(event.target.value)} /></label>; }
function SubmitButton({ pending, disabled = false, children }: { pending: boolean; disabled?: boolean; children: ReactNode }) { return <Button type="submit" className="justify-self-start bg-[#101827] text-white hover:bg-slate-700" disabled={pending || disabled}>{pending ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}{children}</Button>; }
function EmptyState({ icon, title, copy }: { icon: ReactNode; title: string; copy: string }) { return <div className="grid min-h-72 place-items-center border border-dashed border-slate-300 bg-white p-8 text-center"><div><span className="mx-auto grid size-12 place-items-center bg-cyan-100 text-cyan-800">{icon}</span><h3 className="mt-4 font-serif text-xl">{title}</h3><p className="mx-auto mt-2 max-w-sm text-sm leading-6 text-slate-600">{copy}</p></div></div>; }

function managerError(cause: unknown): string {
  const message = cause instanceof Error ? cause.message : String(cause);
  if (/not authorized|no_matching_grant|explicit_deny/i.test(message)) return "Your role is not authorized for that change.";
  if (/already exists|already attached/i.test(message)) return "That key, domain, or deployment address is already registered.";
  if (/Revoke the active connection/i.test(message)) return "Revoke the active controller connection before changing or archiving this environment.";
  if (/credential prompt|ConvexPress Desktop|protected operator session/i.test(message)) return message;
  if (/Connection could not be created/i.test(message)) return "The deployment identity or admin key could not be verified.";
  return "The site-management change could not be completed. Check the entered values and try again.";
}
