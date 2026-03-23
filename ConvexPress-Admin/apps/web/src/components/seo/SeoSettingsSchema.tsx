/**
 * SeoSettingsSchema - Schema.org structured data configuration.
 */

import { useState, useEffect, useCallback, useMemo } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";
import { useSeoSetting } from "@/hooks/seo/useSeoSettings";
import { useSeoMutations } from "@/hooks/seo/useSeoMutations";
import { SCHEMA_ARTICLE_TYPES, SCHEMA_PAGE_TYPES } from "@/lib/seo/constants";
import { useDebouncedAutosave } from "./useDebouncedAutosave";

export function SeoSettingsSchema() {
  const settingsData = useSeoSetting("schema");
  const { updateGlobal } = useSeoMutations();

  const [representType, setRepresentType] = useState<"organization" | "person">("organization");
  const [organizationName, setOrganizationName] = useState("");
  const [organizationLogoUrl, setOrganizationLogoUrl] = useState("");
  const [personName, setPersonName] = useState("");
  const [personImageUrl, setPersonImageUrl] = useState("");
  const [defaultArticleType, setDefaultArticleType] = useState("Article");
  const [defaultPageType, setDefaultPageType] = useState("WebPage");
  const [sitelinksSearchBox, setSitelinksSearchBox] = useState(true);

  useEffect(() => {
    if (settingsData?.value) {
      const v = settingsData.value as Record<string, unknown>;
      setRepresentType((v.representType as "organization" | "person") ?? "organization");
      setOrganizationName((v.organizationName as string) ?? "");
      setOrganizationLogoUrl((v.organizationLogoUrl as string) ?? "");
      setPersonName((v.personName as string) ?? "");
      setPersonImageUrl((v.personImageUrl as string) ?? "");
      setDefaultArticleType((v.defaultArticleType as string) ?? "Article");
      setDefaultPageType((v.defaultPageType as string) ?? "WebPage");
      setSitelinksSearchBox((v.sitelinksSearchBox as boolean) ?? true);
    }
  }, [settingsData]);

  const nextValue = useMemo(
    () => ({
      representType,
      organizationName,
      organizationLogoUrl,
      personName,
      personImageUrl,
      defaultArticleType,
      defaultPageType,
      sitelinksSearchBox,
    }),
    [
      representType,
      organizationName,
      organizationLogoUrl,
      personName,
      personImageUrl,
      defaultArticleType,
      defaultPageType,
      sitelinksSearchBox,
    ],
  );
  const currentValue = (settingsData?.value ?? {}) as Record<string, unknown>;
  const currentSignature = useMemo(() => JSON.stringify(currentValue), [currentValue]);
  const nextSignature = useMemo(() => JSON.stringify(nextValue), [nextValue]);
  const hasChanges = settingsData !== undefined && currentSignature !== nextSignature;

  const saveMutation = useCallback(async () => {
    await updateGlobal({
      key: "schema",
      value: JSON.stringify(nextValue),
    });
  }, [nextValue, updateGlobal]);
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
      <p className="text-xs text-muted-foreground">
        Configure how your site appears in Google's Knowledge Graph and rich results.
      </p>

      {/* Represent Type */}
      <div className="space-y-2">
        <Label className="text-xs font-medium">This site represents</Label>
        <div className="flex gap-4">
          {(["organization", "person"] as const).map((type) => (
            <label key={type} className="flex items-center gap-2 cursor-pointer">
              <input
                type="radio"
                name="representType"
                value={type}
                checked={representType === type}
                onChange={() => setRepresentType(type)}
                className="accent-primary"
              />
              <span className="text-xs capitalize">{type}</span>
            </label>
          ))}
        </div>
      </div>

      {/* Organization fields */}
      {representType === "organization" && (
        <div className="space-y-3 pl-4 border-l-2 border-primary/20">
          <div className="space-y-1">
            <Label className="text-xs font-medium">Organization Name</Label>
            <Input value={organizationName} onChange={(e) => setOrganizationName(e.target.value)} placeholder="Your Organization" className="h-8 text-xs" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs font-medium">Organization Logo URL</Label>
            <Input value={organizationLogoUrl} onChange={(e) => setOrganizationLogoUrl(e.target.value)} placeholder="https://..." className="h-8 text-xs" />
          </div>
        </div>
      )}

      {/* Person fields */}
      {representType === "person" && (
        <div className="space-y-3 pl-4 border-l-2 border-primary/20">
          <div className="space-y-1">
            <Label className="text-xs font-medium">Person Name</Label>
            <Input value={personName} onChange={(e) => setPersonName(e.target.value)} placeholder="Your Name" className="h-8 text-xs" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs font-medium">Person Image URL</Label>
            <Input value={personImageUrl} onChange={(e) => setPersonImageUrl(e.target.value)} placeholder="https://..." className="h-8 text-xs" />
          </div>
        </div>
      )}

      {/* Default types */}
      <div className="space-y-3">
        <h4 className="text-xs font-semibold text-foreground">Default Schema Types</h4>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label className="text-xs font-medium">Default Article Type</Label>
            <select value={defaultArticleType} onChange={(e) => setDefaultArticleType(e.target.value)} className="w-full h-8 border border-border bg-transparent px-2.5 text-xs rounded-none outline-hidden focus:border-ring focus:ring-1 focus:ring-ring/50">
              {SCHEMA_ARTICLE_TYPES.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs font-medium">Default Page Type</Label>
            <select value={defaultPageType} onChange={(e) => setDefaultPageType(e.target.value)} className="w-full h-8 border border-border bg-transparent px-2.5 text-xs rounded-none outline-hidden focus:border-ring focus:ring-1 focus:ring-ring/50">
              {SCHEMA_PAGE_TYPES.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Sitelinks Search Box */}
      <div className="flex items-center gap-2">
        <Checkbox checked={sitelinksSearchBox} onCheckedChange={(c) => setSitelinksSearchBox(!!c)} />
        <Label className="cursor-pointer text-xs font-normal">
          Enable sitelinks search box in Google results
        </Label>
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
