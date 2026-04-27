/**
 * SeoSettingsRobots - Robots.txt configuration with live preview and warnings.
 */

import { useState, useEffect, useCallback, useMemo } from "react";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";
import { useQuery } from "convex-helpers/react/cache";
import { api } from "@backend/convex/_generated/api";
import { useSeoSetting } from "@/hooks/seo/useSeoSettings";
import { useSeoMutations } from "@/hooks/seo/useSeoMutations";
import { useDebouncedAutosave } from "./useDebouncedAutosave";

export function SeoSettingsRobots() {
  const settingsData = useSeoSetting("robots");
  const { updateRobots } = useSeoMutations();

  // Live preview from the query
  const robotsTxtPreview = useQuery(api.seo.queries.getRobotsTxt, {});

  const [customRules, setCustomRules] = useState("");
  const [siteNoindex, setSiteNoindex] = useState(false);
  const [blockAiBots, setBlockAiBots] = useState(false);

  useEffect(() => {
    if (settingsData?.value) {
      const v = settingsData.value as Record<string, unknown>;
      setCustomRules((v.customRules as string) ?? "");
      setSiteNoindex((v.siteNoindex as boolean) ?? false);
      setBlockAiBots((v.blockAiBots as boolean) ?? false);
    }
  }, [settingsData]);

  const nextValue = useMemo(
    () => ({
      customRules,
      siteNoindex,
      blockAiBots,
    }),
    [customRules, siteNoindex, blockAiBots],
  );
  const currentValue = (settingsData?.value ?? {}) as Record<string, unknown>;
  const currentSignature = useMemo(() => JSON.stringify(currentValue), [currentValue]);
  const nextSignature = useMemo(() => JSON.stringify(nextValue), [nextValue]);
  const hasChanges = settingsData !== undefined && currentSignature !== nextSignature;

  const saveMutation = useCallback(async () => {
    await updateRobots(nextValue);
  }, [nextValue, updateRobots]);
  const { status, error } = useDebouncedAutosave({
    enabled: hasChanges,
    signature: nextSignature,
    onSave: saveMutation,
  });

  if (settingsData === undefined) {
    return <div className="py-8 text-center text-xs text-muted-foreground">Loading settings...</div>;
  }
  const statusText =
    status === "saving"
      ? "Saving..."
      : status === "pending"
        ? "Saving shortly..."
        : status === "error"
          ? error ?? "Autosave failed."
          : "All changes saved.";

  return (
    <div className="space-y-6">
      {/* RED WARNING BANNER for siteNoindex */}
      {siteNoindex && (
        <div className="flex items-start gap-2 px-3 py-2.5 bg-destructive/10 border border-destructive/30">
          <AlertTriangle className="size-4 text-destructive shrink-0 mt-0.5" />
          <div>
            <p className="text-xs font-semibold text-destructive">
              Search Engine Indexing Discouraged
            </p>
            <p className="text-[11px] text-destructive/80 mt-0.5">
              Your site is set to discourage search engines from indexing all content.
              This means your site will NOT appear in search results.
            </p>
          </div>
        </div>
      )}

      {/* Discourage search engines */}
      <div className="flex items-start gap-2">
        <Checkbox
          checked={siteNoindex}
          onCheckedChange={(c) => setSiteNoindex(!!c)}
        />
        <div>
          <Label className="cursor-pointer text-xs font-medium text-foreground">
            Discourage search engines from indexing this site
          </Label>
          <p className="text-[11px] text-muted-foreground mt-0.5">
            Adds "Disallow: /" to robots.txt for all crawlers.
            Equivalent to WordPress Settings &gt; Reading &gt; "Discourage search engines."
          </p>
        </div>
      </div>

      {/* Block AI crawlers */}
      <div className="flex items-start gap-2">
        <Checkbox
          checked={blockAiBots}
          onCheckedChange={(c) => setBlockAiBots(!!c)}
        />
        <div>
          <Label className="cursor-pointer text-xs font-medium text-foreground">
            Block AI crawlers
          </Label>
          <p className="text-[11px] text-muted-foreground mt-0.5">
            Blocks GPTBot, CCBot, Google-Extended, and anthropic-ai from crawling your site.
          </p>
        </div>
      </div>

      {/* Custom rules */}
      <div className="space-y-1">
        <Label className="text-xs font-medium">Custom Robots.txt Rules</Label>
        <textarea
          value={customRules}
          onChange={(e) => setCustomRules(e.target.value)}
          placeholder="# Add custom robots.txt rules here&#10;# e.g., Disallow: /private/"
          maxLength={10000}
          rows={6}
          className={cn(
            "w-full resize-y bg-transparent font-mono",
            "border border-border px-2.5 py-1.5 text-xs",
            "rounded-none outline-hidden",
            "placeholder:text-muted-foreground",
            "focus:border-ring focus:ring-1 focus:ring-ring/50",
          )}
        />
        <p className="text-[10px] text-muted-foreground">
          {customRules.length}/10,000 characters
        </p>
      </div>

      {/* Live preview */}
      <div className="space-y-1">
        <Label className="text-xs font-medium">Robots.txt Preview</Label>
        <pre className="text-[11px] font-mono bg-muted/50 border border-border p-3 overflow-x-auto whitespace-pre-wrap text-muted-foreground">
          {robotsTxtPreview ?? "Loading preview..."}
        </pre>
      </div>

      <p
        className={cn(
          "text-xs",
          status === "error" ? "text-destructive" : "text-muted-foreground",
        )}
        aria-live="polite"
      >
        {statusText}
      </p>
    </div>
  );
}
