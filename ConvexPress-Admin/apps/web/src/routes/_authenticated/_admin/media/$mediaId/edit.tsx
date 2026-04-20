/**
 * Edit Media - /admin/media$mediaId/edit
 *
 * Full media editing screen with:
 *   - File preview (left column)
 *   - Metadata form (right column)
 *   - File details panel
 *   - EXIF data panel (images)
 *   - Image sizes panel
 *   - Delete media button
 */

import { useState, useCallback } from "react";
import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import {
  ArrowLeftIcon,
  CopyIcon,
  TrashIcon,
  ExternalLinkIcon,
  FileIcon,
  ImageIcon,
  MusicIcon,
  VideoIcon,
  PencilIcon,
} from "lucide-react";
import { toast } from "sonner";
import { useQuery, useMutation } from "convex/react";
import { api } from "@backend/convex/_generated/api";
import type { Id } from "@backend/convex/_generated/dataModel";

import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";
import { MediaDetails } from "@/components/media/MediaDetails";
import { ExifPanel } from "@/components/media/ExifPanel";
import { ImageSizesPanel } from "@/components/media/ImageSizesPanel";
import { ImageEditor } from "@/components/media/ImageEditor";

export const Route = createFileRoute(
  "/_authenticated/_admin/media/$mediaId/edit",
)({
  component: EditMediaPage,
});

function EditMediaPage() {
  const { mediaId } = Route.useParams();
  const navigate = useNavigate();

  const media = useQuery(api.media.queries.get, {
    mediaId: mediaId as Id<"media">,
  });

  const updateMedia = useMutation(api.media.mutations.update);
  const deleteMedia = useMutation(api.media.mutations.remove);

  const [title, setTitle] = useState("");
  const [altText, setAltText] = useState("");
  const [caption, setCaption] = useState("");
  const [description, setDescription] = useState("");
  const [hasInitialized, setHasInitialized] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showImageEditor, setShowImageEditor] = useState(false);

  // Initialize form fields when media loads
  if (media && !hasInitialized) {
    setTitle(media.title);
    setAltText(media.altText || "");
    setCaption(media.caption || "");
    setDescription(media.description || "");
    setHasInitialized(true);
  }

  const handleSave = useCallback(async () => {
    if (!media) return;
    setIsSaving(true);
    try {
      await updateMedia({
        mediaId: media._id as Id<"media">,
        title: title.trim() || media.title,
        altText: altText.trim() || undefined,
        caption: caption.trim() || undefined,
        description: description.trim() || undefined,
      });
      toast.success("Media updated successfully.");
    } catch (err) {
      toast.error(
        `Failed to save: ${err instanceof Error ? err.message : `Unknown error`}`,
      );
    } finally {
      setIsSaving(false);
    }
  }, [media, title, altText, caption, description, updateMedia]);

  const handleDelete = useCallback(async () => {
    if (!media) return;
    try {
      await deleteMedia({ mediaId: media._id as Id<"media"> });
      toast.success(`"${media.title}" permanently deleted.`);
      navigate({ to: "/media" });
    } catch (err) {
      toast.error(
        `Failed to delete: ${err instanceof Error ? err.message : `Unknown error`}`,
      );
    }
    setShowDeleteConfirm(false);
  }, [media, deleteMedia, navigate]);

  const handleCopyUrl = useCallback(() => {
    if (!media) return;
    navigator.clipboard.writeText(media.url);
    toast.success("URL copied to clipboard.");
  }, [media]);

  // Loading state
  if (media === undefined) {
    return (
      <div className="space-y-4">
        <div className="h-8 w-48 bg-muted animate-pulse rounded-none" />
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_380px] gap-6">
          <div className="h-[400px] bg-muted animate-pulse rounded-none" />
          <div className="space-y-4">
            <div className="h-[200px] bg-muted animate-pulse rounded-none" />
            <div className="h-[150px] bg-muted animate-pulse rounded-none" />
          </div>
        </div>
      </div>
    );
  }

  // Not found
  if (media === null) {
    return (
      <div className="text-center py-16">
        <h2 className="text-lg font-semibold text-foreground">
          Media Not Found
        </h2>
        <p className="text-sm text-muted-foreground mt-2">
          This media item may have been deleted.
        </p>
        <Link to="/media" activeProps={{}}>
          <Button variant="outline" size="sm" className="mt-4">
            Back to Media Library
          </Button>
        </Link>
      </div>
    );
  }

  const isImage = media.mediaType === "image";
  const isVideo = media.mediaType === "video";
  const isAudio = media.mediaType === "audio";

  const missingAltText = isImage && !media.altText?.trim();

  return (
    <div>
      {/* Accessibility warning: images should have alt text */}
      {missingAltText && (
        <div className="mb-4 border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900 rounded-none">
          <p className="font-medium">Alt text missing.</p>
          <p className="mt-1 text-xs">
            Images without alt text are invisible to screen readers and hurt
            SEO. Add descriptive alt text in the field on the right to
            describe what the image shows.
          </p>
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Link to="/media" activeProps={{}}>
            <Button variant="ghost" size="icon-xs">
              <ArrowLeftIcon className="size-4" />
            </Button>
          </Link>
          <h1 className="text-2xl font-bold text-foreground">Edit Media</h1>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handleCopyUrl}
          >
            <CopyIcon className="size-3.5 mr-1.5" />
            Copy URL
          </Button>
          <a href={media.url} target="_blank" rel="noopener noreferrer">
            <Button variant="outline" size="sm">
              <ExternalLinkIcon className="size-3.5 mr-1.5" />
              View
            </Button>
          </a>
        </div>
      </div>

      {/* Two-column layout */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_380px] gap-6">
        {/* Left Column: File Preview */}
        <div className="space-y-6">
          {/* Preview / Image Editor */}
          {showImageEditor && isImage && media.width && media.height ? (
            <ImageEditor
              mediaId={media._id as Id<"media">}
              imageUrl={media.url}
              width={media.width}
              height={media.height}
              onClose={() => setShowImageEditor(false)}
            />
          ) : (
            <div className="border border-border bg-card p-4">
              <div className="flex items-center justify-center min-h-[200px] bg-muted/30">
                {isImage ? (
                  <img
                    src={media.url}
                    alt={media.altText || media.title}
                    className="max-w-full max-h-[600px] object-contain"
                  />
                ) : isVideo ? (
                  <video
                    src={media.url}
                    controls
                    className="max-w-full max-h-[400px]"
                  />
                ) : isAudio ? (
                  <div className="flex flex-col items-center gap-4 py-8">
                    <MusicIcon className="size-16 text-muted-foreground" />
                    <audio src={media.url} controls className="w-full max-w-md" />
                  </div>
                ) : (
                  <div className="flex flex-col items-center gap-2 py-8">
                    <FileIcon className="size-16 text-muted-foreground" />
                    <span className="text-sm text-muted-foreground">
                      {media.fileName}
                    </span>
                  </div>
                )}
              </div>
              {isImage && (
                <div className="mt-2 flex items-center justify-center gap-3">
                  {media.width && media.height && (
                    <span className="text-xs text-muted-foreground">
                      {media.width} x {media.height} pixels
                    </span>
                  )}
                  <Button
                    variant="outline"
                    size="xs"
                    onClick={() => setShowImageEditor(true)}
                  >
                    <PencilIcon className="size-3 mr-1" />
                    Edit Image
                  </Button>
                </div>
              )}
              {!isImage && media.width && media.height && (
                <div className="mt-2 text-xs text-muted-foreground text-center">
                  {media.width} x {media.height} pixels
                </div>
              )}
            </div>
          )}

          {/* Image Sizes Panel */}
          {isImage && media.sizes && (
            <ImageSizesPanel sizes={media.sizes} />
          )}

          {/* EXIF Panel */}
          {isImage && media.metaMap && (
            <ExifPanel metaMap={media.metaMap} />
          )}
        </div>

        {/* Right Column: Metadata Form + Details */}
        <div className="space-y-6">
          {/* Metadata Form */}
          <div className="border border-border bg-card p-4">
            <h3 className="text-sm font-semibold text-foreground mb-4">
              Media Details
            </h3>
            <div className="space-y-3">
              <div>
                <label className="text-xs text-muted-foreground block mb-1">
                  Title
                </label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="w-full border border-border bg-background px-3 py-2 text-sm text-foreground rounded-none focus:outline-hidden focus:ring-1 focus:ring-primary"
                />
              </div>

              {isImage && (
                <div>
                  <label className="text-xs text-muted-foreground block mb-1">
                    Alternative Text
                  </label>
                  <input
                    type="text"
                    value={altText}
                    onChange={(e) => setAltText(e.target.value)}
                    placeholder="Describe this image for accessibility"
                    className="w-full border border-border bg-background px-3 py-2 text-sm text-foreground rounded-none focus:outline-hidden focus:ring-1 focus:ring-primary"
                  />
                  <p className="text-[10px] text-muted-foreground mt-1">
                    Describe the purpose of the image. Leave empty if decorative.
                  </p>
                </div>
              )}

              <div>
                <label className="text-xs text-muted-foreground block mb-1">
                  Caption
                </label>
                <textarea
                  value={caption}
                  onChange={(e) => setCaption(e.target.value)}
                  rows={2}
                  className="w-full border border-border bg-background px-3 py-2 text-sm text-foreground rounded-none focus:outline-hidden focus:ring-1 focus:ring-primary resize-none"
                />
              </div>

              <div>
                <label className="text-xs text-muted-foreground block mb-1">
                  Description
                </label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={4}
                  className="w-full border border-border bg-background px-3 py-2 text-sm text-foreground rounded-none focus:outline-hidden focus:ring-1 focus:ring-primary resize-none"
                />
              </div>

              <Button
                onClick={handleSave}
                disabled={isSaving}
                className="w-full"
              >
                {isSaving ? "Saving..." : "Save Changes"}
              </Button>
            </div>
          </div>

          {/* File Details Panel */}
          <MediaDetails media={media} />

          {/* Delete */}
          <div className="border border-destructive/20 bg-card p-4">
            <h3 className="text-sm font-semibold text-destructive mb-2">
              Danger Zone
            </h3>
            <p className="text-xs text-muted-foreground mb-3">
              Permanently delete this media file. This action cannot be undone.
            </p>
            <Button
              variant="destructive"
              size="sm"
              onClick={() => setShowDeleteConfirm(true)}
            >
              <TrashIcon className="size-3.5 mr-1.5" />
              Delete Permanently
            </Button>
          </div>
        </div>
      </div>

      <ConfirmDialog
        open={showDeleteConfirm}
        onClose={() => setShowDeleteConfirm(false)}
        onConfirm={handleDelete}
        title="Delete Permanently?"
        message={`You are about to permanently delete "${media.title}". This action cannot be undone.`}
        confirmLabel="Delete"
        destructive
      />
    </div>
  );
}
