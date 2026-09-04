/**
 * Integrations hub — pure presentation model.
 *
 * Turns the backend readiness overview plus the shared registry into what a
 * card shows: one status, one line, a readiness score. No React, no Convex.
 */

import {
  INTEGRATIONS,
  INTEGRATION_GROUPS,
  type IntegrationDefinition,
  type IntegrationGroup,
} from "@backend/convex/integrations/registry";

export type FieldState = "set" | "env" | "empty";

export interface ProviderOverview {
  id: string;
  fields: Array<{ key: string; state: FieldState; value: string | boolean | null; envName: string | null }>;
  configured: boolean;
  missing: string[];
  check: {
    status: "verified" | "failed" | "skipped";
    checkedAt: number;
    latencyMs: number | null;
    summary: string;
    details: Array<{ label: string; ok: boolean; note: string | null }>;
    stale: boolean;
  } | null;
  shipping: {
    connectionStatus: string | null;
    mode: string | null;
    secretStored: boolean;
    lastVerifiedAt: number | null;
    lastErrorMessage: string | null;
    implementationStatus: string;
    credentialFields: Array<{
      key: string;
      label: string;
      type: string;
      required: boolean;
      placeholder: string | null;
    }>;
  } | null;
}

export type ProviderStatus =
  | "verified"
  | "failing"
  | "unverified"
  | "missing"
  | "off"
  | "tool";

export type ProviderFilter = "all" | "attention" | "verified" | "optional";

export interface ProviderView {
  definition: IntegrationDefinition;
  overview: ProviderOverview | null;
  status: ProviderStatus;
  /** One line under the title. */
  headline: string;
  /** Required for launch readiness. */
  required: boolean;
  /** Field states usable by the configure dialog. */
  fieldState: Record<string, FieldState>;
  fieldValue: Record<string, string | boolean | null>;
  envFallbacks: string[];
}

export const STATUS_LABEL: Record<ProviderStatus, string> = {
  verified: "Verified",
  failing: "Failing",
  unverified: "Not verified",
  missing: "Not configured",
  off: "Off",
  tool: "Tool",
};

export function relativeTime(timestamp: number, now = Date.now()): string {
  const diff = Math.max(0, now - timestamp);
  const minutes = Math.round(diff / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.round(hours / 24);
  return `${days} d ago`;
}

export function deriveStatus(
  definition: IntegrationDefinition,
  overview: ProviderOverview | null,
): ProviderStatus {
  if (definition.storage.kind === "link") return "tool";
  if (!overview) return "missing";
  if (!overview.configured) {
    const nothingSet = overview.fields.every((field) => field.state === "empty");
    // Optional providers with nothing entered, or with every required part
    // switched off (nothing missing yet not configured), are simply off.
    if (definition.optional && (nothingSet || overview.missing.length === 0)) {
      return "off";
    }
    return "missing";
  }
  const check = overview.check;
  if (!check || check.stale) return "unverified";
  if (check.status === "verified") return "verified";
  if (check.status === "failed") return "failing";
  return "unverified";
}

export function headlineFor(
  definition: IntegrationDefinition,
  overview: ProviderOverview | null,
  status: ProviderStatus,
  now = Date.now(),
): string {
  if (status === "tool") return definition.description;
  if (!overview) return "Loading…";
  if (status === "off") return "Not in use. Connect it when you need it.";
  if (status === "missing") {
    return overview.missing.length
      ? `Needs ${overview.missing.join(", ")}.`
      : "Add credentials to connect.";
  }
  const check = overview.check;
  if (status === "unverified") {
    return check?.stale
      ? "Configuration changed since the last check. Verify again."
      : "Configured but never verified. Run a check.";
  }
  if (!check) return definition.description;
  const when = relativeTime(check.checkedAt, now);
  return `${check.summary} Checked ${when}.`;
}

export function buildProviderViews(
  overviews: ProviderOverview[] | undefined,
  now = Date.now(),
): ProviderView[] {
  const byId = new Map((overviews ?? []).map((entry) => [entry.id, entry]));
  return INTEGRATIONS.map((definition) => {
    const overview = byId.get(definition.id) ?? null;
    const status = deriveStatus(definition, overview);
    const fieldState: Record<string, FieldState> = {};
    const fieldValue: Record<string, string | boolean | null> = {};
    const envFallbacks: string[] = [];
    for (const field of overview?.fields ?? []) {
      fieldState[field.key] = field.state;
      fieldValue[field.key] = field.value;
      if (field.state === "env" && field.envName) envFallbacks.push(field.envName);
    }
    return {
      definition,
      overview,
      status,
      headline: headlineFor(definition, overview, status, now),
      required: !definition.optional && definition.storage.kind !== "link",
      fieldState,
      fieldValue,
      envFallbacks,
    };
  });
}

export function matchesFilter(view: ProviderView, filter: ProviderFilter): boolean {
  switch (filter) {
    case "all":
      return true;
    case "attention":
      return (
        view.status === "failing" ||
        view.status === "unverified" ||
        (view.status === "missing" && view.required)
      );
    case "verified":
      return view.status === "verified";
    case "optional":
      return !view.required && view.status !== "tool";
  }
}

export function groupViews(
  views: ProviderView[],
): Array<{ group: (typeof INTEGRATION_GROUPS)[number]; views: ProviderView[] }> {
  return INTEGRATION_GROUPS.map((group) => ({
    group,
    views: views.filter((view) => view.definition.group === group.id),
  })).filter((entry) => entry.views.length > 0);
}

export interface Readiness {
  /** Required providers that are verified. */
  verified: number;
  /** Required providers in total. */
  required: number;
  failing: number;
  attention: number;
  /** 0..1 */
  ratio: number;
  label: string;
}

export function readinessFor(views: ProviderView[]): Readiness {
  const required = views.filter((view) => view.required);
  const verified = required.filter((view) => view.status === "verified").length;
  const failing = views.filter((view) => view.status === "failing").length;
  const attention = views.filter((view) => matchesFilter(view, "attention")).length;
  const ratio = required.length === 0 ? 1 : verified / required.length;
  const label =
    required.length === verified
      ? "Ready to launch"
      : verified === 0
        ? "Not ready"
        : failing > 0
          ? "Needs attention"
          : "Almost ready";
  return { verified, required: required.length, failing, attention, ratio, label };
}

export function groupTitle(group: IntegrationGroup): string {
  return INTEGRATION_GROUPS.find((entry) => entry.id === group)?.title ?? group;
}
