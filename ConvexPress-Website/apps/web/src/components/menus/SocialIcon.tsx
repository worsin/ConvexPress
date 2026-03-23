import { ExternalLink, Linkedin, Rss } from "lucide-react";
import {
  SiFacebook,
  SiGithub,
  SiInstagram,
  SiX,
  SiYoutube,
} from "@icons-pack/react-simple-icons";
import type { ComponentType, SVGProps } from "react";

import { cn } from "@/lib/utils";

/**
 * Map of social platform keys to icon components.
 * Uses react-simple-icons for brand icons, Lucide for generic icons.
 */
const PLATFORM_ICONS: Record<string, ComponentType<SVGProps<SVGSVGElement>>> = {
  twitter: SiX,
  x: SiX,
  facebook: SiFacebook,
  instagram: SiInstagram,
  linkedin: Linkedin,
  youtube: SiYoutube,
  github: SiGithub,
  rss: Rss,
  // Platforms without dedicated icons fall through to generic
};

interface SocialIconProps {
  /** Social platform key (e.g., "twitter", "github") */
  platform: string;
  /** Icon size class */
  className?: string;
}

/**
 * Renders the appropriate social media icon for a given platform.
 * Falls back to a generic external link icon for unrecognized platforms.
 */
export function SocialIcon({ platform, className }: SocialIconProps) {
  const IconComponent = PLATFORM_ICONS[platform] ?? ExternalLink;

  return (
    <IconComponent
      className={cn("size-4", className)}
      aria-hidden="true"
    />
  );
}
