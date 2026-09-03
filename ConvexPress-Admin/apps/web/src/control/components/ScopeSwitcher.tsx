import { Building2, Database, Globe2, Network } from "lucide-react";

export interface ScopeSelection {
  organizationId: string | null;
  businessId: string | null;
  websiteId: string | null;
  instanceId: string | null;
}

export interface ScopeContext {
  organizations: Array<{ organizationId: string; name: string }>;
  businesses: Array<{
    businessId: string;
    organizationId: string;
    name: string;
  }>;
  websites: Array<{
    websiteId: string;
    businessId: string;
    title: string;
    isDefault: boolean;
  }>;
  environments: Array<{
    instanceId: string;
    websiteId: string;
    kind: string;
    label: string | null;
    isDefault: boolean;
  }>;
}

export function ScopeSwitcher({
  context,
  selection,
  pending,
  onChange,
}: {
  context: ScopeContext;
  selection: ScopeSelection;
  pending: boolean;
  onChange: (selection: ScopeSelection) => void;
}) {
  const businesses = context.businesses.filter(
    (entry) => entry.organizationId === selection.organizationId,
  );
  const websites = context.websites.filter(
    (entry) => entry.businessId === selection.businessId,
  );
  const environments = context.environments.filter(
    (entry) => entry.websiteId === selection.websiteId,
  );

  const firstBusiness = (organizationId: string) =>
    context.businesses.find((entry) => entry.organizationId === organizationId) ?? null;
  const firstWebsite = (businessId: string) => {
    const matches = context.websites.filter((entry) => entry.businessId === businessId);
    return matches.find((entry) => entry.isDefault) ?? matches[0] ?? null;
  };
  const firstEnvironment = (websiteId: string) => {
    const matches = context.environments.filter((entry) => entry.websiteId === websiteId);
    return matches.find((entry) => entry.isDefault) ?? matches[0] ?? null;
  };

  return (
    <div
      aria-busy={pending}
      aria-label="Active ConvexPress scope"
      className="grid flex-1 grid-cols-1 gap-px overflow-hidden border border-white/15 bg-white/15 sm:grid-cols-2 xl:grid-cols-4"
    >
      <ScopeSelect
        icon={Network}
        label="Organization"
        value={selection.organizationId}
        options={context.organizations.map((entry) => ({
          value: entry.organizationId,
          label: entry.name,
        }))}
        onChange={(organizationId) => {
          const business = organizationId ? firstBusiness(organizationId) : null;
          const website = business ? firstWebsite(business.businessId) : null;
          const environment = website ? firstEnvironment(website.websiteId) : null;
          onChange({
            organizationId,
            businessId: business?.businessId ?? null,
            websiteId: website?.websiteId ?? null,
            instanceId: environment?.instanceId ?? null,
          });
        }}
      />
      <ScopeSelect
        icon={Building2}
        label="Business"
        value={selection.businessId}
        options={businesses.map((entry) => ({
          value: entry.businessId,
          label: entry.name,
        }))}
        onChange={(businessId) => {
          const business = businesses.find((entry) => entry.businessId === businessId) ?? null;
          const website = business ? firstWebsite(business.businessId) : null;
          const environment = website ? firstEnvironment(website.websiteId) : null;
          onChange({
            organizationId: business?.organizationId ?? selection.organizationId,
            businessId,
            websiteId: website?.websiteId ?? null,
            instanceId: environment?.instanceId ?? null,
          });
        }}
      />
      <ScopeSelect
        icon={Globe2}
        label="Website"
        value={selection.websiteId}
        options={websites.map((entry) => ({
          value: entry.websiteId,
          label: entry.title,
        }))}
        onChange={(websiteId) => {
          const website = websites.find((entry) => entry.websiteId === websiteId) ?? null;
          const environment = website ? firstEnvironment(website.websiteId) : null;
          onChange({
            ...selection,
            websiteId,
            instanceId: environment?.instanceId ?? null,
          });
        }}
      />
      <ScopeSelect
        icon={Database}
        label="Environment"
        value={selection.instanceId}
        options={environments.map((entry) => ({
          value: entry.instanceId,
          label: entry.label || entry.kind,
        }))}
        onChange={(instanceId) => onChange({ ...selection, instanceId })}
      />
    </div>
  );
}

function ScopeSelect({
  icon: Icon,
  label,
  value,
  options,
  onChange,
}: {
  icon: typeof Network;
  label: string;
  value: string | null;
  options: Array<{ value: string; label: string }>;
  onChange: (value: string | null) => void;
}) {
  return (
    <label className="flex min-w-0 items-center gap-3 bg-[#101827] px-3 py-2 text-white">
      <Icon aria-hidden="true" className="size-4 shrink-0 text-cyan-300" />
      <span className="min-w-0 flex-1">
        <span className="block text-[10px] font-bold uppercase tracking-[0.16em] text-slate-400">
          {label}
        </span>
        <select
          aria-label={label}
          className="block w-full cursor-pointer appearance-none truncate bg-transparent py-0.5 text-sm font-medium text-white outline-none focus-visible:ring-2 focus-visible:ring-cyan-300"
          value={value ?? ""}
          onChange={(event) => onChange(event.target.value || null)}
        >
          <option value="" className="text-slate-950">Choose {label.toLowerCase()}</option>
          {options.map((option) => (
            <option key={option.value} value={option.value} className="text-slate-950">
              {option.label}
            </option>
          ))}
        </select>
      </span>
    </label>
  );
}
