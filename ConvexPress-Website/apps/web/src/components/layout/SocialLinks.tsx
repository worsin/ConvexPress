import { Linkedin, Rss } from "lucide-react";
import {
  SiFacebook,
  SiGithub,
  SiInstagram,
  SiX,
  SiYoutube,
} from "@icons-pack/react-simple-icons";
import type { ComponentType, SVGProps } from "react";

import { cn } from "@/lib/utils";
import { useMenuForLocation } from "@/hooks/layout/useMenuForLocation";

/**
 * Map of social platform names (lowercase) to icon components.
 * Uses react-simple-icons for brand icons, Lucide for generic icons.
 */
const SOCIAL_ICON_MAP: Record<string, ComponentType<SVGProps<SVGSVGElement>>> = {
  twitter: SiX,
  x: SiX,
  github: SiGithub,
  facebook: SiFacebook,
  instagram: SiInstagram,
  youtube: SiYoutube,
  linkedin: Linkedin,
  rss: Rss,
};

interface SocialLinksProps {
  className?: string;
  iconSize?: "sm" | "md";
  showLabels?: boolean;
  hideIcons?: boolean;
}

/**
 * Renders social media icon links from the "social" menu location.
 * All links open in a new tab.
 */
export function SocialLinks({
  className,
  iconSize = "sm",
  showLabels = false,
  hideIcons = false,
}: SocialLinksProps) {
  const socialMenu = useMenuForLocation("social");

  if (!socialMenu || socialMenu.items.length === 0) return null;

  const sizeClass = iconSize === "sm" ? "size-4" : "size-5";

  return (
    <div
      data-slot="social-links"
      className={cn("flex items-center gap-3", className)}
    >
      {socialMenu.items
        .filter((item) => !item.isOrphaned)
        .map((item) => {
          const label = item.label.toLowerCase();
          // Try to match by label or by URL domain
          let IconComponent = SOCIAL_ICON_MAP[label];
          if (!IconComponent) {
            // Try matching by URL
            for (const [key, icon] of Object.entries(SOCIAL_ICON_MAP)) {
              if (item.url.toLowerCase().includes(key)) {
                IconComponent = icon;
                break;
              }
            }
          }

          if (!IconComponent) return null;

          return (
            <a
              key={item.id}
              href={item.url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-muted-foreground transition-colors hover:text-foreground"
              aria-label={item.label}
            >
              <span className="inline-flex items-center gap-1.5">
                {!hideIcons && <IconComponent className={sizeClass} />}
                {showLabels && <span className="text-xs">{item.label}</span>}
              </span>
            </a>
          );
        })}
    </div>
  );
}
