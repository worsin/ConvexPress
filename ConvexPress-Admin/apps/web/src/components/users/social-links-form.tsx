/**
 * Social Links Form Section
 *
 * A form section for editing social media links.
 * Used by both the Edit User and Your Profile pages.
 */

import {
  GlobeIcon,
  TwitterIcon,
  FacebookIcon,
  InstagramIcon,
  LinkedinIcon,
  YoutubeIcon,
  GithubIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { SocialLinks } from "@/lib/users/types";

interface SocialLinksFormProps {
  /** Current social links values. */
  value: SocialLinks;
  /** Called when any field changes. */
  onChange: (links: SocialLinks) => void;
  /** Whether the form is disabled. */
  disabled?: boolean;
}

const socialFields: Array<{
  key: keyof SocialLinks;
  label: string;
  placeholder: string;
  icon: React.ComponentType<{ className?: string }>;
}> = [
  {
    key: "website",
    label: "Website",
    placeholder: "https://example.com",
    icon: GlobeIcon,
  },
  {
    key: "twitter",
    label: "X (Twitter)",
    placeholder: "https://x.com/username or @username",
    icon: TwitterIcon,
  },
  {
    key: "facebook",
    label: "Facebook",
    placeholder: "https://facebook.com/username",
    icon: FacebookIcon,
  },
  {
    key: "instagram",
    label: "Instagram",
    placeholder: "https://instagram.com/username or @username",
    icon: InstagramIcon,
  },
  {
    key: "linkedin",
    label: "LinkedIn",
    placeholder: "https://linkedin.com/in/username",
    icon: LinkedinIcon,
  },
  {
    key: "youtube",
    label: "YouTube",
    placeholder: "https://youtube.com/@channel",
    icon: YoutubeIcon,
  },
  {
    key: "github",
    label: "GitHub",
    placeholder: "https://github.com/username",
    icon: GithubIcon,
  },
];

export function SocialLinksForm({
  value,
  onChange,
  disabled = false,
}: SocialLinksFormProps) {
  const handleChange = (key: keyof SocialLinks, newValue: string) => {
    onChange({ ...value, [key]: newValue || undefined });
  };

  return (
    <div className="space-y-3">
      {socialFields.map((field) => {
        const Icon = field.icon;
        return (
          <div key={field.key}>
            <label
              htmlFor={`social-${field.key}`}
              className="mb-1 flex items-center gap-1.5 text-xs font-medium text-foreground"
            >
              <Icon className="size-3.5 text-muted-foreground" />
              {field.label}
            </label>
            <input
              id={`social-${field.key}`}
              type="text"
              value={value[field.key] ?? ""}
              onChange={(e) => handleChange(field.key, e.target.value)}
              placeholder={field.placeholder}
              disabled={disabled}
              className={cn(
                "h-8 w-full border border-border bg-background px-2.5 text-xs text-foreground",
                "placeholder:text-muted-foreground/50",
                "focus:border-ring focus:outline-hidden focus:ring-1 focus:ring-ring/50",
                "disabled:cursor-not-allowed disabled:opacity-50",
              )}
            />
          </div>
        );
      })}
    </div>
  );
}
