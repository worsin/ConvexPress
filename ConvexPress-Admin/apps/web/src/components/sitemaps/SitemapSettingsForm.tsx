/**
 * SitemapSettingsForm - Main settings form for sitemap configuration.
 *
 * Contains all settings sections:
 *   - Enable/disable master toggle
 *   - Content type rows (Posts, Pages, Categories, Tags, Authors)
 *   - Homepage priority and changefreq
 *   - Max URLs per sitemap
 *   - Search engine ping settings
 *   - Auto-regeneration settings
 *
 * Changes are persisted via debounced autosave through updateSettings mutation.
 *
 * React 19: Uses state adjustments during render for server-sync reset and
 * debounced autosave for a real-time editing workflow.
 */

import { useState, useCallback, useEffect, useRef } from "react";
import { Loader2 } from "lucide-react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { SitemapContentTypeRow } from "./SitemapContentTypeRow";
import { SitemapPingSettings } from "./SitemapPingSettings";
import { SitemapAutoRegenSettings } from "./SitemapAutoRegenSettings";
import {
  CONTENT_SITEMAP_TYPES,
  CONTENT_TYPE_LABELS,
  CONTENT_TYPE_DESCRIPTIONS,
  CHANGEFREQ_OPTIONS,
  VALIDATION,
} from "@/lib/sitemaps/constants";
import type { SitemapSettings, SitemapChangefreq } from "@/lib/sitemaps/types";

interface SitemapSettingsFormProps {
  settings: SitemapSettings;
  isLoading: boolean;
  onSave: (settings: Partial<SitemapSettings>) => Promise<boolean>;
}

export function SitemapSettingsForm({
  settings,
  isLoading,
  onSave,
}: SitemapSettingsFormProps) {
  // Fix A1: Instead of useEffect to sync props -> state, track the last-seen
  // server settings reference. When it changes, reset local state directly
  // during render (React 19 pattern: adjust state during render).
  const prevSettingsRef = useRef<SitemapSettings>(settings);
  const [localSettings, setLocalSettings] = useState<SitemapSettings>(settings);
  const [isDirty, setIsDirty] = useState(false);
  const [saveStatus, setSaveStatus] = useState<"idle" | "pending" | "saving" | "saved" | "error">("idle");
  const autosaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  if (prevSettingsRef.current !== settings) {
    prevSettingsRef.current = settings;
    setLocalSettings(settings);
    setIsDirty(false);
    setSaveStatus("idle");
  }

  const updateField = useCallback(
    <K extends keyof SitemapSettings>(key: K, value: SitemapSettings[K]) => {
      setLocalSettings((prev) => ({ ...prev, [key]: value }));
      setIsDirty(true);
    },
    [],
  );

  const computeDiff = useCallback((): Partial<SitemapSettings> => {
    return Object.fromEntries(
      (Object.keys(localSettings) as Array<keyof SitemapSettings>)
        .filter((key) => localSettings[key] !== settings[key])
        .map((key) => [key, localSettings[key]]),
    ) as Partial<SitemapSettings>;
  }, [localSettings, settings]);

  // Debounced autosave for real-time settings persistence.
  useEffect(() => {
    if (!isDirty) return;

    const diff = computeDiff();
    if (Object.keys(diff).length === 0) {
      setIsDirty(false);
      setSaveStatus("idle");
      return;
    }

    if (autosaveTimerRef.current) {
      clearTimeout(autosaveTimerRef.current);
      autosaveTimerRef.current = null;
    }

    setSaveStatus("pending");

    autosaveTimerRef.current = setTimeout(() => {
      autosaveTimerRef.current = null;
      setSaveStatus("saving");

      void onSave(diff).then((success) => {
        if (success) {
          setIsDirty(false);
          setSaveStatus("saved");
          return;
        }
        setSaveStatus("error");
      });
    }, 500);

    return () => {
      if (autosaveTimerRef.current) {
        clearTimeout(autosaveTimerRef.current);
        autosaveTimerRef.current = null;
      }
    };
  }, [computeDiff, isDirty, onSave]);

  if (isLoading) {
    return (
      <Card>
        <CardContent>
          <div className="py-8 text-center text-xs text-muted-foreground">
            Loading settings...
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* Master Toggle */}
      <Card>
        <CardHeader>
          <CardTitle>XML Sitemap</CardTitle>
          <CardDescription>
            Control whether XML sitemaps are generated and served for search engines.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-start gap-3">
            <Checkbox
              checked={localSettings.enabled}
              onCheckedChange={(checked) => updateField("enabled", checked === true)}
            />
            <div>
              <Label className="text-xs font-medium">Enable XML Sitemap</Label>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                When enabled, your sitemap will be available at <code>/sitemap.xml</code> and
                referenced in <code>robots.txt</code>.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Content Types */}
      {localSettings.enabled && (
        <Card>
          <CardHeader>
            <CardTitle>Content Types</CardTitle>
            <CardDescription>
              Choose which content types to include in your sitemap and configure their crawl hints.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div>
              {CONTENT_SITEMAP_TYPES.map((type) => {
                const includeKey = `include_${type}` as keyof SitemapSettings;
                const changefreqKey = `changefreq_${type}` as keyof SitemapSettings;
                const priorityKey = `priority_${type}` as keyof SitemapSettings;

                return (
                  <SitemapContentTypeRow
                    key={type}
                    type={type}
                    label={CONTENT_TYPE_LABELS[type]}
                    description={CONTENT_TYPE_DESCRIPTIONS[type]}
                    enabled={localSettings[includeKey] as boolean}
                    changefreq={localSettings[changefreqKey] as SitemapChangefreq}
                    priority={localSettings[priorityKey] as number}
                    onEnabledChange={(val) => updateField(includeKey, val)}
                    onChangefreqChange={(val) => updateField(changefreqKey, val)}
                    onPriorityChange={(val) => updateField(priorityKey, val)}
                  />
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Homepage Settings */}
      {localSettings.enabled && (
        <Card>
          <CardHeader>
            <CardTitle>Homepage</CardTitle>
            <CardDescription>
              Configure how the homepage appears in the sitemap.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-start gap-4">
              <div className="w-28">
                <label className="text-[11px] text-muted-foreground block mb-1">Changefreq</label>
                <select
                  value={localSettings.changefreq_homepage}
                  onChange={(e) => updateField("changefreq_homepage", e.target.value as SitemapChangefreq)}
                  className="dark:bg-input/30 border-input focus-visible:border-ring focus-visible:ring-ring/50 h-7 rounded-none border bg-transparent px-2 py-1 text-xs transition-colors focus-visible:ring-1 w-full min-w-0 outline-hidden appearance-none"
                >
                  {CHANGEFREQ_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="w-20">
                <label className="text-[11px] text-muted-foreground block mb-1">Priority</label>
                <input
                  type="number"
                  min={VALIDATION.PRIORITY_MIN}
                  max={VALIDATION.PRIORITY_MAX}
                  step={VALIDATION.PRIORITY_STEP}
                  value={localSettings.priority_homepage}
                  onChange={(e) => {
                    const val = parseFloat(e.target.value);
                    if (!isNaN(val) && val >= VALIDATION.PRIORITY_MIN && val <= VALIDATION.PRIORITY_MAX) {
                      updateField("priority_homepage", val);
                    }
                  }}
                  className="dark:bg-input/30 border-input focus-visible:border-ring focus-visible:ring-ring/50 h-7 rounded-none border bg-transparent px-2 py-1 text-xs transition-colors focus-visible:ring-1 w-full min-w-0 outline-hidden"
                />
              </div>

              <div className="w-28">
                <label className="text-[11px] text-muted-foreground block mb-1">Max URLs/Page</label>
                <input
                  type="number"
                  min={VALIDATION.MAX_URLS_MIN}
                  max={VALIDATION.MAX_URLS_MAX}
                  value={localSettings.max_urls_per_sitemap}
                  onChange={(e) => {
                    const val = parseInt(e.target.value, 10);
                    if (!isNaN(val) && val >= VALIDATION.MAX_URLS_MIN && val <= VALIDATION.MAX_URLS_MAX) {
                      updateField("max_urls_per_sitemap", val);
                    }
                  }}
                  className="dark:bg-input/30 border-input focus-visible:border-ring focus-visible:ring-ring/50 h-7 rounded-none border bg-transparent px-2 py-1 text-xs transition-colors focus-visible:ring-1 w-full min-w-0 outline-hidden"
                />
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Search Engine Pings */}
      {localSettings.enabled && (
        <Card>
          <CardHeader>
            <CardTitle>Search Engine Notifications</CardTitle>
            <CardDescription>
              Automatically notify search engines when the sitemap is regenerated.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <SitemapPingSettings
              pingGoogle={localSettings.ping_google}
              pingBing={localSettings.ping_bing}
              onPingGoogleChange={(val) => updateField("ping_google", val)}
              onPingBingChange={(val) => updateField("ping_bing", val)}
              disabled={!localSettings.enabled}
            />
          </CardContent>
        </Card>
      )}

      {/* Auto-Regeneration */}
      {localSettings.enabled && (
        <Card>
          <CardHeader>
            <CardTitle>Automatic Regeneration</CardTitle>
            <CardDescription>
              Automatically regenerate the sitemap when content changes.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <SitemapAutoRegenSettings
              autoRegenerate={localSettings.auto_regenerate}
              debounceMs={localSettings.regeneration_debounce_ms}
              onAutoRegenerateChange={(val) => updateField("auto_regenerate", val)}
              onDebounceMsChange={(val) => updateField("regeneration_debounce_ms", val)}
              disabled={!localSettings.enabled}
            />
          </CardContent>
        </Card>
      )}

      {/* Autosave status */}
      <div className="flex items-center justify-end gap-2 text-[11px] text-muted-foreground">
        {(saveStatus === "pending" || saveStatus === "saving") && (
          <>
            <Loader2 className="size-3 animate-spin" />
            <span>Saving changes...</span>
          </>
        )}
        {saveStatus === "saved" && <span>All changes saved</span>}
        {saveStatus === "error" && <span>Autosave failed. Make another change to retry.</span>}
        {saveStatus === "idle" && !isDirty && <span>Autosave enabled</span>}
      </div>
    </div>
  );
}
