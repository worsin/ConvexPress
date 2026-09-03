/**
 * Dashboard System - System Health Widget
 *
 * Shows basic system status information. Admin only.
 *
 * Displays:
 *   - Convex connection status (inferred from data availability)
 *   - ConvexPress version
 *   - Deployment environment
 *
 * This is a lightweight status widget. More detailed system info
 * lives in the Settings > System Info page.
 */

import { useConvex } from "convex/react";

import { HealthDot } from "@/components/shell/EnvironmentChip";
import { useControlShell } from "@/control/ControlShellContext";
import { environmentDisplayName } from "@/components/shell/environment-presentation";

/**
 * CMS version string. Single source of truth for the System Health widget.
 *
 * The Settings System does not currently define an editable site or CMS
 * version field, so this widget intentionally reports the product version
 * from a build-time constant.
 */
const CMS_VERSION = "ConvexPress 1.0";

function SystemHealthWidget() {
  const convex = useConvex();
  const shell = useControlShell();
  const isConnected = convex !== null;
  const environment = shell?.selectedEnvironment ?? null;

  return (
    <div className="px-[18px] pb-4 pt-1">
      <dl className="divide-y divide-border">
        <StatusRow
          label="Database"
          value={isConnected ? "Connected" : "Disconnected"}
          tone={isConnected ? "ok" : "danger"}
        />
        <StatusRow
          label="Environment"
          value={environment ? environmentDisplayName(environment) : getEnvironment()}
          tone={environment && environment.kind === "live" ? "live" : "ok"}
        />
        <StatusRow label="CMS version" value={CMS_VERSION} tone="quiet" />
        <StatusRow
          label="Auth"
          value={shell ? "Operator session" : "Local JWT"}
          tone="quiet"
        />
      </dl>

      <p className="mt-3 text-[12px] text-muted-foreground">
        For detailed system information, visit Settings.
      </p>
    </div>
  );
}

// ── Status Row ──────────────────────────────────────────────────────────────

function StatusRow({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: "ok" | "danger" | "quiet" | "live";
}) {
  return (
    <div className="flex items-center justify-between py-2 text-[13px]">
      <dt className="flex items-center gap-2 text-ink-2">
        <HealthDot tone={tone} />
        {label}
      </dt>
      <dd className="font-medium text-foreground">{value}</dd>
    </div>
  );
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function getEnvironment(): string {
  const url = typeof window !== "undefined" ? window.location.hostname : "";
  if (url === "localhost" || url === "127.0.0.1") return "Development";
  if (url.includes("staging") || url.includes("preview")) return "Staging";
  return "Production";
}

export default SystemHealthWidget;
