/**
 * Social Links Widget - Website Renderer
 *
 * Displays social media profile links with platform icons.
 */

interface SocialProfile {
  platform: string;
  url: string;
}

interface SocialLinksWidgetConfig {
  profiles?: SocialProfile[];
}

const PLATFORM_LABELS: Record<string, string> = {
  twitter: "Twitter / X",
  facebook: "Facebook",
  instagram: "Instagram",
  linkedin: "LinkedIn",
  youtube: "YouTube",
  github: "GitHub",
  mastodon: "Mastodon",
  bluesky: "Bluesky",
  threads: "Threads",
  tiktok: "TikTok",
  pinterest: "Pinterest",
  reddit: "Reddit",
  discord: "Discord",
  twitch: "Twitch",
  email: "Email",
  website: "Website",
};

export function SocialLinksWidget({
  config,
}: {
  config: SocialLinksWidgetConfig;
}) {
  const profiles = config.profiles ?? [];

  if (profiles.length === 0) {
    return <p className="text-sm text-muted-foreground">No social profiles configured.</p>;
  }

  return (
    <ul className="flex flex-wrap gap-2">
      {profiles
        .filter((p) => p.platform && p.url)
        .map((profile, index) => {
          const href =
            profile.platform === "email"
              ? `mailto:${profile.url}`
              : profile.url;

          return (
            <li key={`${profile.platform}-${profile.url}`}>
              <a
                href={href}
                target={profile.platform === "email" ? undefined : "_blank"}
                rel={
                  profile.platform === "email"
                    ? undefined
                    : "noopener noreferrer"
                }
                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs border border-border hover:border-border/80 hover:bg-muted transition-colors"
                title={PLATFORM_LABELS[profile.platform] || profile.platform}
              >
                <span className="capitalize">
                  {PLATFORM_LABELS[profile.platform] || profile.platform}
                </span>
              </a>
            </li>
          );
        })}
    </ul>
  );
}
