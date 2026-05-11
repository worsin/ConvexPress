/**
 * useProfileForm - Manages profile form state, validation, and submission.
 *
 * Extracts all form logic (field state, dirty tracking, Zod validation,
 * error handling, submit handler) from ProfileForm.tsx into a reusable hook.
 *
 * The component becomes a pure rendering layer that consumes this hook's
 * returned state and handlers.
 */

import { useCallback, useMemo, useState } from "react";
import { z } from "zod";

import type {
  SocialLinks,
  UserProfile,

} from "@/lib/dashboard/types";
import { useUserProfile } from "@/hooks/useUserProfile";

/**
 * Zod validation schema for the profile form (#117).
 * Validates all editable fields per PRD profileSchema specification.
 */
const profileSchema = z.object({
  nickname: z
    .string()
    .max(50, "Nickname must be 50 characters or less")
    .optional(),
  displayName: z.string().min(1, "Display name is required"),
  websiteUrl: z
    .string()
    .url("Please enter a valid URL")
    .or(z.literal(""))
    .optional(),
  bio: z.string().max(500, "Bio must be 500 characters or less").optional(),
  socialLinks: z
    .object({
      twitter: z.string().optional(),
      facebook: z
        .string()
        .url("Please enter a valid URL")
        .or(z.literal(""))
        .optional(),
      instagram: z.string().optional(),
      linkedin: z
        .string()
        .url("Please enter a valid URL")
        .or(z.literal(""))
        .optional(),
      github: z.string().optional(),
      youtube: z
        .string()
        .url("Please enter a valid URL")
        .or(z.literal(""))
        .optional(),
    })
    .optional(),
});

export type ValidationErrors = Partial<Record<string, string>>;

interface UseProfileFormOptions {
  user: UserProfile;
}

interface UseProfileFormResult {
  // Field values
  nickname: string;
  displayName: string;
  websiteUrl: string;
  bio: string;
  socialLinks: SocialLinks;

  // Field setters
  setNickname: (value: string) => void;
  setDisplayName: (value: string) => void;
  setWebsiteUrl: (value: string) => void;
  setBio: (value: string) => void;
  setSocialLinks: (value: SocialLinks) => void;

  // Form state
  isDirty: boolean;
  isSubmitting: boolean;
  errors: ValidationErrors;
  socialErrors: Record<string, string>;

  // Actions
  handleSubmit: (e: React.FormEvent) => Promise<void>;
  validateForm: () => boolean;

  /**
   * Focus the first invalid field within a form element.
   * Call this from your form's ref after validation fails.
   */
  focusFirstInvalid: (formElement: HTMLFormElement | null) => void;
}

export function useProfileForm({
  user,
}: UseProfileFormOptions): UseProfileFormResult {
  const { isSubmitting, handleSave } = useUserProfile(user);

  // Form field state
  const [nickname, setNickname] = useState(user.nickname ?? "");
  const [displayName, setDisplayName] = useState(user.displayName);
  const [websiteUrl, setWebsiteUrl] = useState(user.websiteUrl ?? "");
  const [bio, setBio] = useState(user.bio ?? "");
  const [socialLinks, setSocialLinks] = useState<SocialLinks>(
    user.socialLinks ?? {},
  );
  const [errors, setErrors] = useState<ValidationErrors>({});
  const [socialErrors, setSocialErrors] = useState<Record<string, string>>({});

  // Dirty tracking: has any field changed from the original user data?
  const isDirty = useMemo(() => {
    if (nickname !== (user.nickname ?? "")) return true;
    if (displayName !== user.displayName) return true;
    if (websiteUrl !== (user.websiteUrl ?? "")) return true;
    if (bio !== (user.bio ?? "")) return true;
    if (
      JSON.stringify(socialLinks) !== JSON.stringify(user.socialLinks ?? {})
    )
      return true;
    return false;
  }, [nickname, displayName, websiteUrl, bio, socialLinks, user]);

  const focusFirstInvalid = useCallback(
    (formElement: HTMLFormElement | null) => {
      if (!formElement) return;
      requestAnimationFrame(() => {
        const firstInvalid = formElement.querySelector<HTMLElement>(
          "[aria-invalid='true']",
        );
        firstInvalid?.focus();
      });
    },
    [],
  );

  const validateForm = useCallback((): boolean => {
    const formValues = {
      nickname: nickname || undefined,
      displayName,
      websiteUrl: websiteUrl || undefined,
      bio: bio || undefined,
      socialLinks: socialLinks || undefined,
    };

    const result = profileSchema.safeParse(formValues);

    if (result.success) {
      setErrors({});
      setSocialErrors({});
      return true;
    }

    const newErrors: ValidationErrors = {};
    const newSocialErrors: Record<string, string> = {};

    for (const issue of result.error.issues) {
      const path = issue.path;
      if (path[0] === "socialLinks" && path[1]) {
        newSocialErrors[String(path[1])] = issue.message;
      } else if (path[0]) {
        newErrors[String(path[0])] = issue.message;
      }
    }

    setErrors(newErrors);
    setSocialErrors(newSocialErrors);

    return false;
  }, [nickname, displayName, websiteUrl, bio, socialLinks]);

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();

      if (!validateForm()) return;

      await handleSave({
        nickname,
        displayName,
        websiteUrl,
        bio,
        socialLinks,
      });

      // Clear errors on successful save
      setErrors({});
      setSocialErrors({});
    },
    [
      nickname,
      displayName,
      websiteUrl,
      bio,
      socialLinks,
      handleSave,
      validateForm,
    ],
  );

  return {
    // Field values
    nickname,
    displayName,
    websiteUrl,
    bio,
    socialLinks,

    // Field setters
    setNickname,
    setDisplayName,
    setWebsiteUrl,
    setBio,
    setSocialLinks,

    // Form state
    isDirty,
    isSubmitting,
    errors,
    socialErrors,

    // Actions
    handleSubmit,
    validateForm,
    focusFirstInvalid,
  };
}
