/**
 * FacebookPreview - Open Graph share preview card.
 *
 * Mimics how a shared link appears on Facebook.
 */

import { Image as ImageIcon } from "lucide-react";

interface FacebookPreviewProps {
  title: string;
  description: string;
  image: string | null;
  url: string;
}

export function FacebookPreview({
  title,
  description,
  image,
  url,
}: FacebookPreviewProps) {
  const hostname = (() => {
    try {
      return new URL(url).hostname;
    } catch {
      return url;
    }
  })();

  return (
    <div className="border border-border rounded-none overflow-hidden max-w-md">
      <p className="text-[10px] text-muted-foreground px-3 pt-2 pb-1 uppercase tracking-wider font-medium">
        Facebook Preview
      </p>
      {/* Image */}
      <div className="aspect-[1200/630] bg-muted flex items-center justify-center">
        {image ? (
          <img
            src={image}
            alt="OG Preview"
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="flex flex-col items-center gap-1.5 text-muted-foreground">
            <ImageIcon className="size-8" />
            <span className="text-[10px]">No image set</span>
          </div>
        )}
      </div>
      {/* Content */}
      <div className="p-3 bg-muted/30 border-t border-border">
        <p className="text-[10px] text-muted-foreground uppercase tracking-wider">
          {hostname}
        </p>
        <p className="text-sm font-semibold text-foreground mt-0.5 line-clamp-2 leading-snug">
          {title || "Untitled"}
        </p>
        <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
          {description || "No description set."}
        </p>
      </div>
    </div>
  );
}
