import { cn } from "@/lib/utils";
import { useMenuForLocation } from "@/hooks/layout/useMenuForLocation";
import { detectSocialPlatform } from "./social-patterns";
import { SocialIcon } from "./SocialIcon";

interface SocialLinksMenuProps {
  /** Additional CSS classes for the container */
  className?: string;
  /** Icon size variant */
  iconSize?: "sm" | "md" | "lg";
}

const SIZE_CLASSES = {
  sm: "size-4",
  md: "size-5",
  lg: "size-6",
} as const;

/**
 * Social Links Menu component.
 * Renders social media icon links from the "social" menu location.
 * Detects platform from URL and renders the appropriate icon.
 * All links open in a new tab.
 *
 * WordPress equivalent: wp_nav_menu() with the social location.
 */
export function SocialLinksMenu({
  className,
  iconSize = "sm",
}: SocialLinksMenuProps) {
  const socialMenu = useMenuForLocation("social");

  if (!socialMenu || socialMenu.items.length === 0) return null;

  const visibleItems = socialMenu.items.filter((item) => !item.isOrphaned);

  if (visibleItems.length === 0) return null;

  return (
    <nav
      data-slot="social-links-menu"
      aria-label={socialMenu.name}
      className={cn("flex items-center gap-3", className)}
    >
      {visibleItems.map((item) => {
        const platform = detectSocialPlatform(item.url);

        if (!platform) {
          // Unknown platform: render as text link
          return (
            <a
              key={item.id}
              href={item.url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-muted-foreground transition-colors hover:text-foreground"
              title={item.label}
            >
              {item.label}
            </a>
          );
        }

        return (
          <a
            key={item.id}
            href={item.url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-muted-foreground transition-colors hover:text-foreground"
            aria-label={item.label}
          >
            <SocialIcon
              platform={platform}
              className={SIZE_CLASSES[iconSize]}
            />
          </a>
        );
      })}
    </nav>
  );
}
