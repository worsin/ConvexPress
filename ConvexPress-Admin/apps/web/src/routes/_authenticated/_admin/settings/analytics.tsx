/**
 * Analytics Settings Page
 *
 * GA4 connection management: configure property ID, upload service account
 * credentials, test connection, view status, and disconnect.
 *
 * Also shows built-in analytics tracking toggle.
 *
 * Unlike other settings pages, this does NOT use the useSettingsForm hook
 * because GA4 connection has a custom flow (test -> connect, not autosave).
 */

import { useState, useCallback, useEffect } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useAction } from "convex/react";
import { api } from "@backend/convex/_generated/api";
import { toast } from "sonner";
import {
  CheckCircle2,
  XCircle,
  AlertCircle,
  Loader2,
  Trash2,
  RefreshCcw,
  Upload,
  ExternalLink,
} from "lucide-react";
import { cn } from "@/lib/utils";

export const Route = createFileRoute(
  "/_authenticated/_admin/settings/analytics",
)({
  component: AnalyticsSettingsPage,
});

function AnalyticsSettingsPage() {
  const connectionStatus = useQuery(api.ga4.queries.getConnectionStatus);
  const analyticsSettings = useQuery(api.settings.queries.getBySection, {
    section: "analytics" as const,
  }) as
    | {
        trackingEnabled?: boolean;
        respectDoNotTrack?: boolean;
        retentionDays?: number;
      }
    | null
    | undefined;
  const updateAnalyticsSettings = useMutation(api.analytics.mutations.updateSettings);
  const saveConnection = useMutation(api.ga4.mutations.saveConnectionSettings);
  const disconnectGA4 = useMutation(api.ga4.mutations.disconnect);
  const clearCache = useMutation(api.ga4.mutations.clearCache);
  const testConnection = useAction(api.ga4.actions.testConnection);

  // Form state (only used when not connected)
  const [propertyId, setPropertyId] = useState("");
  const [serviceAccountJson, setServiceAccountJson] = useState("");
  const [isTesting, setIsTesting] = useState(false);
  const [testError, setTestError] = useState<string | null>(null);
  const [trackingEnabled, setTrackingEnabled] = useState(true);
  const [respectDoNotTrack, setRespectDoNotTrack] = useState(true);
  const [retentionDays, setRetentionDays] = useState(90);
  const [isSavingAnalytics, setIsSavingAnalytics] = useState(false);

  // Disconnect confirmation
  const [showDisconnectConfirm, setShowDisconnectConfirm] = useState(false);

  const isConnected = connectionStatus?.connected ?? false;

  useEffect(() => {
    if (!analyticsSettings) return;
    setTrackingEnabled(analyticsSettings.trackingEnabled ?? true);
    setRespectDoNotTrack(analyticsSettings.respectDoNotTrack ?? true);
    setRetentionDays(analyticsSettings.retentionDays ?? 90);
  }, [analyticsSettings]);

  const handleSaveAnalyticsSettings = useCallback(async () => {
    setIsSavingAnalytics(true);
    try {
      await updateAnalyticsSettings({
        trackingEnabled,
        respectDoNotTrack,
        retentionDays,
      });
      toast.success("Analytics settings saved.");
    } catch {
      toast.error("Failed to save analytics settings.");
    } finally {
      setIsSavingAnalytics(false);
    }
  }, [
    trackingEnabled,
    respectDoNotTrack,
    retentionDays,
    updateAnalyticsSettings,
  ]);

  // ─── Handle Test & Connect ───────────────────────────────────────────

  const handleTestAndConnect = useCallback(async () => {
    setTestError(null);
    setIsTesting(true);

    try {
      const result = await testConnection({
        propertyId: propertyId.trim(),
        serviceAccountJson: serviceAccountJson.trim(),
      });

      if (result.success) {
        // Save connection settings
        await saveConnection({
          propertyId: propertyId.trim(),
          serviceAccountClientEmail: result.clientEmail ?? "",
        });
        toast.success("GA4 connected successfully!");
        setPropertyId("");
        setServiceAccountJson("");
      } else {
        setTestError(result.error ?? "Connection test failed");
        toast.error("GA4 connection failed");
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      setTestError(msg);
      toast.error("GA4 connection failed");
    } finally {
      setIsTesting(false);
    }
  }, [propertyId, serviceAccountJson, testConnection, saveConnection]);

  // ─── Handle Disconnect ───────────────────────────────────────────────

  const handleDisconnect = useCallback(async () => {
    try {
      await disconnectGA4();
      setShowDisconnectConfirm(false);
      toast.success("GA4 disconnected. Dashboards will use built-in analytics.");
    } catch {
      toast.error("Failed to disconnect GA4");
    }
  }, [disconnectGA4]);

  // ─── Handle Clear Cache ──────────────────────────────────────────────

  const handleClearCache = useCallback(async () => {
    try {
      const result = await clearCache();
      toast.success(
        `Cleared ${result.purged} cached entries. Fresh data will be fetched.`,
      );
    } catch {
      toast.error("Failed to clear cache");
    }
  }, [clearCache]);

  // ─── Handle File Upload ──────────────────────────────────────────────

  const handleFileUpload = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;

      if (!file.name.endsWith(".json")) {
        setTestError("Please upload a .json file");
        return;
      }

      const reader = new FileReader();
      reader.onload = (event) => {
        const text = event.target?.result as string;
        try {
          // Validate it's valid JSON
          JSON.parse(text);
          setServiceAccountJson(text);
          setTestError(null);
        } catch {
          setTestError("Invalid JSON file");
        }
      };
      reader.readAsText(file);
    },
    [],
  );

  // Loading gate AFTER all hooks so hook order stays stable across renders.
  if (connectionStatus === undefined || analyticsSettings === undefined) {
    return (
      <div className="mx-auto max-w-3xl p-6">
        <div className="animate-pulse space-y-6">
          <div className="h-8 w-48 rounded bg-muted" />
          <div className="h-32 rounded bg-muted" />
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl p-6">
      {/* Page Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-foreground">
          Analytics Settings
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Manage built-in analytics and connect Google Analytics 4.
        </p>
      </div>

      <div className="mb-6 rounded-lg border border-border bg-card p-6">
        <div className="mb-4">
          <h2 className="text-lg font-semibold text-foreground">
            Built-in Analytics
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Control local page-event tracking and data retention.
          </p>
        </div>

        <div className="space-y-4">
          <label className="flex items-start justify-between gap-4">
            <span>
              <span className="block text-sm font-medium text-foreground">
                Enable tracking
              </span>
              <span className="block text-xs text-muted-foreground">
                Collect page events for built-in analytics reports.
              </span>
            </span>
            <input
              type="checkbox"
              checked={trackingEnabled}
              onChange={(event) => setTrackingEnabled(event.target.checked)}
              className="mt-1 h-4 w-4 rounded border-border"
            />
          </label>

          <label className="flex items-start justify-between gap-4">
            <span>
              <span className="block text-sm font-medium text-foreground">
                Respect Do Not Track
              </span>
              <span className="block text-xs text-muted-foreground">
                Skip tracking when a browser sends the DNT signal.
              </span>
            </span>
            <input
              type="checkbox"
              checked={respectDoNotTrack}
              onChange={(event) => setRespectDoNotTrack(event.target.checked)}
              className="mt-1 h-4 w-4 rounded border-border"
            />
          </label>

          <div>
            <label
              htmlFor="analytics-retention-days"
              className="block text-sm font-medium text-foreground"
            >
              Retention days
            </label>
            <input
              id="analytics-retention-days"
              type="number"
              min={1}
              max={3650}
              value={retentionDays}
              onChange={(event) => setRetentionDays(Number(event.target.value))}
              className="mt-1 w-full max-w-xs rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
            />
            <p className="mt-1 text-xs text-muted-foreground">
              Raw page events older than this are purged by the scheduled job.
            </p>
          </div>

          <button
            type="button"
            onClick={handleSaveAnalyticsSettings}
            disabled={isSavingAnalytics}
            className="rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
          >
            {isSavingAnalytics ? "Saving..." : "Save Analytics Settings"}
          </button>
        </div>
      </div>

      {/* Connection Status Section */}
      {isConnected ? (
        <div className="space-y-6">
          {/* Connected State */}
          <div className="rounded-lg border border-border bg-card p-6">
            <div className="flex items-center gap-3 mb-4">
              <CheckCircle2 className="h-5 w-5 text-success" />
              <h2 className="text-lg font-semibold text-foreground">
                Google Analytics 4 Connected
              </h2>
            </div>

            <div className="space-y-3">
              <div className="flex justify-between items-center py-2 border-b border-border">
                <span className="text-sm text-muted-foreground">
                  Property ID
                </span>
                <span className="text-sm font-mono text-foreground">
                  {connectionStatus.propertyId}
                </span>
              </div>
              <div className="flex justify-between items-center py-2 border-b border-border">
                <span className="text-sm text-muted-foreground">
                  Service Account
                </span>
                <span className="text-sm text-foreground">
                  {connectionStatus.serviceAccountEmail}
                </span>
              </div>
              <div className="flex justify-between items-center py-2 border-b border-border">
                <span className="text-sm text-muted-foreground">Last Sync</span>
                <span className="text-sm text-foreground">
                  {connectionStatus.lastSync
                    ? new Date(connectionStatus.lastSync).toLocaleString()
                    : "Not synced yet"}
                </span>
              </div>
              {connectionStatus.error && (
                <div className="flex items-start gap-2 rounded-md bg-destructive/10 p-3 mt-2">
                  <AlertCircle className="h-4 w-4 text-destructive mt-0.5 shrink-0" />
                  <p className="text-sm text-destructive">
                    {connectionStatus.error}
                  </p>
                </div>
              )}
            </div>

            {/* Actions */}
            <div className="flex gap-3 mt-6">
              <button
                type="button"
                onClick={handleClearCache}
                className="inline-flex items-center gap-2 rounded-md bg-muted px-3 py-2 text-sm font-medium text-foreground hover:bg-muted/80 transition-colors"
              >
                <RefreshCcw className="h-4 w-4" />
                Clear Cache
              </button>
              <button
                type="button"
                onClick={() => setShowDisconnectConfirm(true)}
                className="inline-flex items-center gap-2 rounded-md bg-destructive/10 px-3 py-2 text-sm font-medium text-destructive hover:bg-destructive/20 transition-colors"
              >
                <Trash2 className="h-4 w-4" />
                Disconnect GA4
              </button>
            </div>
          </div>

          {/* Disconnect Confirmation */}
          {showDisconnectConfirm && (
            <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-6">
              <h3 className="text-sm font-semibold text-destructive mb-2">
                Confirm Disconnect
              </h3>
              <p className="text-sm text-muted-foreground mb-4">
                This will remove GA4 settings and purge all cached data.
                Dashboards will fall back to built-in analytics. You will also
                need to manually remove the{" "}
                <code className="rounded bg-muted px-1 py-0.5 text-xs">
                  GA4_SERVICE_ACCOUNT_JSON
                </code>{" "}
                environment variable.
              </p>
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={handleDisconnect}
                  className="rounded-md bg-destructive px-3 py-2 text-sm font-medium text-white hover:bg-destructive/90 transition-colors"
                >
                  Yes, Disconnect
                </button>
                <button
                  type="button"
                  onClick={() => setShowDisconnectConfirm(false)}
                  className="rounded-md bg-muted px-3 py-2 text-sm font-medium text-foreground hover:bg-muted/80 transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      ) : (
        /* Not Connected State */
        <div className="space-y-6">
          {/* Info Callout */}
          <div className="rounded-lg border border-border bg-muted/30 p-4">
            <h3 className="text-sm font-semibold text-foreground mb-2">
              How to connect Google Analytics 4
            </h3>
            <ol className="list-decimal list-inside space-y-1.5 text-sm text-muted-foreground">
              <li>
                Create a{" "}
                <a
                  href="https://console.cloud.google.com/iam-admin/serviceaccounts"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary underline inline-flex items-center gap-1"
                >
                  Google Cloud service account
                  <ExternalLink className="h-3 w-3" />
                </a>
              </li>
              <li>Download the service account JSON key file</li>
              <li>
                In your GA4 property, go to Admin &gt; Property Access Management
                and add the service account email as a Viewer
              </li>
              <li>
                Set the JSON key as an environment variable:{" "}
                <code className="rounded bg-muted px-1 py-0.5 text-xs">
                  npx convex env set GA4_SERVICE_ACCOUNT_JSON "$(cat key.json)"
                </code>
              </li>
              <li>
                Enter your GA4 property ID below and click Test &amp; Connect
              </li>
            </ol>
          </div>

          {/* Connection Form */}
          <div className="rounded-lg border border-border bg-card p-6">
            <h2 className="text-lg font-semibold text-foreground mb-4">
              Connect GA4
            </h2>

            <div className="space-y-4">
              {/* Property ID */}
              <div>
                <label
                  htmlFor="ga4-property-id"
                  className="block text-sm font-medium text-foreground mb-1"
                >
                  GA4 Property ID
                </label>
                <input
                  id="ga4-property-id"
                  type="text"
                  value={propertyId}
                  onChange={(e) => setPropertyId(e.target.value)}
                  placeholder="properties/123456789"
                  className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                />
                <p className="mt-1 text-xs text-muted-foreground">
                  Found in GA4 Admin &gt; Property Settings. Format:
                  properties/XXXXXXXXX
                </p>
              </div>

              {/* Service Account JSON */}
              <div>
                <label
                  htmlFor="ga4-service-account"
                  className="block text-sm font-medium text-foreground mb-1"
                >
                  Service Account JSON (for testing only)
                </label>
                <div className="space-y-2">
                  {/* File upload */}
                  <label
                    className={cn(
                      "flex cursor-pointer items-center justify-center gap-2 rounded-md border-2 border-dashed border-border px-4 py-6 transition-colors",
                      "hover:border-primary/50 hover:bg-muted/50",
                    )}
                  >
                    <Upload className="h-5 w-5 text-muted-foreground" />
                    <span className="text-sm text-muted-foreground">
                      {serviceAccountJson
                        ? "File loaded. Upload another to replace."
                        : "Drop or click to upload JSON key file"}
                    </span>
                    <input
                      type="file"
                      accept=".json"
                      onChange={handleFileUpload}
                      className="sr-only"
                    />
                  </label>

                  {/* Or paste */}
                  <textarea
                    id="ga4-service-account"
                    value={serviceAccountJson}
                    onChange={(e) => {
                      setServiceAccountJson(e.target.value);
                      setTestError(null);
                    }}
                    placeholder="Paste service account JSON here (or upload above)..."
                    rows={4}
                    className="w-full rounded-md border border-border bg-background px-3 py-2 text-xs font-mono text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                  />
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  Used only for the connection test. The JSON should also be set
                  as the GA4_SERVICE_ACCOUNT_JSON Convex environment variable for
                  production data fetching.
                </p>
              </div>

              {/* Error display */}
              {testError && (
                <div className="flex items-start gap-2 rounded-md bg-destructive/10 p-3">
                  <XCircle className="h-4 w-4 text-destructive mt-0.5 shrink-0" />
                  <p className="text-sm text-destructive">{testError}</p>
                </div>
              )}

              {/* Test & Connect button */}
              <button
                type="button"
                onClick={handleTestAndConnect}
                disabled={
                  isTesting ||
                  !propertyId.trim() ||
                  !serviceAccountJson.trim()
                }
                className={cn(
                  "inline-flex items-center gap-2 rounded-md px-4 py-2 text-sm font-medium transition-colors",
                  "bg-primary text-primary-foreground hover:bg-primary/90",
                  "disabled:opacity-50 disabled:cursor-not-allowed",
                )}
              >
                {isTesting ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Testing Connection...
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="h-4 w-4" />
                    Test &amp; Connect
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
