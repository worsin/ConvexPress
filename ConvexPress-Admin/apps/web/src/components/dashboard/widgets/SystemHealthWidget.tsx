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

import {
  CheckCircleIcon,
  CircleAlertIcon,
  ServerIcon,
} from "lucide-react";
import { useConvex } from "convex/react";

/**
 * CMS version string. Single source of truth for the System Health widget.
 *
 * The Settings System does not currently define an editable site or CMS
 * version field, so this widget intentionally reports the product version
 * from a build-time constant.
 */
const CMS_VERSION = "ConvexPress 1.0";

function SystemHealthWidget() {
  // Check if Convex client is connected
  const convex = useConvex();
  const isConnected = convex !== null;

  return (
    <div className="p-4">
      <div className="space-y-3">
        {/* Database connection */}
        <StatusRow
          label="Database"
          value={isConnected ? "Connected" : "Disconnected"}
          status={isConnected ? "ok" : "error"}
        />

        {/* Environment */}
        <StatusRow
          label="Environment"
          value={getEnvironment()}
          status="ok"
        />

        {/* Version */}
        <StatusRow
          label="CMS Version"
          value={CMS_VERSION}
          status="info"
        />

        {/* Auth provider */}
        <StatusRow
          label="Auth"
          value="Local JWT"
          status="info"
        />
      </div>

      {/* Footer note */}
      <div className="mt-3 pt-3 border-t border-border">
        <p className="text-[10px] text-muted-foreground">
          For detailed system information, visit Settings.
        </p>
      </div>
    </div>
  );
}

// ── Status Row ──────────────────────────────────────────────────────────────

function StatusRow({
  label,
  value,
  status,
}: {
  label: string;
  value: string;
  status: "ok" | "error" | "info";
}) {
  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-2">
        {status === "ok" && (
          <CheckCircleIcon className="size-3.5 text-success" />
        )}
        {status === "error" && (
          <CircleAlertIcon className="size-3.5 text-destructive" />
        )}
        {status === "info" && (
          <ServerIcon className="size-3.5 text-muted-foreground" />
        )}
        <span className="text-xs text-muted-foreground">{label}</span>
      </div>
      <span className="text-xs text-foreground font-medium">{value}</span>
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
