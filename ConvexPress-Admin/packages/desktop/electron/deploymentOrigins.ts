/**
 * Site deployment origins the renderer is allowed to talk to.
 *
 * The control plane hands the admin a different Convex deployment per
 * website environment (a self-hosted fleet on a LAN, a cloud deployment,
 * a laptop). Those origins are only known at runtime, so the renderer
 * registers each one here the first time it connects; the Content
 * Security Policy then admits them for websocket, fetch, image and media
 * loads. The list is persisted in userData so later launches start with
 * the right policy and nothing has to reload.
 */
import { JsonStore } from "./utils/json-store.js";

const MAX_ORIGINS = 200;

interface DeploymentOriginsState extends Record<string, unknown> {
  origins: string[];
}

const store = new JsonStore<DeploymentOriginsState>({
  name: "convexpress-deployment-origins",
  defaults: { origins: [] },
});

/** Exact `scheme://host[:port]` for an http(s) URL, or null when it is not one. */
export function normalizeDeploymentOrigin(value: unknown): string | null {
  if (typeof value !== "string" || value.length > 2048) return null;
  try {
    const parsed = new URL(value.trim());
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null;
    if (parsed.username || parsed.password) return null;
    if (!parsed.hostname) return null;
    return parsed.origin;
  } catch {
    return null;
  }
}

function readOrigins(): string[] {
  const raw = store.get("origins");
  return Array.isArray(raw)
    ? raw.filter((entry): entry is string => typeof entry === "string")
    : [];
}

export function listRegisteredDeploymentOrigins(): string[] {
  return readOrigins();
}

/**
 * Registers origins the renderer needs to reach. Returns the ones that were
 * not already allowed, so the caller knows whether the current document's
 * policy predates them.
 */
export function registerDeploymentOrigins(candidates: unknown): { added: string[]; origins: string[] } {
  if (!Array.isArray(candidates)) throw new Error("origins must be an array");
  const current = new Set(readOrigins());
  const added: string[] = [];
  for (const candidate of candidates.slice(0, 50)) {
    const origin = normalizeDeploymentOrigin(candidate);
    if (!origin || current.has(origin)) continue;
    current.add(origin);
    added.push(origin);
  }
  if (added.length) {
    const next = [...current].slice(-MAX_ORIGINS);
    store.set("origins", next);
  }
  return { added, origins: [...current] };
}

export function forgetDeploymentOrigins(): void {
  store.set("origins", []);
}
