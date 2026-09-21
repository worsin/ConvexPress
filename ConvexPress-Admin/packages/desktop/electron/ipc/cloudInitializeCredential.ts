type CloudInitializeTarget = {
  websiteKey: string; instanceKey: string; environmentKind: string;
  deploymentOrigin: string; managementOrigin: string; siteOrigin: string;
};
export function validateCloudInitializeCredential(value: unknown, target: CloudInitializeTarget): string | null {
  if (value === null) return null;
  if (!value || typeof value !== "object") throw Error("Cloud initialization target is invalid");
  const result = value as Record<string, unknown>;
  for (const field of ["websiteKey", "instanceKey", "environmentKind", "deploymentOrigin", "managementOrigin", "siteOrigin"] as const) {
    if (result[field] !== target[field]) throw Error("Cloud initialization target changed. Refresh the environment before retrying.");
  }
  const name = new URL(target.deploymentOrigin).hostname.replace(/\.convex\.cloud$/, "");
  const prefix = `${target.environmentKind === "live" ? "prod" : "dev"}:${name}|`;
  if (typeof result.deploymentAdminKey !== "string" || !result.deploymentAdminKey.startsWith(prefix)
    || result.deploymentAdminKey.length <= prefix.length + 15 || result.deploymentAdminKey.length > 16384)
    throw Error("Cloud deployment credential is invalid");
  return result.deploymentAdminKey;
}
