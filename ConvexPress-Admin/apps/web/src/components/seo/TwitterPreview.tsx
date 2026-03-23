/**
 * TwitterPreview - Twitter Card preview.
 *
 * Mimics how a shared link appears on Twitter/X.
 */

import { Image as ImageIcon } from "lucide-react";

interface TwitterPreviewProps {
  title: string;
  description: string;
  image: string | null;
  url: string;
  cardType?: "summary" | "summary_large_image";
}

export function TwitterPreview({
  title,
  description,
  image,
  url,
  cardType = "summary_large_image",
}: TwitterPreviewProps) {
  const hostname = (() => {
    try {
      return new URL(url).hostname;
    } catch {
      return url;
    }
  })();

  if (cardType === "summary") {
    return (
      <div className="border border-border rounded-none overflow-hidden max-w-md">
        <p className="text-[10px] text-muted-foreground px-3 pt-2 pb-1 uppercase tracking-wider font-medium">
          Twitter Preview (Summary)
        </p>
        <div className="flex">
          {/* Small square image */}
          <div className="w-[120px] h-[120px] shrink-0 bg-muted flex items-center justify-center">
            {image ? (
              <img
                src={image}
                alt="Twitter Preview"
                className="w-full h-full object-cover"
              />
            ) : (
              <ImageIcon className="size-6 text-muted-foreground" />
            )}
          </div>
          {/* Content */}
          <div className="p-2.5 min-w-0 bg-muted/30">
            <p className="text-[10px] text-muted-foreground">{hostname}</p>
            <p className="text-xs font-semibold text-foreground mt-0.5 line-clamp-2 leading-snug">
              {title || "Untitled"}
            </p>
            <p className="text-[11px] text-muted-foreground mt-0.5 line-clamp-2">
              {description || "No description set."}
            </p>
          </div>
        </div>
      </div>
    );
  }

  // summary_large_image
  return (
    <div className="border border-border rounded-none overflow-hidden max-w-md">
      <p className="text-[10px] text-muted-foreground px-3 pt-2 pb-1 uppercase tracking-wider font-medium">
        Twitter Preview (Large Image)
      </p>
      {/* Large image */}
      <div className="aspect-[2/1] bg-muted flex items-center justify-center">
        {image ? (
          <img
            src={image}
            alt="Twitter Preview"
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
      <div className="p-2.5 bg-muted/30 border-t border-border">
        <p className="text-xs font-semibold text-foreground line-clamp-1 leading-snug">
          {title || "Untitled"}
        </p>
        <p className="text-[11px] text-muted-foreground mt-0.5 line-clamp-2">
          {description || "No description set."}
        </p>
        <p className="text-[10px] text-muted-foreground mt-0.5">{hostname}</p>
      </div>
    </div>
  );
}
