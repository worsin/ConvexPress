/**
 * SeoSettingsGeneral - Title separator, site title, tagline, homepage defaults.
 */

import { useState, useEffect, useCallback, useMemo } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { useSeoSetting } from "@/hooks/seo/useSeoSettings";
import { useSeoMutations } from "@/hooks/seo/useSeoMutations";
import { TemplateVariableInput } from "./TemplateVariableInput";
import { CharacterCounter } from "./CharacterCounter";
import { SEPARATOR_OPTIONS, META_DESCRIPTION_RECOMMENDED_MIN, META_DESCRIPTION_RECOMMENDED_MAX, META_DESCRIPTION_MAX } from "@/lib/seo/constants";
import { previewTemplate } from "@/lib/seo/templates";
import { useDebouncedAutosave } from "./useDebouncedAutosave";

export function SeoSettingsGeneral() {
  const settingsData = useSeoSetting("titles");
  const { updateGlobal } = useSeoMutations();

  const [separator, setSeparator] = useState("|");
  const [siteTitle, setSiteTitle] = useState("");
  const [tagline, setTagline] = useState("");
  const [homepageTitle, setHomepageTitle] = useState("%%sitename%% %%sep%% %%tagline%%");
  const [homepageDescription, setHomepageDescription] = useState("");

  useEffect(() => {
    if (settingsData?.value) {
      const v = settingsData.value as Record<string, unknown>;
      setSeparator((v.separator as string) ?? "|");
      setSiteTitle((v.siteTitle as string) ?? "");
      setTagline((v.tagline as string) ?? "");
      setHomepageTitle((v.homepageTitle as string) ?? "%%sitename%% %%sep%% %%tagline%%");
      setHomepageDescription((v.homepageDescription as string) ?? "");
    }
  }, [settingsData]);

  const currentValue = (settingsData?.value ?? {}) as Record<string, unknown>;
  const nextValue = useMemo(
    () => ({
      ...currentValue,
      separator,
      siteTitle,
      tagline,
      homepageTitle,
      homepageDescription,
    }),
    [currentValue, separator, siteTitle, tagline, homepageTitle, homepageDescription],
  );
  const currentSignature = useMemo(() => JSON.stringify(currentValue), [currentValue]);
  const nextSignature = useMemo(() => JSON.stringify(nextValue), [nextValue]);
  const hasChanges = settingsData !== undefined && currentSignature !== nextSignature;

  const saveMutation = useCallback(async () => {
    await updateGlobal({
      key: "titles",
      value: JSON.stringify(nextValue),
    });
  }, [nextValue, updateGlobal]);
  const { status, error } = useDebouncedAutosave({
    enabled: hasChanges,
    signature: nextSignature,
    onSave: saveMutation,
  });

  const homepagePreview = previewTemplate(homepageTitle, {
    siteTitle: siteTitle || "My Site",
    separator,
    tagline: tagline || "Just another ConvexPress site",
  });
  const statusText =
    status === "saving"
      ? "Saving..."
      : status === "pending"
        ? "Saving shortly..."
        : status === "error"
          ? error ?? "Autosave failed."
          : "All changes saved.";

  if (settingsData === undefined) {
    return <div className="py-8 text-center text-xs text-muted-foreground">Loading settings...</div>;
  }

  return (
    <div className="space-y-6">
      {/* Separator */}
      <div className="space-y-2">
        <Label className="text-xs font-medium">Title Separator</Label>
        <div className="flex flex-wrap gap-1.5">
          {SEPARATOR_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => setSeparator(opt.value)}
              className={cn(
                "w-8 h-8 flex items-center justify-center text-sm border transition-colors",
                separator === opt.value
                  ? "border-primary bg-primary/10 text-foreground"
                  : "border-border text-muted-foreground hover:border-foreground",
              )}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* Site Title */}
      <div className="space-y-1">
        <Label className="text-xs font-medium">Site Title (SEO Override)</Label>
        <Input
          value={siteTitle}
          onChange={(e) => setSiteTitle(e.target.value)}
          placeholder="Uses site title from Settings > General"
          className="h-8 text-xs"
        />
        <p className="text-[11px] text-muted-foreground">
          Override the site title used in SEO templates. Leave empty to use the default.
        </p>
      </div>

      {/* Tagline */}
      <div className="space-y-1">
        <Label className="text-xs font-medium">Tagline (SEO Override)</Label>
        <Input
          value={tagline}
          onChange={(e) => setTagline(e.target.value)}
          placeholder="Uses tagline from Settings > General"
          className="h-8 text-xs"
        />
      </div>

      {/* Homepage Title Template */}
      <div className="space-y-1">
        <Label className="text-xs font-medium">Homepage Title Template</Label>
        <TemplateVariableInput
          value={homepageTitle}
          onChange={setHomepageTitle}
          placeholder="%%sitename%% %%sep%% %%tagline%%"
          preview={homepagePreview}
        />
      </div>

      {/* Homepage Description */}
      <div className="space-y-1">
        <div className="flex items-center justify-between">
          <Label className="text-xs font-medium">Homepage Meta Description</Label>
          <CharacterCounter
            current={homepageDescription.length}
            recommendedMin={META_DESCRIPTION_RECOMMENDED_MIN}
            recommendedMax={META_DESCRIPTION_RECOMMENDED_MAX}
            max={META_DESCRIPTION_MAX}
          />
        </div>
        <textarea
          value={homepageDescription}
          onChange={(e) => setHomepageDescription(e.target.value)}
          placeholder="Describe your site for search engines"
          maxLength={META_DESCRIPTION_MAX}
          className={cn(
            "w-full min-h-[60px] resize-y bg-transparent",
            "border border-border px-2.5 py-1.5 text-xs",
            "rounded-none outline-hidden",
            "placeholder:text-muted-foreground",
            "focus:border-ring focus:ring-1 focus:ring-ring/50",
          )}
        />
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
