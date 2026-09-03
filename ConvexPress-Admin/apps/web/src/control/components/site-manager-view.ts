export function slugifyPortablePart(value: string): string {
  return (
    value
      .trim()
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 72) || "site"
  );
}

export function buildWebsiteKey(businessSlug: string, title: string): string {
  return `${slugifyPortablePart(businessSlug)}:${slugifyPortablePart(title)}`;
}

export function buildEnvironmentKey(input: {
  websiteKey: string;
  kind: string;
  label: string;
  existingKeys: readonly string[];
}): string {
  const base = `${input.websiteKey}:${slugifyPortablePart(input.kind)}`;
  const existing = new Set(input.existingKeys);
  if (!existing.has(base)) return base;
  const labeled = `${base}:${slugifyPortablePart(input.label || "secondary")}`;
  if (!existing.has(labeled)) return labeled;
  let suffix = 2;
  while (existing.has(`${labeled}-${suffix}`)) suffix += 1;
  return `${labeled}-${suffix}`;
}

export function expectedConnectionRevocation(connectionId: string): string {
  return `REVOKE CONNECTION ${connectionId}`;
}

export function portfolioControlVisibility(access: {
  hierarchyManage: boolean;
  businessUpdate: boolean;
  websiteUpdate: boolean;
}) {
  return {
    editOrganization: access.hierarchyManage,
    editBusiness: access.businessUpdate,
    editWebsite: access.websiteUpdate,
    createWebsite: access.businessUpdate,
  };
}

export function controlSurfaceVisibility(access: {
  backupAllowed: boolean;
  selectedEnvironmentIsLive: boolean;
  websiteHasLiveEnvironment: boolean;
  liveOperateAllowed: boolean;
  handoffExportAllowed: boolean;
  handoffImportAllowed: boolean;
}) {
  const operations =
    access.backupAllowed &&
    (!access.selectedEnvironmentIsLive || access.liveOperateAllowed);
  const handoffExport =
    access.handoffExportAllowed &&
    (!access.websiteHasLiveEnvironment || access.liveOperateAllowed);
  const handoffImport = access.handoffImportAllowed;
  return {
    operations,
    handoffExport,
    handoffImport,
    handoff: handoffExport || handoffImport,
  };
}
