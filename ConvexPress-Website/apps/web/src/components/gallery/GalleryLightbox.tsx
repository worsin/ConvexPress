import { useRef } from "react";
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  DownloadIcon,
  XIcon,
} from "lucide-react";

import { MediaImage } from "@/components/media/MediaImage";
import { Button } from "@/components/ui/button";
import { sanitizeHref } from "@/lib/security/url";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogTitle,
} from "@/components/ui/dialog";

interface GalleryItem {
  mediaId: string;
  caption?: string;
  altText?: string;
  media: {
    url: string;
    title?: string;
  };
}

interface GalleryLightboxProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  items: GalleryItem[];
  currentIndex: number;
  onIndexChange: (index: number) => void;
  downloadEnabled?: boolean;
}

export function GalleryLightbox({
  open,
  onOpenChange,
  items,
  currentIndex,
  onIndexChange,
  downloadEnabled,
}: GalleryLightboxProps) {
  const item = items[currentIndex];
  const downloadUrl = sanitizeHref(item?.media.url, {
    allowRelative: false,
    allowHash: false,
  });

  const closeRef = useRef<HTMLButtonElement>(null);

  if (!item) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        initialFocus={closeRef}
        finalFocus
        onKeyDown={(event) => {
          if (items.length < 2 || event.altKey || event.ctrlKey || event.metaKey) return;
          if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
            event.preventDefault();
            onIndexChange((currentIndex + (event.key === "ArrowLeft" ? -1 : 1) + items.length) % items.length);
          }
        }}
        className="w-[min(96vw,1100px)] max-w-none rounded-[2rem] bg-neutral-950 p-0 text-white">
        <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
          <DialogTitle aria-live="polite" aria-atomic="true" className="text-sm font-medium">
            Image {currentIndex + 1} of {items.length}
          </DialogTitle>
          <div className="flex items-center gap-2">
            {downloadEnabled && downloadUrl && (
              <a
                href={downloadUrl}
                download
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center rounded-full border border-white/20 px-3 py-1.5 text-xs text-white transition-colors hover:bg-white/10"
              >
                <DownloadIcon className="mr-1 size-3" />
                Download
              </a>
            )}
            <DialogClose ref={closeRef} aria-label="Close gallery" className="inline-flex items-center rounded-full border border-white/20 p-2 text-white transition-colors hover:bg-white/10">
              <XIcon aria-hidden="true" className="size-4" />
            </DialogClose>
          </div>
        </div>

        <div className="grid gap-4 p-4 lg:grid-cols-[auto_1fr_auto] lg:items-center">
          <div className="flex justify-start">
            <Button
              aria-label="Previous image"
              disabled={items.length < 2}
              variant="outline"
              className="border-white/20 bg-transparent text-white hover:bg-white/10"
              onClick={() =>
                onIndexChange(currentIndex === 0 ? items.length - 1 : currentIndex - 1)
              }
            >
              <ChevronLeftIcon aria-hidden="true" className="size-4" />
            </Button>
          </div>

          <div className="flex flex-col gap-4">
            <div className="overflow-hidden rounded-[1.5rem] bg-black/40">
              <MediaImage
                mediaId={item.mediaId as never}
                alt={item.altText ?? item.media.title ?? ""}
                preferredSize="large"
                loading="eager"
                className="max-h-[72vh] w-full object-contain"
                sizes="100vw"
              />
            </div>
            {item.caption && (
              <div className="rounded-[1.25rem] border border-white/10 bg-white/5 p-4">
                <p className="text-sm leading-7 text-white/90">{item.caption}</p>
              </div>
            )}
          </div>

          <div className="flex justify-end">
            <Button
              aria-label="Next image"
              disabled={items.length < 2}
              variant="outline"
              className="border-white/20 bg-transparent text-white hover:bg-white/10"
              onClick={() =>
                onIndexChange(currentIndex === items.length - 1 ? 0 : currentIndex + 1)
              }
            >
              <ChevronRightIcon aria-hidden="true" className="size-4" />
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
