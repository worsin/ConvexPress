/**
 * Pure presentation rules for environment identity.
 *
 * Live is always unmistakable: its own colour, the word itself, and a dot.
 * Health and contract state pick the dot colour for every other kind.
 */

export type EnvironmentHealth = "unknown" | "ok" | "unreachable" | "degraded";
export type EnvironmentCompatibility = "unknown" | "compatible" | "incompatible";

export interface EnvironmentLike {
  kind: string;
  label?: string | null;
  health?: EnvironmentHealth | string;
  compatibility?: EnvironmentCompatibility | string;
}

export type EnvironmentTone = "live" | "ok" | "warn" | "danger" | "quiet";

export function environmentDisplayName(environment: EnvironmentLike): string {
  const raw = environment.label?.trim() || environment.kind;
  return raw.charAt(0).toUpperCase() + raw.slice(1);
}

export function isLiveEnvironment(environment: EnvironmentLike): boolean {
  return environment.kind === "live";
}

/**
 * Colour tone for dots and chips. Live wins even when unhealthy so the
 * production signal is never diluted; attention states still show through
 * the accompanying status text.
 */
export function environmentTone(environment: EnvironmentLike): EnvironmentTone {
  if (isLiveEnvironment(environment)) return "live";
  if (environment.compatibility === "incompatible") return "danger";
  if (environment.health === "unreachable") return "danger";
  if (environment.health === "degraded" || environment.compatibility === "unknown")
    return "warn";
  if (environment.health === "ok") return "ok";
  return "quiet";
}

export function environmentStatusText(environment: EnvironmentLike): string {
  const health =
    environment.health === "ok"
      ? "Healthy"
      : environment.health === "degraded"
        ? "Degraded"
        : environment.health === "unreachable"
          ? "Unreachable"
          : "Health unknown";
  const contract =
    environment.compatibility === "compatible"
      ? "Contract compatible"
      : environment.compatibility === "incompatible"
        ? "Contract incompatible"
        : "Contract unverified";
  return `${health} · ${contract}`;
}

export function originHostname(origin: string): string {
  try {
    const url = new URL(origin);
    return url.port ? `${url.hostname}:${url.port}` : url.hostname;
  } catch {
    return origin;
  }
}

export function initialsFor(name: string): string {
  const words = name
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (words.length === 0) return "?";
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[words.length - 1][0]).toUpperCase();
}
