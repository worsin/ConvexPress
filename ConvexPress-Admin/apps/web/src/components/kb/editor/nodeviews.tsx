/**
 * Interactive views for the editor's own blocks. Each renders the same
 * `kb-*` markup the published article uses, plus the controls an author
 * needs in place: a figure's alt text, caption, size and frame; a callout's
 * tone and title; a question's summary.
 */

import { NodeViewContent, NodeViewWrapper, type ReactNodeViewProps } from "@tiptap/react";
import { useQuery } from "convex-helpers/react/cache";
import { ImageOff, Trash2 } from "lucide-react";

import { api } from "@backend/convex/_generated/api";
import type { Id } from "@backend/convex/_generated/dataModel";
import { MediaPicker } from "@/components/media/MediaPicker";
import { cn } from "@/lib/utils";

import type { KbCalloutTone, KbFigureAttrs } from "./extensions";

const TONES: Array<{ value: KbCalloutTone; label: string }> = [
  { value: "note", label: "Note" },
  { value: "tip", label: "Tip" },
  { value: "warning", label: "Warning" },
  { value: "important", label: "Important" },
];

const fieldClass = "w-full rounded-md border border-border bg-background px-2 py-1 text-xs focus:outline-hidden focus:ring-2 focus:ring-primary/30";

export function FigureView({ node, updateAttributes, selected, deleteNode, editor }: ReactNodeViewProps) {
  const attrs = node.attrs as KbFigureAttrs;
  const media = useQuery(api.media.queries.get, attrs.mediaId ? { mediaId: attrs.mediaId as Id<"media"> } : "skip");
  const url = media?.url ?? attrs.src ?? undefined;
  const editable = editor.isEditable;
  const missingAlt = !attrs.alt && !media?.altText;
  return (
    <NodeViewWrapper
      as="figure"
      data-drag-handle
      className={cn("kb-figure", `kb-figure--${attrs.size}`, attrs.frame === "screenshot" && "kb-figure--screenshot", "kb-editor-figure", selected && "is-selected")}
    >
      {url ? (
        <img src={url} alt={attrs.alt || media?.altText || ""} draggable={false} />
      ) : (
        <div className="kb-editor-figure__missing">
          <ImageOff className="h-5 w-5" aria-hidden="true" />
          {attrs.mediaId && media === undefined ? "Loading image…" : "This image is no longer in the media library."}
        </div>
      )}
      {editable ? (
        <figcaption>
          <input
            className="kb-editor-figure__caption"
            value={attrs.caption}
            placeholder="Caption (optional)"
            onChange={(event) => updateAttributes({ caption: event.target.value })}
          />
        </figcaption>
      ) : attrs.caption ? (
        <figcaption>{attrs.caption}</figcaption>
      ) : null}
      {editable && selected && (
        <div className="kb-editor-figure__tools" contentEditable={false}>
          <label className="block">
            <span className="mb-0.5 block text-[11px] font-medium text-foreground/60">
              Alt text {missingAlt && <span className="text-warning">· needed for screen readers</span>}
            </span>
            <input
              className={fieldClass}
              value={attrs.alt}
              placeholder={media?.altText ? `Library: ${media.altText}` : "Describe what the image shows"}
              onChange={(event) => updateAttributes({ alt: event.target.value })}
            />
          </label>
          <div className="flex flex-wrap items-center gap-2">
            <select aria-label="Size" className={cn(fieldClass, "w-auto")} value={attrs.size} onChange={(event) => updateAttributes({ size: event.target.value })}>
              <option value="content">Text width</option>
              <option value="wide">Wide</option>
              <option value="full">Full width</option>
            </select>
            <label className="flex items-center gap-1.5 text-xs">
              <input type="checkbox" checked={attrs.frame === "screenshot"} onChange={(event) => updateAttributes({ frame: event.target.checked ? "screenshot" : "none" })} />
              Screenshot frame
            </label>
            <MediaPicker
              label="Replace"
              allowedTypes={["image", "video"]}
              selectedId={(attrs.mediaId as Id<"media"> | null) ?? undefined}
              onSelect={(mediaId) => updateAttributes({ mediaId, src: null })}
            />
            <button type="button" onClick={() => deleteNode()} className="ml-auto inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-destructive hover:bg-destructive/10">
              <Trash2 className="h-3.5 w-3.5" aria-hidden="true" /> Remove
            </button>
          </div>
        </div>
      )}
    </NodeViewWrapper>
  );
}

export function CalloutView({ node, updateAttributes, editor }: ReactNodeViewProps) {
  const tone = node.attrs.tone as KbCalloutTone;
  const editable = editor.isEditable;
  return (
    <NodeViewWrapper as="aside" className={cn("kb-callout", `kb-callout--${tone}`, "kb-editor-callout")}>
      <div className="kb-callout__title flex items-center gap-2" contentEditable={false}>
        {editable ? (
          <>
            <select aria-label="Callout type" className="kb-editor-inline-select" value={tone} onChange={(event) => updateAttributes({ tone: event.target.value })}>
              {TONES.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            <input
              aria-label="Callout title"
              className="kb-editor-inline-input"
              value={node.attrs.title as string}
              placeholder="Title (optional)"
              onChange={(event) => updateAttributes({ title: event.target.value })}
            />
          </>
        ) : (
          (node.attrs.title as string) || TONES.find((option) => option.value === tone)?.label
        )}
      </div>
      <NodeViewContent className="kb-editor-callout__body" />
    </NodeViewWrapper>
  );
}

export function DetailsView({ node, updateAttributes, editor }: ReactNodeViewProps) {
  return (
    <NodeViewWrapper className="kb-details kb-editor-details">
      <div className="kb-editor-details__summary" contentEditable={false}>
        <span aria-hidden="true">›</span>
        {editor.isEditable ? (
          <input
            aria-label="Question"
            className="kb-editor-inline-input font-semibold"
            value={node.attrs.summary as string}
            placeholder="Question readers click to open"
            onChange={(event) => updateAttributes({ summary: event.target.value })}
          />
        ) : (
          <strong>{node.attrs.summary as string}</strong>
        )}
      </div>
      <NodeViewContent className="kb-details__body" />
    </NodeViewWrapper>
  );
}
