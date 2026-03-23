/**
 * User Form - Shared Profile Form
 *
 * Used by both Edit User page and Your Profile page.
 * Sections:
 *   - Avatar (upload/change/remove)
 *   - Account Information (read-only auth fields)
 *   - Profile Information (nickname, display name, bio, website)
 *   - Social Links
 *   - Preferences (editor mode, notification settings)
 *
 * The caller controls which sections are visible via props.
 */

import { useState, useEffect, useCallback } from "react";
import {
  SaveIcon,
  LoaderIcon,
  ExternalLinkIcon,
  InfoIcon,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { AvatarUpload } from "@/components/users/avatar-upload";
import { DisplayNameSelector } from "@/components/users/display-name-selector";
import { SocialLinksForm } from "@/components/users/social-links-form";
import { UserStatusBadge } from "@/components/users/user-status-badge";
import { cn } from "@/lib/utils";
import { MAX_BIO_LENGTH } from "@/lib/users/constants";
import type { SocialLinks, UserPreferences } from "@/lib/users/types";
import type { Id } from "@backend/convex/_generated/dataModel";

// --- Form Data Shape ---

interface UserFormData {
  nickname: string;
  displayName: string;
  bio: string;
  url: string;
  socialLinks: SocialLinks;
  preferences: UserPreferences;
}

// --- Props ---

interface UserFormProps {
  /** The user data to populate the form with. */
  user: {
    _id: Id<"users">;
    email: string;
    firstName?: string;
    lastName?: string;
    profilePictureUrl?: string;
    avatarUrl?: string;
    avatarStorageId?: string;
    resolvedAvatarUrl?: string | null;
    displayName?: string;
    nickname?: string;
    bio?: string;
    url?: string;
    socialLinks?: SocialLinks;
    preferences?: UserPreferences;
    status: "active" | "inactive" | "banned";
    roleId?: Id<"roles">;
    roleName?: string;
    roleLevel?: number;
    createdAt: number;
    lastLoginAt?: number;
  };
  /** Whether this is the user editing their own profile (hides admin-only sections). */
  isSelfProfile?: boolean;
  /** Called when the form is submitted. */
  onSave: (data: UserFormData) => Promise<boolean>;
  /** Whether the form is currently saving. */
  isSaving?: boolean;
}

export function UserForm({
  user,
  isSelfProfile = false,
  onSave,
  isSaving = false,
}: UserFormProps) {
  // --- Form State ---
  const [nickname, setNickname] = useState(user.nickname ?? "");
  const [displayName, setDisplayName] = useState(user.displayName ?? "");
  const [bio, setBio] = useState(user.bio ?? "");
  const [url, setUrl] = useState(user.url ?? "");
  const [socialLinks, setSocialLinks] = useState<SocialLinks>(
    user.socialLinks ?? {},
  );
  const [preferences, setPreferences] = useState<UserPreferences>(
    user.preferences ?? {},
  );

  // Reset form when user data changes
  useEffect(() => {
    setNickname(user.nickname ?? "");
    setDisplayName(user.displayName ?? "");
    setBio(user.bio ?? "");
    setUrl(user.url ?? "");
    setSocialLinks(user.socialLinks ?? {});
    setPreferences(user.preferences ?? {});
  }, [user._id, user.nickname, user.displayName, user.bio, user.url, user.socialLinks, user.preferences]);

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      await onSave({
        nickname: nickname.trim(),
        displayName: displayName.trim(),
        bio: bio.trim(),
        url: url.trim(),
        socialLinks,
        preferences,
      });
    },
    [nickname, displayName, bio, url, socialLinks, preferences, onSave],
  );

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* --- Avatar Section --- */}
      <section className="border border-border bg-card p-4">
        <h2 className="mb-3 text-sm font-medium text-foreground">
          Profile Photo
        </h2>
        <AvatarUpload
          user={user}
          targetUserId={isSelfProfile ? undefined : user._id}
          disabled={isSaving}
        />
      </section>

      {/* --- Account Information (Read-only auth fields) --- */}
      <section className="border border-border bg-card p-4">
        <div className="mb-3 flex items-center gap-2">
          <h2 className="text-sm font-medium text-foreground">
            Account Information
          </h2>
          <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground">
            <InfoIcon className="size-3" />
            Managed by auth provider
          </span>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">
              Email
            </label>
            <input
              type="email"
              value={user.email}
              disabled
              className="h-8 w-full border border-border bg-muted px-2.5 text-xs text-muted-foreground cursor-not-allowed"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">
              First Name
            </label>
            <input
              type="text"
              value={user.firstName ?? ""}
              disabled
              className="h-8 w-full border border-border bg-muted px-2.5 text-xs text-muted-foreground cursor-not-allowed"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">
              Last Name
            </label>
            <input
              type="text"
              value={user.lastName ?? ""}
              disabled
              className="h-8 w-full border border-border bg-muted px-2.5 text-xs text-muted-foreground cursor-not-allowed"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">
              Status
            </label>
            <div className="flex h-8 items-center gap-2">
              <UserStatusBadge status={user.status} />
              {user.roleName && (
                <span className="text-xs text-muted-foreground">
                  {user.roleName}
                </span>
              )}
            </div>
          </div>
        </div>
        <p className="mt-2 text-[10px] text-muted-foreground">
          These fields are synced from your authentication provider and cannot
          be changed here.
        </p>
      </section>

      {/* --- Profile Information --- */}
      <section className="border border-border bg-card p-4">
        <h2 className="mb-3 text-sm font-medium text-foreground">
          Profile Information
        </h2>
        <div className="space-y-3">
          {/* Nickname */}
          <div>
            <label
              htmlFor="nickname"
              className="mb-1 block text-xs font-medium text-foreground"
            >
              Nickname
            </label>
            <input
              id="nickname"
              type="text"
              value={nickname}
              onChange={(e) => setNickname(e.target.value)}
              placeholder="Choose a nickname"
              disabled={isSaving}
              className={cn(
                "h-8 w-full border border-border bg-background px-2.5 text-xs text-foreground",
                "placeholder:text-muted-foreground/50",
                "focus:border-ring focus:outline-hidden focus:ring-1 focus:ring-ring/50",
                "disabled:cursor-not-allowed disabled:opacity-50",
              )}
            />
          </div>

          {/* Display Name */}
          <DisplayNameSelector
            value={displayName}
            onChange={setDisplayName}
            userId={isSelfProfile ? undefined : user._id}
            disabled={isSaving}
          />

          {/* Website URL */}
          <div>
            <label
              htmlFor="website-url"
              className="mb-1 flex items-center gap-1.5 text-xs font-medium text-foreground"
            >
              <ExternalLinkIcon className="size-3 text-muted-foreground" />
              Website
            </label>
            <input
              id="website-url"
              type="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://example.com"
              disabled={isSaving}
              className={cn(
                "h-8 w-full border border-border bg-background px-2.5 text-xs text-foreground",
                "placeholder:text-muted-foreground/50",
                "focus:border-ring focus:outline-hidden focus:ring-1 focus:ring-ring/50",
                "disabled:cursor-not-allowed disabled:opacity-50",
              )}
            />
          </div>

          {/* Bio */}
          <div>
            <label
              htmlFor="bio"
              className="mb-1 block text-xs font-medium text-foreground"
            >
              Biographical Info
            </label>
            <textarea
              id="bio"
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              placeholder="A short biography..."
              rows={4}
              maxLength={MAX_BIO_LENGTH}
              disabled={isSaving}
              className={cn(
                "w-full border border-border bg-background px-2.5 py-1.5 text-xs text-foreground",
                "placeholder:text-muted-foreground/50",
                "focus:border-ring focus:outline-hidden focus:ring-1 focus:ring-ring/50",
                "disabled:cursor-not-allowed disabled:opacity-50 resize-none",
              )}
            />
            <p className="mt-0.5 text-[10px] text-muted-foreground">
              {bio.length}/{MAX_BIO_LENGTH} characters. Plain text only.
            </p>
          </div>
        </div>
      </section>

      {/* --- Social Links --- */}
      <section className="border border-border bg-card p-4">
        <h2 className="mb-3 text-sm font-medium text-foreground">
          Social Links
        </h2>
        <SocialLinksForm
          value={socialLinks}
          onChange={setSocialLinks}
          disabled={isSaving}
        />
      </section>

      {/* --- Preferences --- */}
      <section className="border border-border bg-card p-4">
        <h2 className="mb-3 text-sm font-medium text-foreground">
          Preferences
        </h2>
        <div className="space-y-3">
          {/* Editor Mode */}
          <div>
            <label
              htmlFor="editor-mode"
              className="mb-1 block text-xs font-medium text-foreground"
            >
              Editor Mode
            </label>
            <select
              id="editor-mode"
              value={preferences.editorMode ?? "visual"}
              onChange={(e) =>
                setPreferences({
                  ...preferences,
                  editorMode: e.target.value as "visual" | "code",
                })
              }
              disabled={isSaving}
              className="h-8 w-full border border-border bg-background px-2.5 text-xs text-foreground focus:border-ring focus:outline-hidden focus:ring-1 focus:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <option value="visual">Visual Editor</option>
              <option value="code">Code Editor</option>
            </select>
          </div>

          {/* Email Digest */}
          <div>
            <label
              htmlFor="email-digest"
              className="mb-1 block text-xs font-medium text-foreground"
            >
              Email Digest
            </label>
            <select
              id="email-digest"
              value={preferences.emailDigest ?? "immediate"}
              onChange={(e) =>
                setPreferences({
                  ...preferences,
                  emailDigest: e.target.value as
                    | "immediate"
                    | "daily"
                    | "weekly"
                    | "none",
                })
              }
              disabled={isSaving}
              className="h-8 w-full border border-border bg-background px-2.5 text-xs text-foreground focus:border-ring focus:outline-hidden focus:ring-1 focus:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <option value="immediate">Send immediately</option>
              <option value="daily">Daily digest</option>
              <option value="weekly">Weekly digest</option>
              <option value="none">No email notifications</option>
            </select>
          </div>

          {/* Notification Toggles */}
          <div className="space-y-2">
            <p className="text-xs font-medium text-foreground">
              Notification Preferences
            </p>

            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={preferences.notifyOnComment ?? true}
                onChange={(e) =>
                  setPreferences({
                    ...preferences,
                    notifyOnComment: e.target.checked,
                  })
                }
                disabled={isSaving}
                className="accent-primary"
              />
              <span className="text-xs text-foreground">
                Email me when someone comments on my post
              </span>
            </label>

            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={preferences.notifyOnReply ?? true}
                onChange={(e) =>
                  setPreferences({
                    ...preferences,
                    notifyOnReply: e.target.checked,
                  })
                }
                disabled={isSaving}
                className="accent-primary"
              />
              <span className="text-xs text-foreground">
                Email me when someone replies to my comment
              </span>
            </label>

            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={preferences.notifyOnMention ?? true}
                onChange={(e) =>
                  setPreferences({
                    ...preferences,
                    notifyOnMention: e.target.checked,
                  })
                }
                disabled={isSaving}
                className="accent-primary"
              />
              <span className="text-xs text-foreground">
                Email me when someone mentions me
              </span>
            </label>
          </div>
        </div>
      </section>

      {/* --- Submit --- */}
      <div className="flex items-center gap-2">
        <Button type="submit" size="sm" disabled={isSaving}>
          {isSaving ? (
            <LoaderIcon className="size-3.5 animate-spin" />
          ) : (
            <SaveIcon className="size-3.5" />
          )}
          <span>{isSaving ? "Saving..." : "Update Profile"}</span>
        </Button>
      </div>
    </form>
  );
}
