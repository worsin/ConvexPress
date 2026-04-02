/**
 * TopicSectionEditor - Single topic form fields
 *
 * Renders inputs for one topic: title, subtitle, content, image, video URL.
 * Includes an inline image picker, remove button, and regenerate button.
 */

import { useCallback, useState } from "react";
import { Trash2, ImageIcon } from "lucide-react";
import { useQuery } from "convex/react";
import { api } from "@backend/convex/_generated/api";
import type { Id } from "@backend/convex/_generated/dataModel";
import { SectionField } from "./SectionField";
import { RegenerateButton } from "./RegenerateButton";
import { MediaPicker } from "../MediaPicker";
import { cn } from "@/lib/utils";
import type { TopicFields } from "@/types/editor";

interface TopicSectionEditorProps {
  index: number;
  value: TopicFields;
  onChange: (topic: TopicFields) => void;
  onRemove: () => void;
  onRegenerate?: () => void;
  isRegenerating?: boolean;
}

export function TopicSectionEditor({
  index,
  value,
  onChange,
  onRemove,
  onRegenerate,
  isRegenerating,
}: TopicSectionEditorProps) {
  const [showPicker, setShowPicker] = useState(false);
  const [imageError, setImageError] = useState(false);

  const update = useCallback(
    (field: keyof TopicFields, val: string | null) => {
      onChange({ ...value, [field]: val });
    },
    [value, onChange],
  );

  // Fetch image data from Convex when an imageId is set
  const mediaItem = useQuery(
    api.media.queries.get,
    value.imageId
      ? { mediaId: value.imageId as Id<"media"> }
      : "skip",
  );

  const imageUrl = mediaItem?.url ?? null;
  const hasImage = !!value.imageId;
  const isLoadingImage = !!value.imageId && mediaItem === undefined;

  return (
    <div className="border border-border/50 bg-muted/20 p-3 space-y-3">
      {/* Topic header with number, regenerate, and remove */}
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
          Topic {index + 1}
        </span>
        <div className="flex items-center gap-1.5">
          {onRegenerate && (
            <RegenerateButton
              onClick={onRegenerate}
              isLoading={isRegenerating}
              label="Regenerate"
            />
          )}
          <button
            type="button"
            onClick={onRemove}
            className="p-1 text-muted-foreground hover:text-destructive transition-colors"
            title="Remove topic"
          >
            <Trash2 className="size-3.5" />
          </button>
        </div>
      </div>

      <SectionField label="Title">
        <input
          type="text"
          value={value.title}
          onChange={(e) => update("title", e.target.value)}
          placeholder={`Topic ${index + 1} title...`}
          className="w-full border border-border bg-background px-2.5 py-1.5 text-sm outline-hidden focus:border-primary transition-colors"
        />
      </SectionField>

      <SectionField label="Subtitle">
        <input
          type="text"
          value={value.subtitle}
          onChange={(e) => update("subtitle", e.target.value)}
          placeholder="Brief subtitle..."
          className="w-full border border-border bg-background px-2.5 py-1.5 text-sm outline-hidden focus:border-primary transition-colors"
        />
      </SectionField>

      <SectionField label="Content">
        <textarea
          value={value.content}
          onChange={(e) => update("content", e.target.value)}
          placeholder="Topic content..."
          rows={4}
          className="w-full border border-border bg-background px-2.5 py-1.5 text-sm outline-hidden focus:border-primary transition-colors resize-y"
        />
      </SectionField>

      {/* Image picker */}
      <SectionField label="Image">
        {hasImage ? (
          <div>
            {/* Thumbnail preview */}
            <div className="border border-border bg-muted/30 mb-2">
              {isLoadingImage ? (
                <div className="w-full h-28 animate-pulse bg-muted" />
              ) : imageUrl && !imageError ? (
                <img
                  src={imageUrl}
                  alt={`Topic ${index + 1} image`}
                  className="w-full h-28 object-cover"
                  onError={() => setImageError(true)}
                />
              ) : (
                <div className="flex items-center justify-center h-28 text-muted-foreground text-xs">
                  Image not found
                </div>
              )}
            </div>

            {/* Change / Remove links */}
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => {
                  setImageError(false);
                  setShowPicker(true);
                }}
                className="text-xs text-primary hover:underline"
              >
                Change image
              </button>
              <button
                type="button"
                onClick={() => {
                  update("imageId", null);
                  setImageError(false);
                  setShowPicker(false);
                }}
                className="text-xs text-destructive hover:underline"
              >
                Remove image
              </button>
            </div>
          </div>
        ) : (
          !showPicker && (
            <button
              type="button"
              onClick={() => setShowPicker(true)}
              className={cn(
                "w-full flex flex-col items-center justify-center gap-2 py-5",
                "border border-dashed border-border",
                "text-muted-foreground hover:text-foreground hover:border-foreground/30",
                "transition-colors cursor-pointer",
              )}
            >
              <ImageIcon className="size-6 opacity-50" />
              <span className="text-xs">Select Topic Image</span>
            </button>
          )
        )}

        {/* Inline MediaPicker */}
        {showPicker && (
          <MediaPicker
            onSelect={(mediaId) => {
              update("imageId", mediaId);
              setImageError(false);
              setShowPicker(false);
            }}
            onClose={() => setShowPicker(false)}
            selectedId={value.imageId ?? undefined}
            filterType="image"
          />
        )}
      </SectionField>

      <SectionField label="Video URL">
        <input
          type="url"
          value={value.videoUrl}
          onChange={(e) => update("videoUrl", e.target.value)}
          placeholder="https://youtube.com/watch?v=..."
          className="w-full border border-border bg-background px-2.5 py-1.5 text-sm outline-hidden focus:border-primary transition-colors"
        />
      </SectionField>
    </div>
  );
}
