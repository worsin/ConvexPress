interface NetworkEnvironment { websiteId: string; kind: string; deploymentOrigin: string }

/** Promotion needs the same website's live backend before the document's CSP
 * is loaded. This grants network reachability only; the broker still authorizes
 * the destination session and the live backend verifies its identity and role. */
export function sitePromotionNetworkOrigin(source: NetworkEnvironment | null, environments: readonly NetworkEnvironment[]): string | undefined {
  if (source?.kind !== "staging") return undefined;
  return environments.find(environment => environment.websiteId === source.websiteId && environment.kind === "live")?.deploymentOrigin;
}

/** Only origins from the control-plane selected environment and its promotion target are registered.
 * Paths, fragments and queries never enter the desktop network allow-list. */
export function siteRuntimeNetworkOrigins(target: { deploymentOrigin: string; siteOrigin?: string | null; promotionOrigin?: string } | null): string[] {
  const origins = new Set<string>();
  for (const candidate of [target?.deploymentOrigin, target?.siteOrigin, target?.promotionOrigin]) {
    if (!candidate) continue;
    try {
      const url = new URL(candidate);
      if ((url.protocol === "https:" || url.protocol === "http:") && !url.username && !url.password) origins.add(url.origin);
    } catch { /* Invalid stored addresses do not widen desktop permissions. */ }
  }
  return [...origins];
}
