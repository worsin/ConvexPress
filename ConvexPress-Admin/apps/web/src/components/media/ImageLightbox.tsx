import { useEffect, useCallback } from "react";
import { XIcon } from "lucide-react";
import { cn } from "@/lib/utils";

interface ImageLightboxProps {
  src: string;
  alt: string;
  open: boolean;
  onClose: () => void;
  caption?: string;
}

/**
 * Fullscreen image preview overlay.
 *
 * Closes on:
 *   - Escape key
 *   - Click on the dark backdrop (outside the image)
 *   - Click on the X button (top-right)
 *
 * Designed to replace `<a href={url} target="_blank">` patterns in the
 * media UI — opening the raw image URL inside Electron navigates the
 * webview away from the admin app and traps the user.
 */
export function ImageLightbox({
  src,
  alt,
  open,
  onClose,
  caption,
}: ImageLightboxProps) {
  const handleKeydown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    },
    [onClose],
  );

  useEffect(() => {
    if (!open) return;
    document.addEventListener("keydown", handleKeydown);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", handleKeydown);
      document.body.style.overflow = prev;
    };
  }, [open, handleKeydown]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/90 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label="Image preview"
      onClick={onClose}
    >
      <button
        type="button"
        onClick={onClose}
        className="absolute right-4 top-4 inline-flex size-10 items-center justify-center rounded-full bg-white/10 text-[#ccc] transition-colors hover:bg-white/20 hover:text-[#ccc]"
        aria-label="Close image preview"
      >
        <XIcon className="size-5" />
      </button>

      <div
        className={cn(
          "relative flex max-h-[92vh] max-w-[92vw] flex-col items-center gap-3",
        )}
        onClick={(e) => e.stopPropagation()}
      >
        <img
          src={src}
          alt={alt}
          className="max-h-[92vh] max-w-[92vw] object-contain"
        />
        {caption && (
          <p className="text-sm text-white/80 max-w-[92vw] text-center">
            {caption}
          </p>
        )}
      </div>

      <p className="absolute bottom-4 left-1/2 -translate-x-1/2 text-xs text-white/60">
        Press <kbd className="rounded bg-white/10 px-1.5 py-0.5 font-mono">Esc</kbd>, click outside, or tap the close button to dismiss.
      </p>
    </div>
  );
}
