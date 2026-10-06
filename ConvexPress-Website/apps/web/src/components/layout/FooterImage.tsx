import { MediaImage } from "@/components/media/MediaImage";
import type { Id } from "@convexpress-website/backend/generated/dataModel";
import type { FooterImageCell } from "@/lib/layout/types";

/** A cell width is a preferred size, bounded by its responsive column. */
export function FooterImage({ cell }: { cell: FooterImageCell }) {
  if (!cell.mediaId) return null;
  const width = cell.width ?? 200;
  const image = /^https?:\/\//.test(cell.mediaId)
    ? <img src={cell.mediaId} alt={cell.alt} style={{ width, maxWidth: "100%", height: "auto" }} loading="lazy" />
    : <div style={{ width, maxWidth: "100%" }}><MediaImage mediaId={cell.mediaId as Id<"media">} alt={cell.alt} className="h-auto w-full" preferredSize="medium" sizes={`(max-width: ${width}px) 100vw, ${width}px`} /></div>;
  return cell.href
    ? <a href={cell.href} target="_blank" rel="noopener noreferrer" style={{ maxWidth: "100%" }}>{image}</a>
    : image;
}
