/**
 * Video Widget - Website Renderer
 *
 * Embeds a video from YouTube, Vimeo, or a direct URL.
 * Uses loading="lazy" for iframe performance.
 */

import { useMemo } from "react";

interface VideoWidgetConfig {
  videoUrl?: string;
  aspectRatio?: string;
}

function getEmbedUrl(url: string): { type: "embed" | "direct"; src: string } | null {
  if (!url) return null;

  // YouTube
  const ytMatch = url.match(
    /(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/,
  );
  if (ytMatch) {
    return {
      type: "embed",
      src: `https://www.youtube-nocookie.com/embed/${ytMatch[1]}`,
    };
  }

  // Vimeo
  const vimeoMatch = url.match(/vimeo\.com\/(\d+)/);
  if (vimeoMatch) {
    return {
      type: "embed",
      src: `https://player.vimeo.com/video/${vimeoMatch[1]}`,
    };
  }

  // Direct video URL
  if (url.match(/\.(mp4|webm|ogg)(\?|$)/i)) {
    return { type: "direct", src: url };
  }

  // Default: try as embed
  return { type: "embed", src: url };
}

const ASPECT_RATIOS: Record<string, string> = {
  "16:9": "aspect-video",
  "4:3": "aspect-[4/3]",
  "1:1": "aspect-square",
};

export function VideoWidget({ config }: { config: VideoWidgetConfig }) {
  const embedInfo = useMemo(
    () => (config.videoUrl ? getEmbedUrl(config.videoUrl) : null),
    [config.videoUrl],
  );

  if (!config.videoUrl || !embedInfo) {
    return <p className="text-sm text-muted-foreground">No video URL provided.</p>;
  }

  const aspectClass = ASPECT_RATIOS[config.aspectRatio || "16:9"] || "aspect-video";

  if (embedInfo.type === "direct") {
    return (
      <div className={`relative w-full ${aspectClass}`}>
        <video
          src={embedInfo.src}
          controls
          className="absolute inset-0 w-full h-full object-contain"
        >
          Your browser does not support the video tag.
        </video>
      </div>
    );
  }

  return (
    <div className={`relative w-full ${aspectClass}`}>
      <iframe
        src={embedInfo.src}
        title="Video"
        loading="lazy"
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
        allowFullScreen
        className="absolute inset-0 w-full h-full border-0"
      />
    </div>
  );
}
