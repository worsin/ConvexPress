/**
 * MediaField — the AI-first replacement for raw "Media ID" text inputs.
 *
 * Three modes, one component:
 *   • Library  → the existing inline MediaPicker
 *   • Upload   → file input that uploads via the existing media upload flow
 *   • Generate → AI text-to-image (calls media/ai:generateImage)
 *
 * Drop into any block editor that takes a `mediaId` string field.
 */

import { useCallback, useRef, useState } from "react";
import {
  ImageIcon,
  Library,
  Loader2,
  Sparkles,
  UploadCloud,
  X,
} from "lucide-react";
import { useAction, useMutation } from "convex/react";
import { useQuery } from "convex-helpers/react/cache";
import { toast } from "sonner";

import { api } from "@backend/convex/_generated/api";
import type { Id } from "@backend/convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { MediaPicker } from "./MediaPicker";

interface MediaFieldProps {
  label: string;
  value: string;
  onChange: (mediaId: string) => void;
  disabled?: boolean;
  /** Optional default prompt seed for AI generation (e.g. block title). */
  promptSeed?: string;
}

type Tab = "library" | "upload" | "generate";

export function MediaField({
  label,
  value,
  onChange,
  disabled,
  promptSeed,
}: MediaFieldProps) {
  const [expanded, setExpanded] = useState(false);
  const [tab, setTab] = useState<Tab>("library");

  // Existing selection — show a thumbnail.
  const mediaDoc = useQuery(
    api.media.queries.getById,
    value ? { mediaId: value as Id<"media"> } : "skip",
  );

  const thumbUrl =
    mediaDoc && typeof mediaDoc === "object" && "url" in mediaDoc
      ? (mediaDoc as any).url
      : null;
  const altText =
    mediaDoc && typeof mediaDoc === "object" && "altText" in mediaDoc
      ? (mediaDoc as any).altText || (mediaDoc as any).title || ""
      : "";

  return (
    <div className="grid gap-1.5">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      <div className="border border-border bg-background">
        {/* Current selection row */}
        <div className="flex items-center gap-3 px-3 py-2">
          <div className="size-12 shrink-0 border border-border bg-muted/30 overflow-hidden">
            {thumbUrl ? (
              <img
                src={thumbUrl}
                alt={altText}
                className="size-full object-cover"
              />
            ) : (
              <div className="flex size-full items-center justify-center text-muted-foreground">
                <ImageIcon className="size-4" />
              </div>
            )}
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-xs text-muted-foreground">
              {value ? (
                <span className="font-mono">{truncateMid(value, 22)}</span>
              ) : (
                "No image selected"
              )}
            </div>
            {altText && (
              <div className="text-xs text-foreground truncate">{altText}</div>
            )}
          </div>
          {value && (
            <button
              type="button"
              onClick={() => onChange("")}
              disabled={disabled}
              aria-label="Clear selection"
              className="text-muted-foreground hover:text-destructive disabled:cursor-not-allowed disabled:opacity-50"
            >
              <X className="size-4" />
            </button>
          )}
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => setExpanded((v) => !v)}
            disabled={disabled}
          >
            {value ? "Change" : "Choose"}
          </Button>
        </div>

        {/* Expanded panel */}
        {expanded && (
          <div className="border-t border-border bg-card">
            {/* Tabs */}
            <div className="flex border-b border-border">
              <TabButton active={tab === "library"} onClick={() => setTab("library")}>
                <Library className="size-3.5" /> Library
              </TabButton>
              <TabButton active={tab === "upload"} onClick={() => setTab("upload")}>
                <UploadCloud className="size-3.5" /> Upload
              </TabButton>
              <TabButton active={tab === "generate"} onClick={() => setTab("generate")}>
                <Sparkles className="size-3.5" /> Generate with AI
              </TabButton>
            </div>

            <div className="p-3">
              {tab === "library" && (
                <LibraryTab
                  selectedId={value}
                  onSelect={(id) => {
                    onChange(id);
                    setExpanded(false);
                  }}
                />
              )}
              {tab === "upload" && (
                <UploadTab
                  disabled={disabled}
                  onUploaded={(id) => {
                    onChange(id);
                    setExpanded(false);
                  }}
                />
              )}
              {tab === "generate" && (
                <GenerateTab
                  disabled={disabled}
                  promptSeed={promptSeed}
                  onGenerated={(id) => {
                    onChange(id);
                    setExpanded(false);
                  }}
                />
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex flex-1 items-center justify-center gap-1.5 border-r border-border px-3 py-2 text-xs font-medium transition-colors last:border-r-0",
        active
          ? "bg-muted/30 text-foreground"
          : "text-muted-foreground hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}

function LibraryTab({
  selectedId,
  onSelect,
}: {
  selectedId: string;
  onSelect: (id: string) => void;
}) {
  return (
    <MediaPicker
      label="Pick from library"
      allowedTypes={["image"]}
      selectedId={selectedId ? (selectedId as Id<"media">) : undefined}
      onSelect={(id) => onSelect(id as string)}
    />
  );
}

function UploadTab({
  disabled,
  onUploaded,
}: {
  disabled?: boolean;
  onUploaded: (id: string) => void;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const generateUploadUrl = useMutation(api.media.mutations.generateUploadUrl);
  const createMedia = useMutation(api.media.mutations.create);

  const onPick = useCallback(
    async (file: File) => {
      setBusy(true);
      try {
        const url = await generateUploadUrl({});
        const upload = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": file.type },
          body: file,
        });
        if (!upload.ok) {
          throw new Error(`Upload failed: ${upload.status}`);
        }
        const { storageId } = (await upload.json()) as { storageId: string };
        const mediaId: string = await (createMedia as any)({
          storageId,
          fileName: file.name,
          fileSize: file.size,
          mimeType: file.type,
          title: file.name.replace(/\.[^.]+$/, ""),
          altText: "",
        });
        toast.success("Uploaded.");
        onUploaded(mediaId);
      } catch (err) {
        const message = err instanceof Error ? err.message : "Upload failed";
        toast.error(message);
      } finally {
        setBusy(false);
      }
    },
    [createMedia, generateUploadUrl, onUploaded],
  );

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">
        Upload an image from your computer. Saved to the media library.
      </p>
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        disabled={disabled || busy}
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void onPick(file);
          e.target.value = "";
        }}
        className="block w-full text-sm text-foreground file:mr-3 file:cursor-pointer file:border-0 file:bg-primary file:px-3 file:py-1.5 file:text-xs file:font-medium file:text-primary-foreground hover:file:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed"
      />
      {busy && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Loader2 className="size-3.5 animate-spin" />
          Uploading…
        </div>
      )}
    </div>
  );
}

function GenerateTab({
  disabled,
  promptSeed,
  onGenerated,
}: {
  disabled?: boolean;
  promptSeed?: string;
  onGenerated: (id: string) => void;
}) {
  const [prompt, setPrompt] = useState(promptSeed ?? "");
  const [aspect, setAspect] = useState<"square" | "landscape" | "portrait" | "wide">("landscape");
  const [busy, setBusy] = useState(false);
  const generateImage = useAction((api as any).media.ai.generateImage);

  const onGenerate = useCallback(async () => {
    const trimmed = prompt.trim();
    if (!trimmed) {
      toast.error("Describe the image you want.");
      return;
    }
    setBusy(true);
    try {
      const result = await generateImage({ prompt: trimmed, aspect });
      toast.success("Image generated and added to library.");
      onGenerated(result.mediaId);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Generation failed";
      toast.error(message);
    } finally {
      setBusy(false);
    }
  }, [aspect, generateImage, onGenerated, prompt]);

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">
        Describe the image. The skill / theme controls the look — keep prompts
        focused on subject and composition, not styling.
      </p>
      <textarea
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
        disabled={disabled || busy}
        placeholder="A laptop on a wooden desk with soft morning light, top-down perspective"
        rows={3}
        className="w-full border border-border bg-background px-3 py-2 text-sm text-foreground outline-hidden focus:border-primary disabled:cursor-not-allowed disabled:opacity-60"
      />
      <div className="flex flex-wrap items-center justify-between gap-2">
        <label className="grid gap-1">
          <span className="text-[10px] font-medium text-muted-foreground">Aspect ratio</span>
          <select
            value={aspect}
            disabled={disabled || busy}
            onChange={(e) => setAspect(e.target.value as typeof aspect)}
            className="h-8 border border-border bg-background px-2 text-xs outline-hidden focus:border-primary disabled:cursor-not-allowed disabled:opacity-60"
          >
            <option value="square">Square (1:1)</option>
            <option value="landscape">Landscape (16:9)</option>
            <option value="wide">Wide (21:9)</option>
            <option value="portrait">Portrait (9:16)</option>
          </select>
        </label>
        <Button
          type="button"
          size="sm"
          onClick={() => void onGenerate()}
          disabled={disabled || busy || !prompt.trim()}
          className="gap-1.5"
        >
          {busy ? (
            <>
              <Loader2 className="size-3.5 animate-spin" />
              Generating…
            </>
          ) : (
            <>
              <Sparkles className="size-3.5" />
              Generate image
            </>
          )}
        </Button>
      </div>
    </div>
  );
}

function truncateMid(value: string, length: number): string {
  if (value.length <= length) return value;
  const half = Math.floor(length / 2) - 1;
  return `${value.slice(0, half)}…${value.slice(-half)}`;
}
