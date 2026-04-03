/**
 * KB Settings Route - /admin/kb/settings
 *
 * KB-specific settings: general, features, search config.
 * Wired to api.kb.settings.getKbSettings / updateKbSettings
 */

import { useState, useEffect } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation } from "convex/react";
import { api } from "@backend/convex/_generated/api";
import { RoutePermissionGuard } from "@/lib/route-permission-guard";
import { toast } from "sonner";
import { Save } from "lucide-react";

export const Route = createFileRoute("/_authenticated/_admin/kb/settings")({
  component: KBSettingsPage,
});

// ─── Page ─────────────────────────────────────────────────────────────────────

function KBSettingsPage() {
  return (
    <RoutePermissionGuard requiredAccess="/admin/kb">
      <KBSettingsForm />
    </RoutePermissionGuard>
  );
}

// ─── Form ─────────────────────────────────────────────────────────────────────

function KBSettingsForm() {
  const settings = useQuery(api.kb.settings.getKbSettings);
  const updateSettings = useMutation(api.kb.settings.updateKbSettings);

  // General
  const [siteName, setSiteName] = useState("");
  const [siteDescription, setSiteDescription] = useState("");
  const [homepageLayout, setHomepageLayout] = useState<"categories" | "search" | "featured">("categories");
  const [articlesPerPage, setArticlesPerPage] = useState(10);

  // Features
  const [commentsEnabled, setCommentsEnabled] = useState(true);
  const [bookmarksEnabled, setBookmarksEnabled] = useState(true);
  const [progressTrackingEnabled, setProgressTrackingEnabled] = useState(true);
  const [ratingsEnabled, setRatingsEnabled] = useState(true);
  const [relatedArticlesEnabled, setRelatedArticlesEnabled] = useState(true);

  // Search
  const [meilisearchEnabled, setMeilisearchEnabled] = useState(false);
  const [meilisearchUrl, setMeilisearchUrl] = useState("");
  const [meilisearchApiKey, setMeilisearchApiKey] = useState("");
  const [ragEnabled, setRagEnabled] = useState(false);
  const [ragProvider, setRagProvider] = useState<"openai" | "anthropic">("openai");
  const [ragApiKey, setRagApiKey] = useState("");
  const [ragModel, setRagModel] = useState("");

  const [isSaving, setIsSaving] = useState(false);

  // Sync state from loaded settings
  useEffect(() => {
    if (!settings) return;
    type G = { siteName?: string; siteDescription?: string; homepageLayout?: "categories" | "search" | "featured"; articlesPerPage?: number };
    type F = { commentsEnabled?: boolean; bookmarksEnabled?: boolean; progressTrackingEnabled?: boolean; ratingsEnabled?: boolean; relatedArticlesEnabled?: boolean };
    type S = { meilisearchEnabled?: boolean; meilisearchUrl?: string; meilisearchApiKey?: string; ragEnabled?: boolean; ragProvider?: "openai" | "anthropic"; ragApiKey?: string; ragModel?: string };
    const g = settings.general as unknown as G;
    const f = settings.features as unknown as F;
    const s = settings.search as unknown as S;
    if (g) {
      setSiteName(g.siteName ?? "");
      setSiteDescription(g.siteDescription ?? "");
      setHomepageLayout(g.homepageLayout ?? "categories");
      setArticlesPerPage(g.articlesPerPage ?? 10);
    }
    if (f) {
      setCommentsEnabled(f.commentsEnabled ?? true);
      setBookmarksEnabled(f.bookmarksEnabled ?? true);
      setProgressTrackingEnabled(f.progressTrackingEnabled ?? true);
      setRatingsEnabled(f.ratingsEnabled ?? true);
      setRelatedArticlesEnabled(f.relatedArticlesEnabled ?? true);
    }
    if (s) {
      setMeilisearchEnabled(s.meilisearchEnabled ?? false);
      setMeilisearchUrl(s.meilisearchUrl ?? "");
      setMeilisearchApiKey(s.meilisearchApiKey ?? "");
      setRagEnabled(s.ragEnabled ?? false);
      setRagProvider(s.ragProvider ?? "openai");
      setRagApiKey(s.ragApiKey ?? "");
      setRagModel(s.ragModel ?? "");
    }
  }, [settings]);

  async function handleSave() {
    setIsSaving(true);
    try {
      await updateSettings({
        general: {
          siteName: siteName || undefined,
          siteDescription: siteDescription || undefined,
          homepageLayout,
          articlesPerPage,
        },
        features: {
          commentsEnabled,
          bookmarksEnabled,
          progressTrackingEnabled,
          ratingsEnabled,
          relatedArticlesEnabled,
        },
        search: {
          meilisearchEnabled,
          meilisearchUrl: meilisearchUrl || undefined,
          meilisearchApiKey: meilisearchApiKey || undefined,
          ragEnabled,
          ragProvider,
          ragApiKey: ragApiKey || undefined,
          ragModel: ragModel || undefined,
        },
      });
      toast.success("KB settings saved");
    } catch (err: unknown) {
      toast.error((err as { data?: { message?: string } })?.data?.message ?? "Failed to save settings");
    } finally {
      setIsSaving(false);
    }
  }

  if (settings === undefined) {
    return <div className="animate-pulse h-96 bg-muted rounded-lg" />;
  }

  return (
    <div className="max-w-2xl space-y-6">
      <h1 className="text-2xl font-bold">KB Settings</h1>

      {/* General */}
      <div className="rounded-lg border border-border p-6 space-y-4">
        <h2 className="text-lg font-semibold">General</h2>

        <div>
          <label className="block text-sm font-medium text-foreground/70 mb-1">Site Name</label>
          <input
            type="text"
            value={siteName}
            onChange={(e) => setSiteName(e.target.value)}
            placeholder="Help Center"
            className="w-full px-3 py-1.5 text-sm border border-border rounded-md bg-card"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-foreground/70 mb-1">Site Description</label>
          <input
            type="text"
            value={siteDescription}
            onChange={(e) => setSiteDescription(e.target.value)}
            placeholder="Find answers to your questions"
            className="w-full px-3 py-1.5 text-sm border border-border rounded-md bg-card"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-foreground/70 mb-1">Homepage Layout</label>
          <select
            value={homepageLayout}
            onChange={(e) => setHomepageLayout(e.target.value as "categories" | "search" | "featured")}
            className="w-full max-w-xs px-3 py-1.5 text-sm border border-border rounded-md bg-card"
          >
            <option value="categories">Categories</option>
            <option value="search">Search-first</option>
            <option value="featured">Featured articles</option>
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-foreground/70 mb-1">Articles per Page</label>
          <input
            type="number"
            min={5}
            max={50}
            value={articlesPerPage}
            onChange={(e) => setArticlesPerPage(Number(e.target.value))}
            className="w-full max-w-xs px-3 py-1.5 text-sm border border-border rounded-md bg-card"
          />
        </div>
      </div>

      {/* Features */}
      <div className="rounded-lg border border-border p-6 space-y-3">
        <h2 className="text-lg font-semibold">Features</h2>
        {[
          { id: "comments", label: "Comments", value: commentsEnabled, set: setCommentsEnabled },
          { id: "bookmarks", label: "Bookmarks", value: bookmarksEnabled, set: setBookmarksEnabled },
          { id: "progress", label: "Reading Progress Tracking", value: progressTrackingEnabled, set: setProgressTrackingEnabled },
          { id: "ratings", label: "Star Ratings", value: ratingsEnabled, set: setRatingsEnabled },
          { id: "related", label: "Related Articles", value: relatedArticlesEnabled, set: setRelatedArticlesEnabled },
        ].map((feat) => (
          <div key={feat.id} className="flex items-center justify-between">
            <label htmlFor={`feat-${feat.id}`} className="text-sm text-foreground/80">{feat.label}</label>
            <input
              id={`feat-${feat.id}`}
              type="checkbox"
              checked={feat.value}
              onChange={(e) => feat.set(e.target.checked)}
              className="h-4 w-4 rounded border-border"
            />
          </div>
        ))}
      </div>

      {/* Search */}
      <div className="rounded-lg border border-border p-6 space-y-4">
        <h2 className="text-lg font-semibold">Search Configuration</h2>

        <div className="space-y-3 border-b border-border pb-4">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-foreground/80">Meilisearch</span>
            <input
              type="checkbox"
              checked={meilisearchEnabled}
              onChange={(e) => setMeilisearchEnabled(e.target.checked)}
              className="h-4 w-4 rounded border-border"
            />
          </div>
          {meilisearchEnabled && (
            <>
              <div>
                <label className="block text-xs font-medium text-foreground/70 mb-1">Meilisearch URL</label>
                <input
                  type="url"
                  value={meilisearchUrl}
                  onChange={(e) => setMeilisearchUrl(e.target.value)}
                  placeholder="https://localhost:7700"
                  className="w-full px-3 py-1.5 text-sm border border-border rounded-md bg-card"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-foreground/70 mb-1">Meilisearch API Key</label>
                <input
                  type="password"
                  value={meilisearchApiKey}
                  onChange={(e) => setMeilisearchApiKey(e.target.value)}
                  placeholder="••••••••"
                  className="w-full px-3 py-1.5 text-sm border border-border rounded-md bg-card"
                />
              </div>
            </>
          )}
        </div>

        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-foreground/80">AI Search (RAG)</span>
            <input
              type="checkbox"
              checked={ragEnabled}
              onChange={(e) => setRagEnabled(e.target.checked)}
              className="h-4 w-4 rounded border-border"
            />
          </div>
          {ragEnabled && (
            <>
              <div>
                <label className="block text-xs font-medium text-foreground/70 mb-1">Provider</label>
                <select
                  value={ragProvider}
                  onChange={(e) => setRagProvider(e.target.value as "openai" | "anthropic")}
                  className="w-full max-w-xs px-3 py-1.5 text-sm border border-border rounded-md bg-card"
                >
                  <option value="openai">OpenAI</option>
                  <option value="anthropic">Anthropic</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-foreground/70 mb-1">API Key</label>
                <input
                  type="password"
                  value={ragApiKey}
                  onChange={(e) => setRagApiKey(e.target.value)}
                  placeholder="••••••••"
                  className="w-full px-3 py-1.5 text-sm border border-border rounded-md bg-card"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-foreground/70 mb-1">Model</label>
                <input
                  type="text"
                  value={ragModel}
                  onChange={(e) => setRagModel(e.target.value)}
                  placeholder={ragProvider === "openai" ? "text-embedding-3-small" : "claude-3-haiku-20240307"}
                  className="w-full px-3 py-1.5 text-sm border border-border rounded-md bg-card"
                />
              </div>
            </>
          )}
        </div>
      </div>

      {/* Save */}
      <button
        onClick={() => void handleSave()}
        disabled={isSaving}
        className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-primary-foreground bg-primary rounded-md hover:bg-primary/90 disabled:opacity-50 transition-colors"
      >
        <Save className="h-4 w-4" />
        {isSaving ? "Saving…" : "Save Settings"}
      </button>
    </div>
  );
}
