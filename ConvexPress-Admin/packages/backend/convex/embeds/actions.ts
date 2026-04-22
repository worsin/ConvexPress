/**
 * oEmbed Resolver
 *
 * Fetches oEmbed metadata from a small whitelist of known-safe providers.
 * Used by the editor: when a user pastes a recognized URL, the editor
 * calls `resolveOembed` and stores the resulting provider/title/html on
 * an `EmbedBlock`. The public renderer trusts the provider-specific
 * shape (YouTube/Vimeo iframe, etc.) rather than raw HTML — so even if
 * this action someday returns malicious HTML, the renderer ignores it.
 *
 * Whitelist rationale: oEmbed providers occasionally change their
 * endpoints. We only ship support for the handful we can render safely
 * on the public site. Adding a new provider requires updating both the
 * PROVIDERS map here AND the `RenderEmbed` function in the public
 * BlockContentRenderer.
 */

import { v, ConvexError } from "convex/values";
import { action } from "../_generated/server";

type Provider = {
  /** Hostname match — case-insensitive exact match or subdomain. */
  hostnames: string[];
  /** oEmbed JSON endpoint. Full URL, will have `?url=<encoded>` appended. */
  endpoint: string;
  /** Our stable provider slug stored on the block. */
  slug: "youtube" | "vimeo" | "twitter" | "spotify" | "soundcloud";
};

const PROVIDERS: Provider[] = [
  {
    hostnames: ["www.youtube.com", "youtube.com", "youtu.be", "m.youtube.com"],
    endpoint: "https://www.youtube.com/oembed?format=json",
    slug: "youtube",
  },
  {
    hostnames: ["vimeo.com", "www.vimeo.com", "player.vimeo.com"],
    endpoint: "https://vimeo.com/api/oembed.json",
    slug: "vimeo",
  },
  {
    hostnames: ["twitter.com", "x.com", "www.twitter.com", "www.x.com"],
    endpoint: "https://publish.twitter.com/oembed?format=json",
    slug: "twitter",
  },
  {
    hostnames: ["open.spotify.com"],
    endpoint: "https://open.spotify.com/oembed",
    slug: "spotify",
  },
  {
    hostnames: ["soundcloud.com", "www.soundcloud.com"],
    endpoint: "https://soundcloud.com/oembed?format=json",
    slug: "soundcloud",
  },
];

function findProvider(rawUrl: string): Provider | null {
  try {
    const parsed = new URL(rawUrl);
    const hostname = parsed.hostname.toLowerCase();
    for (const p of PROVIDERS) {
      if (p.hostnames.includes(hostname)) return p;
    }
  } catch {
    return null;
  }
  return null;
}

/**
 * Resolve an embeddable URL to its oEmbed metadata. Returns null when the
 * URL isn't from a known provider — the editor can treat that as "paste
 * as plain text" rather than an embed.
 */
// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
export const resolveOembed = action({
  args: {
    url: v.string(),
  },
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  handler: async (
    ctx,
    args,
  ): Promise<{
    provider: Provider["slug"];
    title?: string;
    authorName?: string;
    html: string;
    width?: number;
    height?: number;
    thumbnailUrl?: string;
  } | null> => {
    // Auth: any authenticated user can resolve an embed (used while editing).
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new ConvexError({
        code: "UNAUTHORIZED",
        message: "Authentication required to resolve embeds.",
      });
    }

    const provider = findProvider(args.url);
    if (!provider) return null;

    const endpoint = `${provider.endpoint}${provider.endpoint.includes("?") ? "&" : "?"}url=${encodeURIComponent(args.url)}`;

    let res: Response;
    try {
      res = await fetch(endpoint, {
        headers: { Accept: "application/json" },
        // Small timeout — we don't want the editor hanging on a slow provider.
        signal: AbortSignal.timeout(5000),
      });
    } catch {
      return null;
    }
    if (!res.ok) return null;

    let body: Record<string, unknown>;
    try {
      body = (await res.json()) as Record<string, unknown>;
    } catch {
      return null;
    }

    const html = typeof body.html === "string" ? body.html : "";
    if (!html) return null;

    return {
      provider: provider.slug,
      title: typeof body.title === "string" ? body.title : undefined,
      authorName:
        typeof body.author_name === "string" ? body.author_name : undefined,
      html,
      width: typeof body.width === "number" ? body.width : undefined,
      height: typeof body.height === "number" ? body.height : undefined,
      thumbnailUrl:
        typeof body.thumbnail_url === "string"
          ? body.thumbnail_url
          : undefined,
    };
  },
});
