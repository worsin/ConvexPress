/**
 * Search Settings & Analytics Page
 *
 * Admin-only page at /admin/settings/search with four sections:
 *   1. Meilisearch Configuration - Host URL, API key, test connection
 *   2. Analytics - Search performance metrics and insights
 *   3. Synonyms - Manage search synonym groups
 *   4. Reindex - Trigger full content reindex
 *
 * Requires search.reindex capability (Administrator only).
 */

import { useState, useCallback, useEffect } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation } from "convex/react";
import { useQuery } from "convex-helpers/react/cache";
import { api } from "@backend/convex/_generated/api";
import { toast } from "sonner";
import {
  Search,
  Key,
  Loader2,
  Save,
  Eye,
  EyeOff,
  CheckCircle,
  XCircle,
  Wifi,
} from "lucide-react";

import { SearchAnalyticsDashboard } from "@/components/admin/SearchAnalyticsDashboard";
import { SynonymManager } from "@/components/admin/SynonymManager";
import { ReindexButton } from "@/components/admin/ReindexButton";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute(
  "/_authenticated/_admin/settings/search",
)({
  component: SearchSettingsPage,
});

// ─── Meilisearch Configuration Section ──────────────────────────────────────

type ConnectionStatus = "idle" | "testing" | "connected" | "error";

function MeilisearchConfigSection() {
  const searchSettings = useQuery(api.settings.queries.getBySection, {
    section: "search",
  });
  const updateSettings = useMutation(api.settings.mutations.updateSection);

  // Form state
  const [meilisearchHost, setMeilisearchHost] = useState("");
  const [meilisearchApiKey, setMeilisearchApiKey] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [showApiKey, setShowApiKey] = useState(false);
  const [connectionStatus, setConnectionStatus] =
    useState<ConnectionStatus>("idle");
  const [connectionError, setConnectionError] = useState("");

  // Sync from server on first load
  const [initialized, setInitialized] = useState(false);

  useEffect(() => {
    if (searchSettings && !initialized) {
      const values = searchSettings as Record<string, unknown>;
      setMeilisearchHost((values.meilisearchHost as string) ?? "");
      setMeilisearchApiKey((values.meilisearchApiKey as string) ?? "");
      setInitialized(true);
    }
  }, [searchSettings, initialized]);

  // Save handler
  const handleSave = useCallback(async () => {
    setIsSaving(true);
    try {
      await updateSettings({
        section: "search",
        values: {
          meilisearchHost,
          meilisearchApiKey,
        },
      });
      toast.success("Search settings saved.");
    } catch (error: unknown) {
      const msg =
        error instanceof Error
          ? error.message
          : "Failed to save search settings.";
      toast.error(msg);
    } finally {
      setIsSaving(false);
    }
  }, [updateSettings, meilisearchHost, meilisearchApiKey]);

  // Test connection -- pings the Meilisearch /health endpoint
  const handleTestConnection = useCallback(async () => {
    if (!meilisearchHost.trim()) {
      toast.error("Please enter a Meilisearch host URL first.");
      return;
    }

    setConnectionStatus("testing");
    setConnectionError("");

    try {
      // Normalize URL (strip trailing slash)
      const host = meilisearchHost.trim().replace(/\/+$/, "");
      const headers: HeadersInit = {
        "Content-Type": "application/json",
      };
      if (meilisearchApiKey.trim()) {
        headers.Authorization = `Bearer ${meilisearchApiKey.trim()}`;
      }

      const response = await fetch(`${host}/health`, {
        method: "GET",
        headers,
      });

      if (response.ok) {
        const data = (await response.json()) as { status?: string };
        if (data.status === "available") {
          setConnectionStatus("connected");
          toast.success("Meilisearch connection successful!");
        } else {
          setConnectionStatus("error");
          setConnectionError(
            `Unexpected health response: ${JSON.stringify(data)}`,
          );
          toast.error("Meilisearch responded but status is not 'available'.");
        }
      } else {
        setConnectionStatus("error");
        setConnectionError(`HTTP ${response.status}: ${response.statusText}`);
        toast.error(`Meilisearch connection failed: ${response.statusText}`);
      }
    } catch (error: unknown) {
      setConnectionStatus("error");
      const msg =
        error instanceof Error ? error.message : "Connection failed.";
      setConnectionError(msg);
      toast.error(`Connection test failed: ${msg}`);
    }
  }, [meilisearchHost, meilisearchApiKey]);

  // Loading state
  if (searchSettings === undefined) {
    return (
      <Card>
        <CardContent className="py-8">
          <div className="animate-pulse space-y-4">
            <div className="h-4 w-48 rounded bg-muted" />
            <div className="h-9 rounded bg-muted" />
            <div className="h-9 rounded bg-muted" />
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <Key className="size-4 text-muted-foreground" />
          <div>
            <CardTitle>Meilisearch Configuration</CardTitle>
            <CardDescription className="mt-0.5">
              Connect your Meilisearch instance for full-text search
              capabilities.
            </CardDescription>
          </div>
        </div>
      </CardHeader>

      <CardContent>
        <div className="flex flex-col gap-4">
          {/* Connection status indicator */}
          {connectionStatus !== "idle" && connectionStatus !== "testing" && (
            <div
              className={
                connectionStatus === "connected"
                  ? "flex items-center gap-2 rounded-md bg-success/10 border border-success/20 p-3 text-sm"
                  : "flex items-start gap-2 rounded-md bg-destructive/10 border border-destructive/20 p-3 text-sm"
              }
            >
              {connectionStatus === "connected" ? (
                <>
                  <CheckCircle className="size-4 text-success shrink-0" />
                  <span className="text-success">
                    Connected to Meilisearch successfully.
                  </span>
                </>
              ) : (
                <>
                  <XCircle className="size-4 text-destructive mt-0.5 shrink-0" />
                  <span className="text-destructive">{connectionError}</span>
                </>
              )}
            </div>
          )}

          {/* Host URL */}
          <div className="space-y-1.5">
            <Label htmlFor="meilisearch-host">Host URL</Label>
            <Input
              id="meilisearch-host"
              type="url"
              value={meilisearchHost}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                setMeilisearchHost(e.target.value)
              }
              placeholder="http://localhost:7700"
            />
            <p className="text-[10px] text-muted-foreground">
              The full URL of your Meilisearch instance. For Meilisearch Cloud,
              use the URL from your project dashboard. Falls back to the
              MEILISEARCH_HOST environment variable if empty.
            </p>
          </div>

          {/* API Key */}
          <div className="space-y-1.5">
            <Label htmlFor="meilisearch-api-key">API Key</Label>
            <div className="relative">
              <Input
                id="meilisearch-api-key"
                type={showApiKey ? "text" : "password"}
                value={meilisearchApiKey}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                  setMeilisearchApiKey(e.target.value)
                }
                placeholder="your-meilisearch-master-key"
                className="pr-10"
              />
              <button
                type="button"
                onClick={() => setShowApiKey((prev) => !prev)}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-muted-foreground hover:text-foreground transition-colors"
                aria-label={showApiKey ? "Hide API key" : "Show API key"}
              >
                {showApiKey ? (
                  <EyeOff className="size-4" />
                ) : (
                  <Eye className="size-4" />
                )}
              </button>
            </div>
            <p className="text-[10px] text-muted-foreground">
              The master key or admin API key for your Meilisearch instance.
              Falls back to the MEILISEARCH_API_KEY environment variable if
              empty.
            </p>
          </div>

          {/* Action buttons */}
          <div className="flex justify-end gap-2 pt-2">
            <Button
              size="sm"
              variant="outline"
              onClick={handleTestConnection}
              disabled={
                connectionStatus === "testing" || !meilisearchHost.trim()
              }
            >
              {connectionStatus === "testing" ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <Wifi className="size-3.5" />
              )}
              <span>
                {connectionStatus === "testing"
                  ? "Testing..."
                  : "Test Connection"}
              </span>
            </Button>

            <Button size="sm" onClick={handleSave} disabled={isSaving}>
              {isSaving ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <Save className="size-3.5" />
              )}
              <span>{isSaving ? "Saving..." : "Save Settings"}</span>
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Main Page ──────────────────────────────────────────────────────────────

function SearchSettingsPage() {
  return (
    <div className="flex flex-col gap-8 p-6">
      {/* Page Header */}
      <div>
        <div className="flex items-center gap-2">
          <Search className="size-5 text-muted-foreground" />
          <h1 className="text-lg font-bold">Search Settings</h1>
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          Configure Meilisearch connection, view analytics, manage synonyms, and
          reindex content.
        </p>
      </div>

      {/* Meilisearch Configuration */}
      <section>
        <MeilisearchConfigSection />
      </section>

      {/* Analytics Section */}
      <section>
        <h2 className="mb-4 text-base font-semibold">Search Analytics</h2>
        <SearchAnalyticsDashboard />
      </section>

      {/* Synonyms Section */}
      <section>
        <SynonymManager />
      </section>

      {/* Reindex Section */}
      <section>
        <div className="rounded-sm border border-border bg-background p-4">
          <h3 className="mb-1 text-sm font-medium">Content Reindex</h3>
          <p className="mb-4 text-xs text-muted-foreground">
            Rebuild the search index from scratch. This may take several minutes
            for large sites. The search will continue to work during reindexing.
          </p>
          <ReindexButton />
        </div>
      </section>
    </div>
  );
}
