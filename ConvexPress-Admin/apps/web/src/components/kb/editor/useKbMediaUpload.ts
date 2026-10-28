/** Upload pasted or dropped files into the media library (same path as MediaPicker's upload tab). */
import { useMutation } from "convex/react";
import { useCallback } from "react";

import { api } from "@backend/convex/_generated/api";
import type { Id } from "@backend/convex/_generated/dataModel";

function imageSize(file: File): Promise<{ width: number; height: number } | null> {
  if (!file.type.startsWith("image/")) return Promise.resolve(null);
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      resolve({ width: image.naturalWidth, height: image.naturalHeight });
      URL.revokeObjectURL(url);
    };
    image.onerror = () => {
      resolve(null);
      URL.revokeObjectURL(url);
    };
    image.src = url;
  });
}

export function useKbMediaUpload() {
  const generateUploadUrl = useMutation(api.media.mutations.generateUploadUrl);
  const createMedia = useMutation(api.media.mutations.create);
  return useCallback(
    async (file: File): Promise<Id<"media">> => {
      const uploadUrl = await generateUploadUrl();
      const response = await fetch(uploadUrl, { method: "POST", headers: { "Content-Type": file.type }, body: file });
      if (!response.ok) throw new Error("Upload failed");
      const { storageId } = (await response.json()) as { storageId: Id<"_storage"> };
      const size = await imageSize(file);
      return (await createMedia({
        storageId,
        fileName: file.name || `pasted-${Date.now()}.png`,
        mimeType: file.type,
        fileSize: file.size,
        ...(size ? { width: size.width, height: size.height } : {}),
      })) as Id<"media">;
    },
    [generateUploadUrl, createMedia],
  );
}
