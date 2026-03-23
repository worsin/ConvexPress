/**
 * SeoSettingsVerification - Search engine verification codes.
 */

import { useState, useEffect, useCallback, useMemo } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { useSeoSetting } from "@/hooks/seo/useSeoSettings";
import { useSeoMutations } from "@/hooks/seo/useSeoMutations";
import { useDebouncedAutosave } from "./useDebouncedAutosave";

export function SeoSettingsVerification() {
  const settingsData = useSeoSetting("verification");
  const { updateGlobal } = useSeoMutations();

  const [googleSiteVerification, setGoogleSiteVerification] = useState("");
  const [bingSiteVerification, setBingSiteVerification] = useState("");
  const [pinterestVerification, setPinterestVerification] = useState("");
  const [yandexVerification, setYandexVerification] = useState("");

  useEffect(() => {
    if (settingsData?.value) {
      const v = settingsData.value as Record<string, unknown>;
      setGoogleSiteVerification((v.googleSiteVerification as string) ?? "");
      setBingSiteVerification((v.bingSiteVerification as string) ?? "");
      setPinterestVerification((v.pinterestVerification as string) ?? "");
      setYandexVerification((v.yandexVerification as string) ?? "");
    }
  }, [settingsData]);

  const nextValue = useMemo(
    () => ({
      googleSiteVerification,
      bingSiteVerification,
      pinterestVerification,
      yandexVerification,
    }),
    [googleSiteVerification, bingSiteVerification, pinterestVerification, yandexVerification],
  );
  const currentValue = (settingsData?.value ?? {}) as Record<string, unknown>;
  const currentSignature = useMemo(() => JSON.stringify(currentValue), [currentValue]);
  const nextSignature = useMemo(() => JSON.stringify(nextValue), [nextValue]);
  const hasChanges = settingsData !== undefined && currentSignature !== nextSignature;

  const saveMutation = useCallback(async () => {
    await updateGlobal({
      key: "verification",
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
        Add verification codes to prove site ownership to search engines. Enter only the code/content value, not the full meta tag.
      </p>

      <div className="space-y-4">
        <div className="space-y-1">
          <Label className="text-xs font-medium">Google Site Verification</Label>
          <Input value={googleSiteVerification} onChange={(e) => setGoogleSiteVerification(e.target.value)} placeholder="Enter verification code" maxLength={200} className="h-8 text-xs font-mono" />
          <p className="text-[10px] text-muted-foreground">From Google Search Console</p>
        </div>

        <div className="space-y-1">
          <Label className="text-xs font-medium">Bing Site Verification</Label>
          <Input value={bingSiteVerification} onChange={(e) => setBingSiteVerification(e.target.value)} placeholder="Enter verification code" maxLength={200} className="h-8 text-xs font-mono" />
          <p className="text-[10px] text-muted-foreground">From Bing Webmaster Tools</p>
        </div>

        <div className="space-y-1">
          <Label className="text-xs font-medium">Pinterest Verification</Label>
          <Input value={pinterestVerification} onChange={(e) => setPinterestVerification(e.target.value)} placeholder="Enter verification code" maxLength={200} className="h-8 text-xs font-mono" />
        </div>

        <div className="space-y-1">
          <Label className="text-xs font-medium">Yandex Verification</Label>
          <Input value={yandexVerification} onChange={(e) => setYandexVerification(e.target.value)} placeholder="Enter verification code" maxLength={200} className="h-8 text-xs font-mono" />
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
