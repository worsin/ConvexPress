export type HandoffStatus =
  | "preparing"
  | "ready"
  | "downloaded"
  | "revoked"
  | "failed";

export function expectedHandoffRevocation(handoffId: string) {
  return `REVOKE HANDOFF ${handoffId}`;
}

export function handoffCanBeDownloaded(
  status: HandoffStatus,
  expiresAt: number,
  now: number,
) {
  return (status === "ready" || status === "downloaded") && expiresAt > now;
}

export function formatHandoffFilename(websiteKey: string, handoffId: string) {
  const safeWebsiteKey = websiteKey
    .trim()
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "") || "convexpress-site";
  const safeHandoffId = handoffId.replace(/[^a-zA-Z0-9._-]+/g, "-");
  return `${safeWebsiteKey}-handoff-${safeHandoffId}.json`;
}

export function parseHandoffPackageText(value: string) {
  const packageJson = value.trim();
  try {
    const parsed: unknown = JSON.parse(packageJson);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error("shape");
    }
    const bundle = parsed as Record<string, unknown>;
    const manifest = bundle.manifest;
    if (
      bundle.format !== "convexpress-handoff" ||
      bundle.formatVersion !== "1.0.0" ||
      typeof bundle.manifestSha256 !== "string" ||
      bundle.manifestSha256.length !== 64 ||
      !manifest ||
      typeof manifest !== "object" ||
      Array.isArray(manifest) ||
      typeof (manifest as Record<string, unknown>).handoffId !== "string"
    ) {
      throw new Error("shape");
    }
    const handoffManifest = manifest as Record<string, unknown>;
    const website = handoffManifest.website;
    const websiteKey =
      website && typeof website === "object" && !Array.isArray(website)
        ? (website as Record<string, unknown>).websiteKey
        : null;
    const environments = handoffManifest.environments;
    return {
      handoffId: handoffManifest.handoffId as string,
      packageJson,
      websiteKey: typeof websiteKey === "string" ? websiteKey : null,
      environmentCount: Array.isArray(environments) ? environments.length : 0,
    };
  } catch {
    throw new Error("Choose a valid ConvexPress handoff package");
  }
}
