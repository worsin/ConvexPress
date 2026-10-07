import { z } from "zod";
import { reviewedEmbed, type EmbedKind } from "./shared/embedProviders";

/** Write-time provider checks reuse the rendering adapters. Stored schemas and
 * draft recovery remain permissive so an operator can repair historical values.
 * This checks URL shape and provider capability, never remote availability. */
export function assertAuthoringEmbeds(name: string, attrs: Record<string, unknown>): void {
  function check(value: unknown, path: (string | number)[], kind?: EmbedKind, fieldMessage?: string) {
    if (value === undefined || value === null || value === "") return;
    try {
      reviewedEmbed(value as string, kind);
    } catch {
      const message = kind === "video" ? "Use a supported YouTube or Vimeo video URL."
        : kind === "map" ? "Use an OpenStreetMap share embed URL."
        : kind === "scheduler" ? "Use a Calendly scheduling URL."
        : "Use a supported YouTube, Vimeo, OpenStreetMap share embed, or Calendly scheduling URL.";
      throw new z.ZodError([{ code: "custom", path, message: fieldMessage ?? message }]);
    }
  }
  switch (name) {
    case "core/embed": check(attrs.url, ["url"], "video"); break;
    case "core/booking-cta": check(attrs.embedUrl, ["embedUrl"], "scheduler"); break;
    case "blocks/contact-stack":
      check(attrs.mapEmbedUrl, ["mapEmbedUrl"], "map");
      // Contact links display value first, with label as the fallback. Preserve
      // either supported form while refusing an action with no visible name.
      (attrs.items as { href: string; value: string; label: string }[]).forEach((row, index) => {
        if (row.href && !(row.value || row.label).replace(/[\s\p{Default_Ignorable_Code_Point}]/gu, ""))
          throw new z.ZodError([{ code: "custom", path: ["items", index, "value"], message: "Enter visible contact link text or a label." }]);
      });
      break;
    case "core/iframe": check((attrs.url as { href?: string } | undefined)?.href, ["url", "href"]); break;
    case "core/script-embed":
      if (attrs.resourceId) {
        check(attrs.provider === "youtube"
          ? `https://www.youtube.com/embed/${attrs.resourceId}`
          : `https://player.vimeo.com/video/${attrs.resourceId}`, ["resourceId"], "video",
          attrs.provider === "youtube" ? "Enter the 11-character YouTube video ID."
            : "Enter the numeric Vimeo video ID.");
      }
      break;
  }
}
