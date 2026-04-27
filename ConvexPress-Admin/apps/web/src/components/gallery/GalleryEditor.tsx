import { useEffect, useMemo, useState } from "react";
import { useMutation } from "convex/react";
import { useQuery } from "convex-helpers/react/cache";
import { Link, useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import {
  ArrowDownIcon,
  ArrowUpIcon,
  CopyIcon,
  LoaderIcon,
  Trash2Icon,
} from "lucide-react";

import { api } from "@backend/convex/_generated/api";
import type { Id } from "@backend/convex/_generated/dataModel";
import { MediaPicker } from "@/components/media/MediaPicker";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

type GalleryStatus = "draft" | "publish" | "private" | "trash";
type GalleryVisibility = "public" | "private";
type GalleryLayout = "grid" | "masonry";

interface GalleryEditorProps {
  albumId?: Id<"gallery_albums">;
}

interface AlbumItemDraft {
  mediaId: Id<"media">;
  caption?: string;
  altText?: string;
}

function GalleryItemCard({
  item,
  index,
  total,
  onMove,
  onRemove,
  onChange,
}: {
  item: AlbumItemDraft;
  index: number;
  total: number;
  onMove: (from: number, to: number) => void;
  onRemove: () => void;
  onChange: (next: AlbumItemDraft) => void;
}) {
  const media = useQuery(api.media.queries.get, { mediaId: item.mediaId });

  return (
    <div className="rounded-3xl border border-border bg-card p-4">
      <div className="grid gap-4 lg:grid-cols-[160px_1fr]">
        <div className="overflow-hidden rounded-2xl bg-muted/40">
          {media?.url ? (
            <img
              src={media.url}
              alt={item.altText ?? media.altText ?? media.title}
              className="aspect-square h-full w-full object-cover"
            />
          ) : (
            <div className="flex aspect-square items-center justify-center text-xs text-muted-foreground">
              Preview unavailable
            </div>
          )}
        </div>
        <div className="grid gap-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <div className="font-medium text-foreground">
                {media?.title ?? "Image"}
              </div>
              <div className="text-xs text-muted-foreground">
                Item {index + 1} of {total}
              </div>
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="xs"
                disabled={index === 0}
                onClick={() => onMove(index, index - 1)}
              >
                <ArrowUpIcon className="size-3" />
              </Button>
              <Button
                variant="outline"
                size="xs"
                disabled={index === total - 1}
                onClick={() => onMove(index, index + 1)}
              >
                <ArrowDownIcon className="size-3" />
              </Button>
              <Button variant="ghost" size="xs" onClick={onRemove}>
                <Trash2Icon className="mr-1 size-3" />
                Remove
              </Button>
            </div>
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <div className="grid gap-2">
              <label className="text-sm font-medium">Caption override</label>
              <Textarea
                rows={3}
                value={item.caption ?? ""}
                onChange={(event) =>
                  onChange({
                    ...item,
                    caption: event.target.value,
                  })
                }
                placeholder="Optional caption override for this image."
              />
            </div>
            <div className="grid gap-2">
              <label className="text-sm font-medium">Alt text override</label>
              <Textarea
                rows={3}
                value={item.altText ?? ""}
                onChange={(event) =>
                  onChange({
                    ...item,
                    altText: event.target.value,
                  })
                }
                placeholder="Optional alt text override for this image."
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export function GalleryEditor({ albumId }: GalleryEditorProps) {
  const navigate = useNavigate();
  const album = useQuery(api.gallery.queries.get, albumId ? { albumId } : "skip");
  const categories = useQuery(api.gallery.queries.listCategories, {}) ?? [];
  const createAlbum = useMutation(api.gallery.mutations.createAlbum);
  const updateAlbum = useMutation(api.gallery.mutations.updateAlbum);
  const setAlbumItems = useMutation(api.gallery.mutations.setAlbumItems);

  const [title, setTitle] = useState("");
  const [excerpt, setExcerpt] = useState("");
  const [description, setDescription] = useState("");
  const [status, setStatus] = useState<GalleryStatus>("draft");
  const [visibility, setVisibility] = useState<GalleryVisibility>("public");
  const [layoutPreset, setLayoutPreset] = useState<GalleryLayout>("grid");
  const [columnsDesktop, setColumnsDesktop] = useState("3");
  const [columnsTablet, setColumnsTablet] = useState("2");
  const [columnsMobile, setColumnsMobile] = useState("1");
  const [coverMediaId, setCoverMediaId] = useState<Id<"media"> | undefined>();
  const [selectedCategories, setSelectedCategories] = useState<Set<string>>(new Set());
  const [lightboxEnabled, setLightboxEnabled] = useState(true);
  const [captionsEnabled, setCaptionsEnabled] = useState(true);
  const [downloadEnabled, setDownloadEnabled] = useState(false);
  const [items, setItems] = useState<AlbumItemDraft[]>([]);
  const [pendingMediaId, setPendingMediaId] = useState<Id<"media"> | undefined>();
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (!albumId || !album) return;
    setTitle(album.title ?? "");
    setExcerpt(album.excerpt ?? "");
    setDescription(album.description ?? "");
    setStatus((album.status as GalleryStatus) ?? "draft");
    setVisibility((album.visibility as GalleryVisibility) ?? "public");
    setLayoutPreset((album.layoutPreset as GalleryLayout) ?? "grid");
    setColumnsDesktop(String(album.columnsDesktop ?? 3));
    setColumnsTablet(String(album.columnsTablet ?? 2));
    setColumnsMobile(String(album.columnsMobile ?? 1));
    setCoverMediaId(album.coverMediaId);
    setSelectedCategories(
      new Set(album.categoryIds.map((categoryId: Id<"gallery_categories">) => categoryId.toString())),
    );
    setLightboxEnabled(Boolean(album.lightboxEnabled));
    setCaptionsEnabled(Boolean(album.captionsEnabled));
    setDownloadEnabled(Boolean(album.downloadEnabled));
    setItems(
      (album.items ?? []).map((item: any) => ({
        mediaId: item.mediaId,
        caption: item.caption ?? "",
        altText: item.altText ?? "",
      })),
    );
  }, [album, albumId]);

  const shortcode = useMemo(() => {
    const slug = album?.slug;
    if (!slug) return null;
    return `[album slug="${slug}"]`;
  }, [album?.slug]);

  if (albumId && album === undefined) {
    return (
      <div className="flex min-h-[320px] items-center justify-center">
        <LoaderIcon className="size-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (albumId && album === null) {
    return (
      <div className="rounded-3xl border border-border bg-card p-8">
        <h1 className="text-xl font-semibold">Gallery not found</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          The requested gallery could not be loaded.
        </p>
      </div>
    );
  }

  const toggleCategory = (categoryId: string) => {
    setSelectedCategories((prev) => {
      const next = new Set(prev);
      if (next.has(categoryId)) next.delete(categoryId);
      else next.add(categoryId);
      return next;
    });
  };

  const moveItem = (from: number, to: number) => {
    setItems((prev) => {
      const next = [...prev];
      const [item] = next.splice(from, 1);
      next.splice(to, 0, item);
      return next;
    });
  };

  const handleAddImage = () => {
    if (!pendingMediaId) {
      toast.error("Select an image from the media library first.");
      return;
    }

    setItems((prev) => {
      if (prev.some((item) => item.mediaId === pendingMediaId)) {
        toast.error("That image is already in the gallery.");
        return prev;
      }
      return [...prev, { mediaId: pendingMediaId }];
    });

    if (!coverMediaId) {
      setCoverMediaId(pendingMediaId);
    }
    setPendingMediaId(undefined);
  };

  const handleCopyShortcode = async () => {
    if (!shortcode) return;
    try {
      await navigator.clipboard.writeText(shortcode);
      toast.success("Shortcode copied.");
    } catch {
      toast.error("Failed to copy shortcode.");
    }
  };

  const handleSubmit = async () => {
    if (!title.trim()) {
      toast.error("Gallery title is required.");
      return;
    }

    if (items.length === 0) {
      toast.error("Add at least one image before saving.");
      return;
    }

    setIsSubmitting(true);
    try {
      const payload = {
        title,
        excerpt,
        description,
        status,
        visibility,
        coverMediaId,
        categoryIds: [...selectedCategories] as Id<"gallery_categories">[],
        layoutPreset,
        columnsDesktop: Number(columnsDesktop) || 3,
        columnsTablet: Number(columnsTablet) || 2,
        columnsMobile: Number(columnsMobile) || 1,
        lightboxEnabled,
        captionsEnabled,
        downloadEnabled,
      };

      if (albumId) {
        await updateAlbum({ albumId, ...payload });
        await setAlbumItems({
          albumId,
          items: items.map((item) => ({
            mediaId: item.mediaId,
            caption: item.caption?.trim() || undefined,
            altText: item.altText?.trim() || undefined,
          })),
        });
        toast.success("Gallery updated.");
      } else {
        const newAlbumId = await createAlbum({
          ...payload,
          items: items.map((item) => ({
            mediaId: item.mediaId,
            caption: item.caption?.trim() || undefined,
            altText: item.altText?.trim() || undefined,
          })),
        });
        toast.success("Gallery created.");
        await navigate({
          to: "/gallery/$albumId/edit",
          params: { albumId: newAlbumId },
          replace: true,
        });
      }
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to save gallery",
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6 p-6">
      <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">
            {albumId ? "Edit Gallery" : "Add New Gallery"}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Curate an image album, tune its public presentation, and publish it
            as a page or shortcode-driven embed.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link to="/gallery">
            <Button variant="outline">Back to Galleries</Button>
          </Link>
          <Button onClick={() => void handleSubmit()} disabled={isSubmitting}>
            {isSubmitting ? (
              <>
                <LoaderIcon className="mr-2 size-4 animate-spin" />
                Saving
              </>
            ) : (
              "Save Gallery"
            )}
          </Button>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1.6fr_0.9fr]">
        <section className="rounded-3xl border border-border bg-card p-5">
          <div className="grid gap-4">
            <div className="grid gap-2">
              <label htmlFor="gallery-title" className="text-sm font-medium">
                Title
              </label>
              <Input
                id="gallery-title"
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                placeholder="Summer in Kyoto"
              />
            </div>

            <div className="grid gap-2">
              <label htmlFor="gallery-excerpt" className="text-sm font-medium">
                Short description
              </label>
              <Textarea
                id="gallery-excerpt"
                rows={3}
                value={excerpt}
                onChange={(event) => setExcerpt(event.target.value)}
                placeholder="A cinematic photo diary from a week in Kyoto."
              />
            </div>

            <div className="grid gap-2">
              <label htmlFor="gallery-description" className="text-sm font-medium">
                Full description
              </label>
              <Textarea
                id="gallery-description"
                rows={5}
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                placeholder="Add context, credits, location notes, or exhibit copy."
              />
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="grid gap-2">
                <label className="text-sm font-medium">Status</label>
                <Select value={status} onValueChange={(value) => setStatus(value as GalleryStatus)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="draft">Draft</SelectItem>
                    <SelectItem value="publish">Published</SelectItem>
                    <SelectItem value="private">Private</SelectItem>
                    <SelectItem value="trash">Trash</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <label className="text-sm font-medium">Visibility</label>
                <Select
                  value={visibility}
                  onValueChange={(value) =>
                    setVisibility(value as GalleryVisibility)
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="public">Public</SelectItem>
                    <SelectItem value="private">Private</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-3">
              <div className="grid gap-2">
                <label className="text-sm font-medium">Desktop columns</label>
                <Input
                  type="number"
                  min={1}
                  max={6}
                  value={columnsDesktop}
                  onChange={(event) => setColumnsDesktop(event.target.value)}
                />
              </div>
              <div className="grid gap-2">
                <label className="text-sm font-medium">Tablet columns</label>
                <Input
                  type="number"
                  min={1}
                  max={4}
                  value={columnsTablet}
                  onChange={(event) => setColumnsTablet(event.target.value)}
                />
              </div>
              <div className="grid gap-2">
                <label className="text-sm font-medium">Mobile columns</label>
                <Input
                  type="number"
                  min={1}
                  max={2}
                  value={columnsMobile}
                  onChange={(event) => setColumnsMobile(event.target.value)}
                />
              </div>
            </div>

            <div className="grid gap-2">
              <label className="text-sm font-medium">Layout</label>
              <Select
                value={layoutPreset}
                onValueChange={(value) => setLayoutPreset(value as GalleryLayout)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="grid">Grid</SelectItem>
                  <SelectItem value="masonry">Masonry</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="grid gap-3 rounded-2xl border border-border/70 bg-muted/20 p-4">
              <div className="text-sm font-medium">Display options</div>
              <label className="flex items-center gap-3 text-sm">
                <Checkbox
                  checked={lightboxEnabled}
                  onCheckedChange={(checked) => setLightboxEnabled(Boolean(checked))}
                />
                Enable lightbox modal
              </label>
              <label className="flex items-center gap-3 text-sm">
                <Checkbox
                  checked={captionsEnabled}
                  onCheckedChange={(checked) => setCaptionsEnabled(Boolean(checked))}
                />
                Show captions in embeds and album pages
              </label>
              <label className="flex items-center gap-3 text-sm">
                <Checkbox
                  checked={downloadEnabled}
                  onCheckedChange={(checked) => setDownloadEnabled(Boolean(checked))}
                />
                Allow direct image downloads in the lightbox
              </label>
            </div>
          </div>
        </section>

        <aside className="flex flex-col gap-6">
          <section className="rounded-3xl border border-border bg-card p-5">
            <h2 className="text-lg font-medium text-foreground">Cover Image</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Used for gallery cards and archive previews.
            </p>
            <div className="mt-4">
              <MediaPicker
                label="Select Cover Image"
                allowedTypes={["image"]}
                selectedId={coverMediaId}
                onSelect={setCoverMediaId}
                onClear={() => setCoverMediaId(undefined)}
              />
            </div>
          </section>

          <section className="rounded-3xl border border-border bg-card p-5">
            <h2 className="text-lg font-medium text-foreground">Categories</h2>
            <div className="mt-4 grid gap-3">
              {categories.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No categories yet. Create them from the Categories screen.
                </p>
              ) : (
                categories.map((category: any) => (
                  <label
                    key={category._id}
                    className="flex items-center gap-3 text-sm"
                  >
                    <Checkbox
                      checked={selectedCategories.has(category._id.toString())}
                      onCheckedChange={() => toggleCategory(category._id.toString())}
                    />
                    <span>{category.name}</span>
                  </label>
                ))
              )}
            </div>
          </section>

          <section className="rounded-3xl border border-border bg-card p-5">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-medium text-foreground">Embed</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Use the shortcode in page or post content.
                </p>
              </div>
              <Button
                variant="outline"
                size="xs"
                disabled={!shortcode}
                onClick={() => void handleCopyShortcode()}
              >
                <CopyIcon className="mr-1 size-3" />
                Copy
              </Button>
            </div>
            <pre className="mt-4 overflow-x-auto rounded-2xl bg-muted/50 p-4 text-xs text-foreground">
              {shortcode ?? "Save this gallery to generate a shortcode."}
            </pre>
          </section>
        </aside>
      </div>

      <section className="rounded-3xl border border-border bg-card p-5">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="text-lg font-medium text-foreground">Album Images</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Add images from the media library, then adjust order and per-image
              text overrides.
            </p>
          </div>
        </div>

        <div className="mt-4 grid gap-4 lg:grid-cols-[1fr_auto] lg:items-end">
          <MediaPicker
            label="Pick Image To Add"
            allowedTypes={["image"]}
            selectedId={pendingMediaId}
            onSelect={setPendingMediaId}
            onClear={() => setPendingMediaId(undefined)}
          />
          <Button onClick={handleAddImage}>Add Image To Gallery</Button>
        </div>

        <div className="mt-6 grid gap-4">
          {items.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
              No images added yet.
            </div>
          ) : (
            items.map((item, index) => (
              <GalleryItemCard
                key={`${item.mediaId}-${index}`}
                item={item}
                index={index}
                total={items.length}
                onMove={moveItem}
                onRemove={() =>
                  setItems((prev) => prev.filter((_, itemIndex) => itemIndex !== index))
                }
                onChange={(next) =>
                  setItems((prev) =>
                    prev.map((entry, itemIndex) =>
                      itemIndex === index ? next : entry,
                    ),
                  )
                }
              />
            ))
          )}
        </div>
      </section>
    </div>
  );
}
