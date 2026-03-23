/**
 * Upload Media - /admin/media/upload
 *
 * Dedicated upload screen with drag-and-drop multi-file upload,
 * upload progress tracking, and recently uploaded inline editing.
 */

import { createFileRoute } from "@tanstack/react-router";
import { DropZone } from "@/components/media/DropZone";
import { UploadProgress } from "@/components/media/UploadProgress";

export const Route = createFileRoute("/_authenticated/_admin/media/upload")({
  component: UploadMediaPage,
});

function UploadMediaPage() {
  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-foreground">Upload New Media</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Drag files here or click to select files for upload.
        </p>
      </div>

      <DropZone />

      <div className="mt-8">
        <UploadProgress />
      </div>
    </div>
  );
}
