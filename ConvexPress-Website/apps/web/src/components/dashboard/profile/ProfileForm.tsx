import { useRef } from "react";
import { Loader2 } from "lucide-react";

import type { UserProfile } from "@/lib/dashboard/types";
import { useProfileForm } from "@/hooks/useProfileForm";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DashboardCard } from "../DashboardCard";
import { AvatarUploader } from "./AvatarUploader";
import { BioEditor } from "./BioEditor";
import { DisplayNameSelector } from "./DisplayNameSelector";
import { SocialLinksForm } from "./SocialLinksForm";

interface ProfileFormProps {
  user: UserProfile;
}

/**
 * Full profile editing form for the website dashboard.
 * Read-only fields: email, firstName, lastName (managed by auth provider).
 * Editable fields: displayName, nickname, websiteUrl, bio, socialLinks.
 *
 * All form state, validation, and submission logic is managed by
 * the useProfileForm hook. This component is a pure rendering layer.
 */
export function ProfileForm({ user }: ProfileFormProps) {
  const formRef = useRef<HTMLFormElement>(null);

  const {
    nickname,
    displayName,
    websiteUrl,
    bio,
    socialLinks,
    setNickname,
    setDisplayName,
    setWebsiteUrl,
    setBio,
    setSocialLinks,
    isDirty,
    isSubmitting,
    errors,
    socialErrors,
    handleSubmit,
    focusFirstInvalid,
  } = useProfileForm({ user });

  const onSubmit = async (e: React.FormEvent) => {
    await handleSubmit(e);
    // Focus the first invalid field on validation failure (#184)
    if (Object.keys(errors).length > 0 || Object.keys(socialErrors).length > 0) {
      focusFirstInvalid(formRef.current);
    }
  };

  return (
    <form ref={formRef} onSubmit={onSubmit} className="space-y-6" noValidate>
      {/* Avatar Section */}
      <DashboardCard title="Profile Photo">
        <AvatarUploader user={user} />
      </DashboardCard>

      {/* Account Information (read-only) */}
      <DashboardCard
        title="Account Information"
        description="These fields are managed by your authentication provider."
      >
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="profile-email">Email</Label>
            <Input
              id="profile-email"
              type="email"
              value={user.email}
              disabled
              aria-describedby="email-note"
            />
            <p id="email-note" className="text-[10px] text-muted-foreground">
              Managed by your authentication provider
            </p>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="profile-first-name">First Name</Label>
              <Input
                id="profile-first-name"
                type="text"
                value={user.firstName ?? ""}
                disabled
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="profile-last-name">Last Name</Label>
              <Input
                id="profile-last-name"
                type="text"
                value={user.lastName ?? ""}
                disabled
              />
            </div>
          </div>
        </div>
      </DashboardCard>

      {/* Editable Profile Fields */}
      <DashboardCard title="Public Profile">
        <div className="space-y-4">
          <div className="space-y-1.5">
            <DisplayNameSelector
              user={user}
              value={displayName}
              onChange={setDisplayName}
            />
            {errors.displayName && (
              <p className="text-[10px] text-destructive" role="alert">
                {errors.displayName}
              </p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="profile-nickname">Nickname</Label>
            <Input
              id="profile-nickname"
              type="text"
              value={nickname}
              onChange={(e) => setNickname(e.target.value)}
              placeholder="Your nickname"
              maxLength={50}
              aria-invalid={Boolean(errors.nickname)}
              aria-describedby={errors.nickname ? "nickname-error" : undefined}
            />
            {errors.nickname && (
              <p id="nickname-error" className="text-[10px] text-destructive" role="alert">
                {errors.nickname}
              </p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="profile-website">Website</Label>
            <Input
              id="profile-website"
              type="url"
              value={websiteUrl}
              onChange={(e) => setWebsiteUrl(e.target.value)}
              placeholder="https://example.com"
              aria-invalid={Boolean(errors.websiteUrl)}
              aria-describedby={errors.websiteUrl ? "website-error" : undefined}
            />
            {errors.websiteUrl && (
              <p id="website-error" className="text-[10px] text-destructive" role="alert">
                {errors.websiteUrl}
              </p>
            )}
          </div>

          <BioEditor
            value={bio}
            onChange={setBio}
            error={errors.bio}
          />
        </div>
      </DashboardCard>

      {/* Social Links */}
      <DashboardCard title="Social Profiles">
        <SocialLinksForm
          value={socialLinks}
          onChange={setSocialLinks}
          errors={socialErrors}
        />
      </DashboardCard>

      {/* Submit */}
      <div className="flex items-center justify-end gap-3">
        {isDirty && (
          <span className="text-[10px] text-muted-foreground">
            Unsaved changes
          </span>
        )}
        <Button type="submit" disabled={isSubmitting || !isDirty}>
          {isSubmitting && <Loader2 className="size-3.5 animate-spin" />}
          <span>{isSubmitting ? "Saving..." : "Save Profile"}</span>
        </Button>
      </div>
    </form>
  );
}
