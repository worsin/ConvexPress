import { useRef } from "react";
import { XIcon } from "lucide-react";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";

interface ImageLightboxProps {
  src: string;
  alt: string;
  open: boolean;
  onClose: () => void;
  caption?: string;
}

/** Image preview with the shared modal's focus containment, Escape and backdrop dismissal. */
export function ImageLightbox({ src, alt, open, onClose, caption }: ImageLightboxProps) {
  const closeRef = useRef<HTMLButtonElement>(null);

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => { if (!nextOpen) onClose(); }}>
      <DialogContent
        initialFocus={closeRef}
        finalFocus
        className="w-auto max-w-[92vw] overflow-visible border-0 bg-transparent p-0 shadow-none ring-0"
      >
        <DialogTitle className="sr-only">Image preview</DialogTitle>
        <div className="flex justify-end">
          <DialogClose
            ref={closeRef}
            aria-label="Close image preview"
            className="inline-flex size-10 items-center justify-center rounded-full bg-white/10 text-white transition-colors hover:bg-white/20"
          >
            <XIcon aria-hidden="true" className="size-5" />
          </DialogClose>
        </div>
        <img src={src} alt={alt} className="max-h-[75vh] max-w-[92vw] object-contain" />
        {caption && <p className="max-w-[92vw] text-center text-sm text-white/80">{caption}</p>}
        <DialogDescription className="text-center text-xs text-white/60">
          Press <kbd className="rounded bg-white/10 px-1.5 py-0.5 font-mono">Esc</kbd>, click outside, or use the close button to dismiss.
        </DialogDescription>
      </DialogContent>
    </Dialog>
  );
}
