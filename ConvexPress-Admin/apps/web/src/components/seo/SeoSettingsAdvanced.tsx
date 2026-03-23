/**
 * SeoSettingsAdvanced - URL cleanup and link behavior settings.
 */

import { useState, useEffect, useCallback, useMemo } from "react";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";
import { useSeoSetting } from "@/hooks/seo/useSeoSettings";
import { useSeoMutations } from "@/hooks/seo/useSeoMutations";
import { useDebouncedAutosave } from "./useDebouncedAutosave";

export function SeoSettingsAdvanced() {
  const settingsData = useSeoSetting("advanced");
  const { updateGlobal } = useSeoMutations();

  const [stripCategoryBase, setStripCategoryBase] = useState(false);
  const [redirectAttachmentUrls, setRedirectAttachmentUrls] = useState(true);
  const [cleanPermalinkFragments, setCleanPermalinkFragments] = useState(true);
  const [nofollowExternalLinks, setNofollowExternalLinks] = useState(false);
  const [openExternalLinksNewTab, setOpenExternalLinksNewTab] = useState(false);

  useEffect(() => {
    if (settingsData?.value) {
      const v = settingsData.value as Record<string, unknown>;
      setStripCategoryBase((v.stripCategoryBase as boolean) ?? false);
      setRedirectAttachmentUrls((v.redirectAttachmentUrls as boolean) ?? true);
      setCleanPermalinkFragments((v.cleanPermalinkFragments as boolean) ?? true);
      setNofollowExternalLinks((v.nofollowExternalLinks as boolean) ?? false);
      setOpenExternalLinksNewTab((v.openExternalLinksNewTab as boolean) ?? false);
    }
  }, [settingsData]);

  const nextValue = useMemo(
    () => ({
      stripCategoryBase,
      redirectAttachmentUrls,
      cleanPermalinkFragments,
      nofollowExternalLinks,
      openExternalLinksNewTab,
    }),
    [
      stripCategoryBase,
      redirectAttachmentUrls,
      cleanPermalinkFragments,
      nofollowExternalLinks,
      openExternalLinksNewTab,
    ],
  );
  const currentValue = (settingsData?.value ?? {}) as Record<string, unknown>;
  const currentSignature = useMemo(() => JSON.stringify(currentValue), [currentValue]);
  const nextSignature = useMemo(() => JSON.stringify(nextValue), [nextValue]);
  const hasChanges = settingsData !== undefined && currentSignature !== nextSignature;

  const saveMutation = useCallback(async () => {
    await updateGlobal({
      key: "advanced",
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
        Advanced URL cleanup and link behavior settings. Only change these if you understand the implications.
      </p>

      {/* URL Cleanup */}
      <div className="space-y-3">
        <h4 className="text-xs font-semibold text-foreground">URL Cleanup</h4>

        <div className="flex items-start gap-2">
          <Checkbox checked={stripCategoryBase} onCheckedChange={(c) => setStripCategoryBase(!!c)} />
          <div>
            <Label className="cursor-pointer text-xs font-normal">Strip the category base from URLs</Label>
            <p className="text-[10px] text-muted-foreground mt-0.5">
              Changes /category/tech/ to /tech/. May cause conflicts if page slugs match category slugs.
            </p>
          </div>
        </div>

        <div className="flex items-start gap-2">
          <Checkbox checked={redirectAttachmentUrls} onCheckedChange={(c) => setRedirectAttachmentUrls(!!c)} />
          <div>
            <Label className="cursor-pointer text-xs font-normal">Redirect attachment URLs to parent post</Label>
            <p className="text-[10px] text-muted-foreground mt-0.5">
              Prevents thin content pages for attachment URLs.
            </p>
          </div>
        </div>

        <div className="flex items-start gap-2">
          <Checkbox checked={cleanPermalinkFragments} onCheckedChange={(c) => setCleanPermalinkFragments(!!c)} />
          <div>
            <Label className="cursor-pointer text-xs font-normal">Clean permalink URL fragments</Label>
            <p className="text-[10px] text-muted-foreground mt-0.5">
              Removes common tracking parameters and fragments from URLs.
            </p>
          </div>
        </div>
      </div>

      {/* Link Behavior */}
      <div className="space-y-3">
        <h4 className="text-xs font-semibold text-foreground">Link Behavior</h4>

        <div className="flex items-start gap-2">
          <Checkbox checked={nofollowExternalLinks} onCheckedChange={(c) => setNofollowExternalLinks(!!c)} />
          <div>
            <Label className="cursor-pointer text-xs font-normal">Add nofollow to all external links</Label>
            <p className="text-[10px] text-muted-foreground mt-0.5">
              Adds rel="nofollow" to links pointing to other domains.
            </p>
          </div>
        </div>

        <div className="flex items-start gap-2">
          <Checkbox checked={openExternalLinksNewTab} onCheckedChange={(c) => setOpenExternalLinksNewTab(!!c)} />
          <div>
            <Label className="cursor-pointer text-xs font-normal">Open external links in a new tab</Label>
            <p className="text-[10px] text-muted-foreground mt-0.5">
              Adds target="_blank" and rel="noopener noreferrer" to external links.
            </p>
          </div>
        </div>
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
