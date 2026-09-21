import { parseDeploymentOrigin } from "./siteDeployValidation";
/** Validate the configured origin before considering a trusted development-only
 * SSH-tunnel mapping. Public HTTP and credential-bearing URLs remain forbidden. */
export function mapConfiguredDeploymentOrigin(value: unknown, options: { development: boolean; originMap?: string }): string {
  const validate = (candidate: unknown) => {
    const origin = parseDeploymentOrigin(candidate);
    const url = new URL(String(candidate).trim());
    if (url.username || url.password || url.pathname !== "/" || url.search || url.hash) throw Error("Invalid deployment origin");
    return origin;
  };
  const origin = validate(value);
  if (!options.development || !options.originMap) return origin;
  for (const pair of options.originMap.split(",")) {
    const parts = pair.split("=");
    if (parts.length !== 2) continue;
    const [from, to] = parts.map(part => part.trim().replace(/\/+$/, ""));
    if (from === origin) return validate(to);
  }
  return origin;
}
