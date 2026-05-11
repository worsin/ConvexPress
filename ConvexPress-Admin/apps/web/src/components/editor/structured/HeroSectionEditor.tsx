/**
 * HeroSectionEditor - Hero section form fields
 *
 * Renders inputs for the hero section: title, subtitle, content,
 * image, video URL, CTA text, and CTA URL.
 */

import { useCallback, useState } from "react";
import { useQuery } from "convex-helpers/react/cache";
import { api } from "@backend/convex/_generated/api";
import type { Id } from "@backend/convex/_generated/dataModel";
import { ImageIcon } from "lucide-react";
import { SectionField } from "./SectionField";
import { MediaPicker } from "../MediaPicker";
import { cn } from "@/lib/utils";
import type { HeroFields } from "@/types/editor";

interface HeroSectionEditorProps {
  value: HeroFields;
  onChange: (hero: HeroFields) => void;
}

export function HeroSectionEditor({ value, onChange }: HeroSectionEditorProps) {
  const [showPicker, setShowPicker] = useState(false);

  const update = useCallback(
    (field: keyof HeroFields, val: string | null) => {
      onChange({ ...value, [field]: val });
    },
    [value, onChange],
  );

  // Fetch image preview data from Convex when an imageId is set
  const mediaItem = useQuery(
    api.media.queries.get,
    value.imageId ? { mediaId: value.imageId as Id<"media"> } : "skip",
  );

  const imageUrl = mediaItem?.url ?? null;
  const hasImage = !!value.imageId;
  const isLoadingImage = !!value.imageId && mediaItem === undefined;

  return (
    <div className="space-y-3">
      <SectionField label="Hero Title">
        <input
          type="text"
          value={value.title}
          onChange={(e) => update("title", e.target.value)}
          placeholder="Main headline..."
          className="w-full border border-border bg-background px-2.5 py-1.5 text-sm outline-hidden focus:border-primary transition-colors"
        />
      </SectionField>

      <SectionField label="Hero Subtitle">
        <input
          type="text"
          value={value.subtitle}
          onChange={(e) => update("subtitle", e.target.value)}
          placeholder="Supporting tagline..."
          className="w-full border border-border bg-background px-2.5 py-1.5 text-sm outline-hidden focus:border-primary transition-colors"
        />
      </SectionField>

      <SectionField label="Hero Content">
        <textarea
          value={value.content}
          onChange={(e) => update("content", e.target.value)}
          placeholder="Hero body text..."
          rows={4}
          className="w-full border border-border bg-background px-2.5 py-1.5 text-sm outline-hidden focus:border-primary transition-colors resize-y"
        />
      </SectionField>

      {/* Hero Image */}
      <SectionField label="Hero Image">
        {hasImage ? (
          <div>
            {/* Thumbnail preview */}
            <div className="border border-border bg-muted/30 mb-2">
              {isLoadingImage ? (
                <div className="w-full h-32 animate-pulse bg-muted" />
              ) : imageUrl ? (
                <img
                  src={imageUrl}
                  alt="Hero image"
                  className="w-full h-auto object-cover"
                />
              ) : (
                <div className="flex items-center justify-center h-32 text-muted-foreground text-xs">
                  Image not found
                </div>
              )}
            </div>

            {/* Change / Remove links */}
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setShowPicker(true)}
                className="text-xs text-primary hover:underline"
              >
                Change image
              </button>
              <button
                type="button"
                onClick={() => {
                  update("imageId", null);
                  setShowPicker(false);
                }}
                className="text-xs text-destructive hover:underline"
              >
                Remove image
              </button>
            </div>
          </div>
        ) : (
          <div>
            {!showPicker ? (
              <button
                type="button"
                onClick={() => setShowPicker(true)}
                className={cn(
                  "w-full flex flex-col items-center justify-center gap-2 py-6",
                  "border border-dashed border-border",
                  "text-muted-foreground hover:text-foreground hover:border-foreground/30",
                  "transition-colors cursor-pointer",
                )}
              >
                <ImageIcon className="size-8 opacity-50" />
                <span className="text-xs">Select Hero Image</span>
              </button>
            ) : null}
          </div>
        )}

        {/* Inline MediaPicker */}
        {showPicker && (
          <MediaPicker
            onSelect={(mediaId) => {
              update("imageId", mediaId);
              setShowPicker(false);
            }}
            onClose={() => setShowPicker(false)}
            selectedId={value.imageId ?? undefined}
            filterType="image"
          />
        )}
      </SectionField>

      <SectionField label="Hero Video URL">
        <input
          type="url"
          value={value.videoUrl}
          onChange={(e) => update("videoUrl", e.target.value)}
          placeholder="https://youtube.com/watch?v=..."
          className="w-full border border-border bg-background px-2.5 py-1.5 text-sm outline-hidden focus:border-primary transition-colors"
        />
      </SectionField>

      <div className="grid grid-cols-2 gap-3">
        <SectionField label="CTA Text">
          <input
            type="text"
            value={value.ctaText}
            onChange={(e) => update("ctaText", e.target.value)}
            placeholder="Learn More"
            className="w-full border border-border bg-background px-2.5 py-1.5 text-sm outline-hidden focus:border-primary transition-colors"
          />
        </SectionField>

        <SectionField label="CTA URL">
          <input
            type="url"
            value={value.ctaUrl}
            onChange={(e) => update("ctaUrl", e.target.value)}
            placeholder="/contact"
            className="w-full border border-border bg-background px-2.5 py-1.5 text-sm outline-hidden focus:border-primary transition-colors"
          />
        </SectionField>
      </div>
    </div>
  );
}
