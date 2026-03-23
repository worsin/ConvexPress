/**
 * SeoSettingsSocial - Organization, social profiles, Open Graph defaults.
 */

import { useState, useEffect, useCallback, useMemo } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { useSeoSetting } from "@/hooks/seo/useSeoSettings";
import { useSeoMutations } from "@/hooks/seo/useSeoMutations";
import { TWITTER_CARD_TYPES } from "@/lib/seo/constants";
import { useDebouncedAutosave } from "./useDebouncedAutosave";

export function SeoSettingsSocial() {
  const settingsData = useSeoSetting("social");
  const { updateGlobal } = useSeoMutations();

  const [organizationName, setOrganizationName] = useState("");
  const [organizationLogo, setOrganizationLogo] = useState("");
  const [facebookUrl, setFacebookUrl] = useState("");
  const [twitterUsername, setTwitterUsername] = useState("");
  const [instagramUrl, setInstagramUrl] = useState("");
  const [linkedinUrl, setLinkedinUrl] = useState("");
  const [youtubeUrl, setYoutubeUrl] = useState("");
  const [pinterestUrl, setPinterestUrl] = useState("");
  const [defaultOgImage, setDefaultOgImage] = useState("");
  const [twitterCardType, setTwitterCardType] = useState<"summary" | "summary_large_image">("summary_large_image");
  const [facebookAppId, setFacebookAppId] = useState("");

  useEffect(() => {
    if (settingsData?.value) {
      const v = settingsData.value as Record<string, unknown>;
      setOrganizationName((v.organizationName as string) ?? "");
      setOrganizationLogo((v.organizationLogo as string) ?? "");
      setFacebookUrl((v.facebookUrl as string) ?? "");
      setTwitterUsername((v.twitterUsername as string) ?? "");
      setInstagramUrl((v.instagramUrl as string) ?? "");
      setLinkedinUrl((v.linkedinUrl as string) ?? "");
      setYoutubeUrl((v.youtubeUrl as string) ?? "");
      setPinterestUrl((v.pinterestUrl as string) ?? "");
      setDefaultOgImage((v.defaultOgImage as string) ?? "");
      setTwitterCardType((v.twitterCardType as "summary" | "summary_large_image") ?? "summary_large_image");
      setFacebookAppId((v.facebookAppId as string) ?? "");
    }
  }, [settingsData]);

  const nextValue = useMemo(
    () => ({
      organizationName,
      organizationLogo,
      facebookUrl,
      twitterUsername,
      instagramUrl,
      linkedinUrl,
      youtubeUrl,
      pinterestUrl,
      defaultOgImage,
      twitterCardType,
      facebookAppId,
    }),
    [
      organizationName,
      organizationLogo,
      facebookUrl,
      twitterUsername,
      instagramUrl,
      linkedinUrl,
      youtubeUrl,
      pinterestUrl,
      defaultOgImage,
      twitterCardType,
      facebookAppId,
    ],
  );
  const currentValue = (settingsData?.value ?? {}) as Record<string, unknown>;
  const currentSignature = useMemo(() => JSON.stringify(currentValue), [currentValue]);
  const nextSignature = useMemo(() => JSON.stringify(nextValue), [nextValue]);
  const hasChanges = settingsData !== undefined && currentSignature !== nextSignature;

  const saveMutation = useCallback(async () => {
    await updateGlobal({
      key: "social",
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
      {/* Organization */}
      <div className="space-y-3">
        <h4 className="text-xs font-semibold text-foreground">Organization</h4>
        <div className="space-y-1">
          <Label className="text-xs font-medium">Organization Name</Label>
          <Input value={organizationName} onChange={(e) => setOrganizationName(e.target.value)} placeholder="Your Organization" className="h-8 text-xs" />
        </div>
        <div className="space-y-1">
          <Label className="text-xs font-medium">Organization Logo URL</Label>
          <Input value={organizationLogo} onChange={(e) => setOrganizationLogo(e.target.value)} placeholder="https://..." className="h-8 text-xs" />
        </div>
      </div>

      {/* Social Profiles */}
      <div className="space-y-3">
        <h4 className="text-xs font-semibold text-foreground">Social Profiles</h4>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label className="text-xs font-medium">Facebook URL</Label>
            <Input value={facebookUrl} onChange={(e) => setFacebookUrl(e.target.value)} placeholder="https://facebook.com/..." className="h-8 text-xs" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs font-medium">Twitter Username</Label>
            <Input value={twitterUsername} onChange={(e) => setTwitterUsername(e.target.value)} placeholder="username (without @)" className="h-8 text-xs" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs font-medium">Instagram URL</Label>
            <Input value={instagramUrl} onChange={(e) => setInstagramUrl(e.target.value)} placeholder="https://instagram.com/..." className="h-8 text-xs" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs font-medium">LinkedIn URL</Label>
            <Input value={linkedinUrl} onChange={(e) => setLinkedinUrl(e.target.value)} placeholder="https://linkedin.com/..." className="h-8 text-xs" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs font-medium">YouTube URL</Label>
            <Input value={youtubeUrl} onChange={(e) => setYoutubeUrl(e.target.value)} placeholder="https://youtube.com/..." className="h-8 text-xs" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs font-medium">Pinterest URL</Label>
            <Input value={pinterestUrl} onChange={(e) => setPinterestUrl(e.target.value)} placeholder="https://pinterest.com/..." className="h-8 text-xs" />
          </div>
        </div>
      </div>

      {/* Open Graph */}
      <div className="space-y-3">
        <h4 className="text-xs font-semibold text-foreground">Open Graph Defaults</h4>
        <div className="space-y-1">
          <Label className="text-xs font-medium">Default OG Image URL</Label>
          <Input value={defaultOgImage} onChange={(e) => setDefaultOgImage(e.target.value)} placeholder="https://... (1200x630 recommended)" className="h-8 text-xs" />
          <p className="text-[11px] text-muted-foreground">Fallback image when a post has no featured image and no custom OG image.</p>
        </div>
        <div className="space-y-1">
          <Label className="text-xs font-medium">Default Twitter Card Type</Label>
          <select
            value={twitterCardType}
            onChange={(e) => setTwitterCardType(e.target.value as "summary" | "summary_large_image")}
            className="w-full h-8 border border-border bg-transparent px-2.5 text-xs rounded-none outline-hidden focus:border-ring focus:ring-1 focus:ring-ring/50"
          >
            {TWITTER_CARD_TYPES.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        </div>
        <div className="space-y-1">
          <Label className="text-xs font-medium">Facebook App ID</Label>
          <Input value={facebookAppId} onChange={(e) => setFacebookAppId(e.target.value)} placeholder="Optional" className="h-8 text-xs" />
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
