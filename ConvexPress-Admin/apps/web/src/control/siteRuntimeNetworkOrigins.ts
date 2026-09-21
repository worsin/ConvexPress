/** Only origins from the control-plane selected environment are registered.
 * Paths, fragments and queries never enter the desktop network allow-list. */
export function siteRuntimeNetworkOrigins(target: { deploymentOrigin: string; siteOrigin?: string | null } | null): string[] {
  const origins = new Set<string>();
  for (const candidate of [target?.deploymentOrigin, target?.siteOrigin]) {
    if (!candidate) continue;
    try {
      const url = new URL(candidate);
      if ((url.protocol === "https:" || url.protocol === "http:") && !url.username && !url.password) origins.add(url.origin);
    } catch { /* Invalid stored addresses do not widen desktop permissions. */ }
  }
  return [...origins];
}
