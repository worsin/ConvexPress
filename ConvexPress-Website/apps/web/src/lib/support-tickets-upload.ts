import type { Id } from "@convexpress-website/backend/generated/dataModel";
/**
 * Ticket attachment uploads.
 *
 * Flow: ask the backend for an upload URL (it validates name, type and size
 * first), POST the bytes to Convex storage, and hand back the attachment
 * descriptor the create/reply mutations expect.
 */

import { validateAttachment } from "@/lib/support-tickets";

export interface UploadedAttachment {
  name: string;
  storageId: Id<"_storage">;
  mimeType: string;
  size: number;
}

export type UploadUrlRequester = (args: { name: string; mimeType: string; size: number }) => Promise<unknown>;

export async function uploadTicketAttachments(requestUploadUrl: UploadUrlRequester, files: File[]): Promise<UploadedAttachment[]> {
  const out: UploadedAttachment[] = [];
  for (const file of files) {
    const problem = validateAttachment(file);
    if (problem) throw new Error(problem);
    const response = (await requestUploadUrl({ name: file.name, mimeType: file.type, size: file.size })) as { uploadUrl?: string } | string;
    const uploadUrl = typeof response === "string" ? response : response?.uploadUrl;
    if (!uploadUrl) throw new Error(`Couldn't prepare the upload for ${file.name}`);
    const res = await fetch(uploadUrl, { method: "POST", headers: { "Content-Type": file.type }, body: file });
    if (!res.ok) throw new Error(`Couldn't upload ${file.name}`);
    const payload: unknown = await res.json();
    if (!payload || typeof payload !== "object" || !("storageId" in payload) || typeof payload.storageId !== "string" || !payload.storageId) throw new Error(`The upload for ${file.name} returned no storage ID`);
    // IDs cross the storage HTTP boundary as opaque strings; Convex validates the brand again on mutation.
    const storageId = payload.storageId as Id<"_storage">;
    out.push({ storageId, name: file.name, mimeType: file.type, size: file.size });
  }
  return out;
}
