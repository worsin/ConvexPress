/**
 * SeoSettingsBreadcrumbs - Breadcrumb trail display settings.
 */

import { useState, useEffect, useCallback, useMemo } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";
import { useSeoSetting } from "@/hooks/seo/useSeoSettings";
import { useSeoMutations } from "@/hooks/seo/useSeoMutations";
import { useDebouncedAutosave } from "./useDebouncedAutosave";

export function SeoSettingsBreadcrumbs() {
  const settingsData = useSeoSetting("breadcrumbs");
  const { updateGlobal } = useSeoMutations();

  const [enabled, setEnabled] = useState(true);
  const [separator, setSeparator] = useState(">");
  const [homeAnchorText, setHomeAnchorText] = useState("Home");
  const [showBlogPage, setShowBlogPage] = useState(true);
  const [boldLastItem, setBoldLastItem] = useState(true);

  useEffect(() => {
    if (settingsData?.value) {
      const v = settingsData.value as Record<string, unknown>;
      setEnabled((v.enabled as boolean) ?? true);
      setSeparator((v.separator as string) ?? ">");
      setHomeAnchorText((v.homeAnchorText as string) ?? "Home");
      setShowBlogPage((v.showBlogPage as boolean) ?? true);
      setBoldLastItem((v.boldLastItem as boolean) ?? true);
    }
  }, [settingsData]);

  const nextValue = useMemo(
    () => ({ enabled, separator, homeAnchorText, showBlogPage, boldLastItem }),
    [enabled, separator, homeAnchorText, showBlogPage, boldLastItem],
  );
  const currentValue = (settingsData?.value ?? {}) as Record<string, unknown>;
  const currentSignature = useMemo(() => JSON.stringify(currentValue), [currentValue]);
  const nextSignature = useMemo(() => JSON.stringify(nextValue), [nextValue]);
  const hasChanges = settingsData !== undefined && currentSignature !== nextSignature;

  const saveMutation = useCallback(async () => {
    await updateGlobal({
      key: "breadcrumbs",
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
        Configure the breadcrumb trail displayed on the website. Breadcrumbs improve navigation and SEO.
      </p>

      <div className="flex items-center gap-2">
        <Checkbox checked={enabled} onCheckedChange={(c) => setEnabled(!!c)} />
        <Label className="cursor-pointer text-xs font-normal">Enable breadcrumbs on the website</Label>
      </div>

      <div className="space-y-1">
        <Label className="text-xs font-medium">Separator Character</Label>
        <Input value={separator} onChange={(e) => setSeparator(e.target.value)} placeholder=">" maxLength={3} className="h-8 text-xs w-20" />
      </div>

      <div className="space-y-1">
        <Label className="text-xs font-medium">Home Anchor Text</Label>
        <Input value={homeAnchorText} onChange={(e) => setHomeAnchorText(e.target.value)} placeholder="Home" className="h-8 text-xs w-40" />
      </div>

      <div className="flex items-center gap-2">
        <Checkbox checked={showBlogPage} onCheckedChange={(c) => setShowBlogPage(!!c)} />
        <Label className="cursor-pointer text-xs font-normal">Include /blog in the breadcrumb trail</Label>
      </div>

      <div className="flex items-center gap-2">
        <Checkbox checked={boldLastItem} onCheckedChange={(c) => setBoldLastItem(!!c)} />
        <Label className="cursor-pointer text-xs font-normal">Bold the last item (current page) in the breadcrumb</Label>
      </div>

      {/* Preview */}
      <div className="px-3 py-2 bg-muted/50 border border-border">
        <p className="text-[10px] text-muted-foreground mb-1">Preview:</p>
        <p className="text-xs text-foreground">
          <span>{homeAnchorText}</span>
          <span className="text-muted-foreground mx-1.5">{separator}</span>
          {showBlogPage && (
            <>
              <span>Blog</span>
              <span className="text-muted-foreground mx-1.5">{separator}</span>
            </>
          )}
          <span className={boldLastItem ? "font-semibold" : ""}>Example Post Title</span>
        </p>
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
