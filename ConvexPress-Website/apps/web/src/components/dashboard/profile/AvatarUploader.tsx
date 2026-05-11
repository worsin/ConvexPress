import { useCallback, useRef, useState } from "react";
import { useMutation } from "convex/react";
import { api } from "@convexpress-website/backend/generated/api";
import { Loader2, Upload, X } from "lucide-react";
import { toast } from "sonner";

import type { UserProfile } from "@/lib/dashboard/types";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { AvatarDisplay } from "./AvatarDisplay";
import { AvatarCropDialog } from "../AvatarCropDialog";

interface AvatarUploaderProps {
  user: UserProfile;
  size?: "sm" | "md" | "lg";
  onUploaded?: () => void;
}

const ACCEPTED_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
];
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB

/**
 * Avatar upload component with preview, crop, upload, and remove functionality.
 * Fallback chain: custom upload > OAuth provider avatar > initials.
 *
 * Upload flow:
 *   1. User selects a file via the hidden file input
 *   2. Client-side validation (type + size)
 *   3. Crop dialog opens with the selected image (1:1 square)
 *   4. User adjusts crop and confirms
 *   5. Cropped blob is uploaded to Convex Storage
 *   6. Call the uploadAvatar mutation with the returned storageId
 *   7. Convex resolves the URL, patches the user, emits event
 */
export function AvatarUploader({
  user,
  size = "lg",
  onUploaded,
}: AvatarUploaderProps) {
  const [isUploading, setIsUploading] = useState(false);
  const [isRemoving, setIsRemoving] = useState(false);
  const [cropDialogOpen, setCropDialogOpen] = useState(false);
  const [cropImageSrc, setCropImageSrc] = useState<string>("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const generateUploadUrl = useMutation(api.media.mutations.generateUploadUrl);
  const uploadAvatar = useMutation(api.profiles.mutations.uploadAvatar);
  const removeAvatar = useMutation(api.profiles.mutations.removeAvatar);

  /**
   * Handle file selection -- validate and open the crop dialog.
   */
  const handleFileChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (!file) return;

      // Validate file type
      if (!ACCEPTED_TYPES.includes(file.type)) {
        toast.error("Please select a JPEG, PNG, WebP, or GIF image.");
        return;
      }

      // Validate file size
      if (file.size > MAX_FILE_SIZE) {
        toast.error("Image must be less than 5MB.");
        return;
      }

      // Read the file as a data URL and open the crop dialog
      const reader = new FileReader();
      reader.onload = () => {
        const dataUrl = reader.result as string;
        setCropImageSrc(dataUrl);
        setCropDialogOpen(true);
      };
      reader.onerror = () => {
        toast.error("Failed to read image file.");
      };
      reader.readAsDataURL(file);

      // Reset the file input so selecting the same file works again
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    },
    [],
  );

  /**
   * Handle the cropped blob from the crop dialog -- upload to Convex Storage.
   */
  const handleCropComplete = useCallback(
    async (croppedBlob: Blob) => {
      setIsUploading(true);
      try {
        // 1. Get upload URL from Convex Storage
        const uploadUrl = await generateUploadUrl();

        // 2. Upload the cropped blob
        const result = await fetch(uploadUrl, {
          method: "POST",
          headers: { "Content-Type": croppedBlob.type },
          body: croppedBlob,
        });

        if (!result.ok) {
          throw new Error("Upload failed");
        }

        const { storageId } = await result.json();

        // 3. Save avatar reference via mutation
        await uploadAvatar({ storageId });

        toast.success("Profile avatar updated");
        onUploaded?.();
      } catch (error: unknown) {
        const message =
          error instanceof Error ? error.message : "Failed to upload avatar";
        toast.error(message);
      } finally {
        setIsUploading(false);
        // Clean up the data URL
        setCropImageSrc("");
      }
    },
    [onUploaded, generateUploadUrl, uploadAvatar],
  );

  const handleRemove = useCallback(async () => {
    setIsRemoving(true);
    try {
      await removeAvatar({});
      toast.success("Avatar removed");
    } catch (error: unknown) {
      const message =
        error instanceof Error ? error.message : "Failed to remove avatar";
      toast.error(message);
    } finally {
      setIsRemoving(false);
    }
  }, [removeAvatar]);

  const hasCustomAvatar = Boolean(user.avatarUrl);

  return (
    <div data-slot="avatar-uploader" className="flex flex-col items-center gap-3">
      <AvatarDisplay
        avatarUrl={user.avatarUrl}
        oauthAvatarUrl={user.oauthAvatarUrl}
        displayName={user.displayName}
        size={size}
      />

      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          disabled={isUploading}
          onClick={() => fileInputRef.current?.click()}
        >
          {isUploading ? (
            <Loader2 className="size-3.5 animate-spin" />
          ) : (
            <Upload className="size-3.5" />
          )}
          <span>{isUploading ? "Uploading..." : "Change Photo"}</span>
        </Button>

        {hasCustomAvatar && (
          <Button
            variant="ghost"
            size="sm"
            disabled={isRemoving}
            onClick={handleRemove}
            className={cn("text-destructive hover:text-destructive")}
          >
            {isRemoving ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <X className="size-3.5" />
            )}
            <span>Remove</span>
          </Button>
        )}
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept={ACCEPTED_TYPES.join(",")}
        className="hidden"
        onChange={handleFileChange}
        aria-label="Upload avatar image"
      />

      {/* Avatar Crop Dialog */}
      {cropImageSrc && (
        <AvatarCropDialog
          open={cropDialogOpen}
          onOpenChange={(open) => {
            setCropDialogOpen(open);
            if (!open) {
              setCropImageSrc("");
            }
          }}
          imageSrc={cropImageSrc}
          onCropComplete={handleCropComplete}
        />
      )}
    </div>
  );
}
