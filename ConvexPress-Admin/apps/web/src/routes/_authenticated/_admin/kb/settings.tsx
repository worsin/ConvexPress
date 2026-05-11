/**
 * KB Settings Route - /admin/kb/settings
 *
 * KB-specific settings: general, features, search config.
 * Wired to api.kb.settings.getKbSettings / updateKbSettings
 */

import { useState, useEffect, useReducer } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation } from "convex/react";
import { useQuery } from "convex-helpers/react/cache";
import { api } from "@backend/convex/_generated/api";
import { RoutePermissionGuard } from "@/lib/route-permission-guard";
import { toast } from "sonner";
import { Save } from "lucide-react";
import {
  CredentialField,
  SECRET_SENTINEL,
} from "@/components/settings/integrations/CredentialField";

// ─── Form State ──────────────────────────────────────────────────────────────

type KBSettingsState = {
  general: {
    siteName: string;
    siteDescription: string;
    homepageLayout: "categories" | "search" | "featured";
    articlesPerPage: number;
  };
  features: {
    commentsEnabled: boolean;
    bookmarksEnabled: boolean;
    progressTrackingEnabled: boolean;
    ratingsEnabled: boolean;
    relatedArticlesEnabled: boolean;
  };
  search: {
    meilisearchEnabled: boolean;
    meilisearchUrl: string;
    meilisearchApiKey: string;
    ragEnabled: boolean;
    ragProvider: "openai" | "anthropic";
    ragApiKey: string;
    ragModel: string;
  };
};

type KBSettingsAction =
  | { type: "SET_GENERAL"; field: keyof KBSettingsState["general"]; value: string | number }
  | { type: "SET_FEATURES"; field: keyof KBSettingsState["features"]; value: boolean }
  | { type: "SET_SEARCH"; field: keyof KBSettingsState["search"]; value: string | boolean }
  | { type: "RESET"; payload: KBSettingsState };

const DEFAULT_STATE: KBSettingsState = {
  general: { siteName: "", siteDescription: "", homepageLayout: "categories", articlesPerPage: 20 },
  features: { commentsEnabled: true, bookmarksEnabled: true, progressTrackingEnabled: true, ratingsEnabled: true, relatedArticlesEnabled: true },
  search: { meilisearchEnabled: false, meilisearchUrl: "", meilisearchApiKey: "", ragEnabled: false, ragProvider: "openai", ragApiKey: "", ragModel: "" },
};

function settingsReducer(state: KBSettingsState, action: KBSettingsAction): KBSettingsState {
  switch (action.type) {
    case "SET_GENERAL":
      return { ...state, general: { ...state.general, [action.field]: action.value } };
    case "SET_FEATURES":
      return { ...state, features: { ...state.features, [action.field]: action.value } };
    case "SET_SEARCH":
      return { ...state, search: { ...state.search, [action.field]: action.value } };
    case "RESET":
      return action.payload;
    default:
      return state;
  }
}

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

  const [form, dispatch] = useReducer(settingsReducer, DEFAULT_STATE);
  const [isSaving, setIsSaving] = useState(false);

  // Convenience accessors
  const { general, features, search } = form;

  // Sync state from loaded settings
  useEffect(() => {
    if (!settings) return;
    // Access settings sections -- property access is type-safe because the
    // returned defaults object and the local shape use the same keys.
    const g = settings.general as Record<string, unknown>;
    const f = settings.features as Record<string, unknown>;
    const s = settings.search as Record<string, unknown>;
    dispatch({
      type: "RESET",
      payload: {
        general: {
          siteName: (g?.siteName as string) ?? "",
          siteDescription: (g?.siteDescription as string) ?? "",
          homepageLayout: (g?.homepageLayout as "categories" | "search" | "featured") ?? "categories",
          articlesPerPage: (g?.articlesPerPage as number) ?? 20,
        },
        features: {
          commentsEnabled: (f?.commentsEnabled as boolean) ?? true,
          bookmarksEnabled: (f?.bookmarksEnabled as boolean) ?? true,
          progressTrackingEnabled: (f?.progressTrackingEnabled as boolean) ?? true,
          ratingsEnabled: (f?.ratingsEnabled as boolean) ?? true,
          relatedArticlesEnabled: (f?.relatedArticlesEnabled as boolean) ?? true,
        },
        search: {
          meilisearchEnabled: (s?.meilisearchEnabled as boolean) ?? false,
          meilisearchUrl: (s?.meilisearchUrl as string) ?? "",
          meilisearchApiKey: (s?.meilisearchApiKey as string) ?? "",
          ragEnabled: (s?.ragEnabled as boolean) ?? false,
          ragProvider: (s?.ragProvider as "openai" | "anthropic") ?? "openai",
          ragApiKey: (s?.ragApiKey as string) ?? "",
          ragModel: (s?.ragModel as string) ?? "",
        },
      },
    });
  }, [settings]);

  async function handleSave() {
    setIsSaving(true);
    try {
      await updateSettings({
        general: {
          siteName: general.siteName || undefined,
          siteDescription: general.siteDescription || undefined,
          homepageLayout: general.homepageLayout,
          articlesPerPage: general.articlesPerPage,
        },
        features: {
          commentsEnabled: features.commentsEnabled,
          bookmarksEnabled: features.bookmarksEnabled,
          progressTrackingEnabled: features.progressTrackingEnabled,
          ratingsEnabled: features.ratingsEnabled,
          relatedArticlesEnabled: features.relatedArticlesEnabled,
        },
        search: {
          meilisearchEnabled: search.meilisearchEnabled,
          meilisearchUrl: search.meilisearchUrl || undefined,
          meilisearchApiKey:
            search.meilisearchApiKey === SECRET_SENTINEL
              ? SECRET_SENTINEL
              : search.meilisearchApiKey || undefined,
          ragEnabled: search.ragEnabled,
          ragProvider: search.ragProvider,
          ragApiKey:
            search.ragApiKey === SECRET_SENTINEL
              ? SECRET_SENTINEL
              : search.ragApiKey || undefined,
          ragModel: search.ragModel || undefined,
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
            value={general.siteName}
            onChange={(e) => dispatch({ type: "SET_GENERAL", field: "siteName", value: e.target.value })}
            placeholder="Help Center"
            className="w-full px-3 py-1.5 text-sm border border-border rounded-md bg-card"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-foreground/70 mb-1">Site Description</label>
          <input
            type="text"
            value={general.siteDescription}
            onChange={(e) => dispatch({ type: "SET_GENERAL", field: "siteDescription", value: e.target.value })}
            placeholder="Find answers to your questions"
            className="w-full px-3 py-1.5 text-sm border border-border rounded-md bg-card"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-foreground/70 mb-1">Homepage Layout</label>
          <select
            value={general.homepageLayout}
            onChange={(e) => dispatch({ type: "SET_GENERAL", field: "homepageLayout", value: e.target.value })}
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
            value={general.articlesPerPage}
            onChange={(e) => dispatch({ type: "SET_GENERAL", field: "articlesPerPage", value: Number(e.target.value) })}
            className="w-full max-w-xs px-3 py-1.5 text-sm border border-border rounded-md bg-card"
          />
        </div>
      </div>

      {/* Features */}
      <div className="rounded-lg border border-border p-6 space-y-3">
        <h2 className="text-lg font-semibold">Features</h2>
        {([
          { id: "comments", label: "Comments", field: "commentsEnabled" as const },
          { id: "bookmarks", label: "Bookmarks", field: "bookmarksEnabled" as const },
          { id: "progress", label: "Reading Progress Tracking", field: "progressTrackingEnabled" as const },
          { id: "ratings", label: "Star Ratings", field: "ratingsEnabled" as const },
          { id: "related", label: "Related Articles", field: "relatedArticlesEnabled" as const },
        ]).map((feat) => (
          <div key={feat.id} className="flex items-center justify-between">
            <label htmlFor={`feat-${feat.id}`} className="text-sm text-foreground/80">{feat.label}</label>
            <input
              id={`feat-${feat.id}`}
              type="checkbox"
              checked={features[feat.field]}
              onChange={(e) => dispatch({ type: "SET_FEATURES", field: feat.field, value: e.target.checked })}
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
            <label htmlFor="search-meilisearch" className="text-sm font-medium text-foreground/80">Meilisearch</label>
            <input
              id="search-meilisearch"
              type="checkbox"
              checked={search.meilisearchEnabled}
              onChange={(e) => dispatch({ type: "SET_SEARCH", field: "meilisearchEnabled", value: e.target.checked })}
              className="h-4 w-4 rounded border-border"
            />
          </div>
          {search.meilisearchEnabled && (
            <>
              <div>
                <label className="block text-xs font-medium text-foreground/70 mb-1">Meilisearch URL</label>
                <input
                  type="url"
                  value={search.meilisearchUrl}
                  onChange={(e) => dispatch({ type: "SET_SEARCH", field: "meilisearchUrl", value: e.target.value })}
                  placeholder="https://localhost:7700"
                  className="w-full px-3 py-1.5 text-sm border border-border rounded-md bg-card"
                />
              </div>
              <CredentialField
                id="kb-meilisearch-api-key"
                label="Meilisearch API Key"
                value={search.meilisearchApiKey}
                onChange={(value) =>
                  dispatch({
                    type: "SET_SEARCH",
                    field: "meilisearchApiKey",
                    value: value ?? SECRET_SENTINEL,
                  })
                }
                placeholder="Master key or search key"
              />
            </>
          )}
        </div>

        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <label htmlFor="search-rag" className="text-sm font-medium text-foreground/80">AI Search (RAG)</label>
            <input
              id="search-rag"
              type="checkbox"
              checked={search.ragEnabled}
              onChange={(e) => dispatch({ type: "SET_SEARCH", field: "ragEnabled", value: e.target.checked })}
              className="h-4 w-4 rounded border-border"
            />
          </div>
          {search.ragEnabled && (
            <>
              <div>
                <label className="block text-xs font-medium text-foreground/70 mb-1">Provider</label>
                <select
                  value={search.ragProvider}
                  onChange={(e) => dispatch({ type: "SET_SEARCH", field: "ragProvider", value: e.target.value })}
                  className="w-full max-w-xs px-3 py-1.5 text-sm border border-border rounded-md bg-card"
                >
                  <option value="openai">OpenAI</option>
                  <option value="anthropic">Anthropic</option>
                </select>
              </div>
              <CredentialField
                id="kb-rag-api-key"
                label="API Key"
                value={search.ragApiKey}
                onChange={(value) =>
                  dispatch({
                    type: "SET_SEARCH",
                    field: "ragApiKey",
                    value: value ?? SECRET_SENTINEL,
                  })
                }
                placeholder="Provider API key"
              />
              <div>
                <label className="block text-xs font-medium text-foreground/70 mb-1">Model</label>
                <input
                  type="text"
                  value={search.ragModel}
                  onChange={(e) => dispatch({ type: "SET_SEARCH", field: "ragModel", value: e.target.value })}
                  placeholder={search.ragProvider === "openai" ? "text-embedding-3-small" : "claude-3-haiku-20240307"}
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
