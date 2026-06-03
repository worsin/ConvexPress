import type { BlockRendererProps, WebsiteBlockDefinition } from "@/lib/blocks/types";
import { RichText } from "../_shared/rendering";
import { aswSocialShareAttrsSchema, type AswSocialShareAttrs } from "./schema";

const labels: Record<AswSocialShareAttrs["networks"][number], string> = {
  facebook: "Facebook",
  x: "X",
  pinterest: "Pinterest",
  linkedin: "LinkedIn",
  email: "Email",
  copy: "Copy link",
};

function shareHref(network: AswSocialShareAttrs["networks"][number], url: string) {
  const encoded = encodeURIComponent(url || "");
  switch (network) {
    case "facebook":
      return `https://www.facebook.com/sharer/sharer.php?u=${encoded}`;
    case "x":
      return `https://x.com/intent/tweet?url=${encoded}`;
    case "pinterest":
      return `https://www.pinterest.com/pin/create/button/?url=${encoded}`;
    case "linkedin":
      return `https://www.linkedin.com/sharing/share-offsite/?url=${encoded}`;
    case "email":
      return `mailto:?body=${encoded}`;
    case "copy":
    default:
      return url || "#";
  }
}

function AswSocialShareRenderer({ attrs }: BlockRendererProps<AswSocialShareAttrs>) {
  const shareUrl = attrs.shareUrlMode === "custom" ? attrs.customUrl : "";
  return (
    <aside
      data-share-url-mode={attrs.shareUrlMode}
      className="grid gap-4 border border-border bg-card p-5 md:grid-cols-[minmax(0,1fr)_auto] md:items-center"
    >
      <div className="space-y-2">
        {attrs.heading && <h2 className="text-xl font-semibold text-foreground">{attrs.heading}</h2>}
        <RichText text={attrs.body} className="text-sm text-muted-foreground" />
      </div>
      <div className="flex flex-wrap gap-2">
        {attrs.networks.map((network) => (
          <a
            key={network}
            href={shareHref(network, shareUrl)}
            target={network === "email" || network === "copy" ? undefined : "_blank"}
            rel={network === "email" || network === "copy" ? undefined : "noopener noreferrer"}
            data-share-network={network}
            className="inline-flex min-h-10 items-center border border-border px-3 text-sm font-semibold text-foreground hover:bg-muted"
          >
            {labels[network]}
          </a>
        ))}
      </div>
    </aside>
  );
}

export const definition = {
  name: "asw/social-share",
  title: "ASW Social Share",
  version: 1,
  schema: aswSocialShareAttrsSchema,
  Renderer: AswSocialShareRenderer,
  rendererStatus: "ready",
} satisfies WebsiteBlockDefinition;

export default definition;
