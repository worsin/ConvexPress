import path from "node:path";

export const PACKAGED_RENDERER_SCHEME = "convexpress-app";
export const PACKAGED_RENDERER_HOST = "shell";
export const PACKAGED_RENDERER_ENTRY_URL = `${PACKAGED_RENDERER_SCHEME}://${PACKAGED_RENDERER_HOST}/index.html`;

/**
 * Resolve one request from the privileged packaged-renderer protocol into the
 * bundled renderer directory. The raw pathname is decoded before URL
 * normalization so encoded dot segments cannot be hidden by the URL parser.
 */
export function resolvePackagedRendererPath(
  rendererRoot: string,
  requestUrl: string,
): string {
  let parsed: URL;
  try {
    parsed = new URL(requestUrl);
  } catch {
    throw new Error("Malformed packaged renderer URL.");
  }

  if (
    parsed.protocol !== `${PACKAGED_RENDERER_SCHEME}:` ||
    parsed.hostname !== PACKAGED_RENDERER_HOST ||
    parsed.username !== "" ||
    parsed.password !== "" ||
    parsed.port !== ""
  ) {
    throw new Error("Untrusted packaged renderer origin.");
  }

  const originPrefix = `${PACKAGED_RENDERER_SCHEME}://${PACKAGED_RENDERER_HOST}`;
  if (!requestUrl.startsWith(originPrefix)) {
    throw new Error("Untrusted packaged renderer origin.");
  }

  const rawPathname = requestUrl
    .slice(originPrefix.length)
    .split(/[?#]/, 1)[0] || "/";

  let pathname: string;
  try {
    pathname = decodeURIComponent(rawPathname);
  } catch {
    throw new Error("Malformed packaged renderer path encoding.");
  }

  if (
    pathname.includes("\0") ||
    pathname.split(/[\\/]/).some((segment) => segment === "..")
  ) {
    throw new Error("Packaged renderer path traversal is not allowed.");
  }

  const requestedPath = pathname === "/" ? "/index.html" : pathname;
  const resolvedRoot = path.resolve(rendererRoot);
  const resolvedPath = path.resolve(resolvedRoot, `.${requestedPath}`);

  if (
    resolvedPath !== resolvedRoot &&
    !resolvedPath.startsWith(`${resolvedRoot}${path.sep}`)
  ) {
    throw new Error("Packaged renderer path escaped its root.");
  }

  return resolvedPath;
}
