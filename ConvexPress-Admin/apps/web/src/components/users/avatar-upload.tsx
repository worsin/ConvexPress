/**
 * Avatar Upload Component
 *
 * Displays the current avatar with options to upload a new one or remove it.
 *
 * Upload flow:
 *   1. User selects image file
 *   2. File is uploaded to Convex Storage via generateUploadUrl
 *   3. storageId is sent to the uploadAvatar mutation
 *   4. Server resolves URL and patches user
 *
 * Note: Crop dialog is omitted for v1 -- images are uploaded as-is.
 * A crop dialog can be added later using a library like react-image-crop.
 */

import { useRef, useState } from "react";
import { useMutation } from "convex/react";
import { api } from "@backend/convex/_generated/api";
import { CameraIcon, TrashIcon, LoaderIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Avatar } from "@/components/users/avatar";
import { useUploadAvatar, useRemoveAvatar } from "@/hooks/users/useUserMutations";
import type { Id } from "@backend/convex/_generated/dataModel";

interface AvatarUploadProps {
  /** User data for displaying the current avatar. */
  user: {
    _id: Id<"users">;
    avatarUrl?: string;
    profilePictureUrl?: string;
    resolvedAvatarUrl?: string | null;
    displayName?: string;
    avatarStorageId?: string;
  };
  /** Whether this is for another user (admin mode). */
  targetUserId?: Id<"users">;
  /** Whether the upload controls are disabled. */
  disabled?: boolean;
}

export function AvatarUpload({
  user,
  targetUserId,
  disabled = false,
}: AvatarUploadProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [isRemoving, setIsRemoving] = useState(false);

  const generateUploadUrl = useMutation(api.media.mutations.generateUploadUrl);
  const uploadAvatar = useUploadAvatar();
  const removeAvatar = useRemoveAvatar();

  const hasCustomAvatar = Boolean(user.avatarUrl || user.avatarStorageId);

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file type
    if (!file.type.startsWith("image/")) {
      return;
    }

    // Validate file size (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
      return;
    }

    setIsUploading(true);
    try {
      // 1. Get upload URL from Convex
      const uploadUrl = await generateUploadUrl();

      // 2. Upload file to Convex Storage
      const result = await fetch(uploadUrl, {
        method: "POST",
        headers: { "Content-Type": file.type },
        body: file,
      });

      if (!result.ok) {
        throw new Error("Upload failed");
      }

      const { storageId } = await result.json();

      // 3. Call uploadAvatar mutation
      await uploadAvatar({
        userId: targetUserId,
        storageId,
      });
    } catch {
      // Error toast is handled by the hook
    } finally {
      setIsUploading(false);
      // Reset file input
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };

  const handleRemove = async () => {
    setIsRemoving(true);
    try {
      await removeAvatar({ userId: targetUserId });
    } finally {
      setIsRemoving(false);
    }
  };

  return (
    <div className="flex items-center gap-4">
      <Avatar user={user} size="2xl" />

      <div className="flex flex-col gap-2">
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          onChange={handleFileSelect}
          className="hidden"
          disabled={disabled || isUploading}
        />

        <Button
          variant="outline"
          size="sm"
          onClick={() => fileInputRef.current?.click()}
          disabled={disabled || isUploading}
        >
          {isUploading ? (
            <LoaderIcon className="size-3.5 animate-spin" />
          ) : (
            <CameraIcon className="size-3.5" />
          )}
          <span>{isUploading ? "Uploading..." : "Change Photo"}</span>
        </Button>

        {hasCustomAvatar && (
          <Button
            variant="ghost"
            size="sm"
            onClick={handleRemove}
            disabled={disabled || isRemoving}
          >
            {isRemoving ? (
              <LoaderIcon className="size-3.5 animate-spin" />
            ) : (
              <TrashIcon className="size-3.5" />
            )}
            <span>Remove Photo</span>
          </Button>
        )}

        <p className="text-[10px] text-muted-foreground">
          JPG, PNG, or GIF. Max 5MB.
        </p>
      </div>
    </div>
  );
}
