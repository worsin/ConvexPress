/**
 * EmbedBlock - Custom TipTap Node Extension
 *
 * Embeds external content (YouTube, Vimeo, Twitter/X, generic oEmbed).
 * Renders an iframe or embed placeholder based on the provider.
 *
 * Usage: `/embed`, `/youtube`, `/video`
 */

import { Node, mergeAttributes } from "@tiptap/core";

export interface EmbedBlockOptions {
  HTMLAttributes: Record<string, any>;
}

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    embedBlock: {
      setEmbed: (attrs: { url: string }) => ReturnType;
    };
  }
}

/**
 * Detect provider from URL.
 */
function detectProvider(url: string): string {
  try {
    const u = new URL(url);
    const host = u.hostname.replace("www.", "");
    if (host.includes("youtube.com") || host.includes("youtu.be"))
      return "youtube";
    if (host.includes("vimeo.com")) return "vimeo";
    if (
      host.includes("twitter.com") ||
      host.includes("x.com")
    )
      return "twitter";
    return "generic";
  } catch {
    return "generic";
  }
}

/**
 * Extract YouTube embed URL from a YouTube watch URL.
 */
function getYouTubeEmbedUrl(url: string): string | null {
  try {
    const u = new URL(url);
    let videoId: string | null = null;

    if (u.hostname.includes("youtu.be")) {
      videoId = u.pathname.slice(1);
    } else if (u.hostname.includes("youtube.com")) {
      videoId = u.searchParams.get("v");
    }

    return videoId ? `https://www.youtube.com/embed/${videoId}` : null;
  } catch {
    return null;
  }
}

/**
 * Extract Vimeo embed URL.
 */
function getVimeoEmbedUrl(url: string): string | null {
  try {
    const u = new URL(url);
    const match = u.pathname.match(/\/(\d+)/);
    return match ? `https://player.vimeo.com/video/${match[1]}` : null;
  } catch {
    return null;
  }
}

export const EmbedBlock = Node.create<EmbedBlockOptions>({
  name: "embed",

  group: "block",

  atom: true,

  draggable: true,

  addOptions() {
    return {
      HTMLAttributes: {},
    };
  },

  addAttributes() {
    return {
      url: {
        default: null,
      },
      provider: {
        default: "generic",
      },
      embedUrl: {
        default: null,
      },
      width: {
        default: "100%",
      },
      height: {
        default: 400,
      },
    };
  },

  parseHTML() {
    return [
      {
        tag: "div[data-type='embed']",
      },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    const provider = HTMLAttributes.provider || "generic";
    const embedUrl = HTMLAttributes.embedUrl || HTMLAttributes.url;

    if (provider === "youtube" || provider === "vimeo") {
      return [
        "div",
        mergeAttributes(this.options.HTMLAttributes, {
          "data-type": "embed",
          "data-provider": provider,
          class: "embed-block",
          style: "position:relative;padding-bottom:56.25%;height:0;overflow:hidden;",
        }),
        [
          "iframe",
          {
            src: embedUrl,
            frameborder: "0",
            allowfullscreen: "true",
            allow:
              "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture",
            style:
              "position:absolute;top:0;left:0;width:100%;height:100%;",
          },
        ],
      ];
    }

    return [
      "div",
      mergeAttributes(this.options.HTMLAttributes, {
        "data-type": "embed",
        "data-provider": provider,
        class: "embed-block",
      }),
      [
        "a",
        { href: HTMLAttributes.url, target: "_blank", rel: "noopener noreferrer" },
        HTMLAttributes.url || "Embedded content",
      ],
    ];
  },

  addCommands() {
    return {
      setEmbed:
        (attrs) =>
        ({ commands }) => {
          const provider = detectProvider(attrs.url);
          let embedUrl: string | null = attrs.url;

          if (provider === "youtube") {
            embedUrl = getYouTubeEmbedUrl(attrs.url) || attrs.url;
          } else if (provider === "vimeo") {
            embedUrl = getVimeoEmbedUrl(attrs.url) || attrs.url;
          }

          return commands.insertContent({
            type: this.name,
            attrs: {
              ...attrs,
              provider,
              embedUrl,
            },
          });
        },
    };
  },
});
