/**
 * Social media URL patterns for the Social Links Menu.
 *
 * Maps URL domain fragments to platform identifiers.
 * Used by the SocialLinksMenu component to detect which icon to render
 * based on the URL of each menu item.
 *
 * When a menu item's URL contains one of these domain fragments,
 * the corresponding platform key is used to look up the icon.
 */
export const SOCIAL_PATTERNS: Record<string, string> = {
  "facebook.com": "facebook",
  "twitter.com": "twitter",
  "x.com": "twitter",
  "instagram.com": "instagram",
  "linkedin.com": "linkedin",
  "youtube.com": "youtube",
  "github.com": "github",
  "tiktok.com": "tiktok",
  "pinterest.com": "pinterest",
  "mastodon": "mastodon",
  "threads.net": "threads",
  "reddit.com": "reddit",
  "discord.com": "discord",
  "discord.gg": "discord",
  "twitch.tv": "twitch",
  "tumblr.com": "tumblr",
  "vimeo.com": "vimeo",
  "medium.com": "medium",
  "dribbble.com": "dribbble",
  "behance.net": "behance",
  "codepen.io": "codepen",
  "stackoverflow.com": "stackoverflow",
  "dev.to": "dev",
  "hashnode.com": "hashnode",
  "producthunt.com": "producthunt",
  "figma.com": "figma",
  "slack.com": "slack",
  "telegram.org": "telegram",
  "t.me": "telegram",
  "whatsapp.com": "whatsapp",
  "wa.me": "whatsapp",
  "snapchat.com": "snapchat",
  "spotify.com": "spotify",
  "soundcloud.com": "soundcloud",
  "apple.com/music": "apple-music",
  "rss": "rss",
  "feed": "rss",
};

/**
 * Detect the social platform from a URL by matching against known patterns.
 *
 * @param url - The URL to check
 * @returns The platform key (e.g., "twitter", "github") or null if no match
 */
export function detectSocialPlatform(url: string): string | null {
  const lowerUrl = url.toLowerCase();
  for (const [pattern, platform] of Object.entries(SOCIAL_PATTERNS)) {
    if (lowerUrl.includes(pattern)) {
      return platform;
    }
  }
  return null;
}
