import { Linkedin } from "lucide-react";
import {
  SiFacebook,
  SiGithub,
  SiInstagram,
  SiX,
  SiYoutube,
} from "@icons-pack/react-simple-icons";

import type { SocialLinks } from "@/lib/dashboard/types";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface SocialLinksFormProps {
  value: SocialLinks;
  onChange: (links: SocialLinks) => void;
  errors?: Record<string, string>;
}

const SOCIAL_PLATFORMS = [
  {
    key: "twitter" as const,
    label: "X (Twitter)",
    icon: SiX,
    placeholder: "https://x.com/username",
  },
  {
    key: "facebook" as const,
    label: "Facebook",
    icon: SiFacebook,
    placeholder: "https://facebook.com/username",
  },
  {
    key: "instagram" as const,
    label: "Instagram",
    icon: SiInstagram,
    placeholder: "https://instagram.com/username",
  },
  {
    key: "linkedin" as const,
    label: "LinkedIn",
    icon: Linkedin,
    placeholder: "https://linkedin.com/in/username",
  },
  {
    key: "github" as const,
    label: "GitHub",
    icon: SiGithub,
    placeholder: "https://github.com/username",
  },
  {
    key: "youtube" as const,
    label: "YouTube",
    icon: SiYoutube,
    placeholder: "https://youtube.com/@channel",
  },
];

/**
 * Social platform URL inputs. Stores values as-is (no normalization).
 */
export function SocialLinksForm({
  value,
  onChange,
  errors,
}: SocialLinksFormProps) {
  const handleChange = (key: keyof SocialLinks, newValue: string) => {
    onChange({ ...value, [key]: newValue });
  };

  return (
    <div data-slot="social-links-form" className="space-y-3">
      <Label className="text-xs font-medium">Social Links</Label>
      <div className="space-y-2">
        {SOCIAL_PLATFORMS.map((platform) => {
          const Icon = platform.icon;
          const fieldError = errors?.[platform.key];

          return (
            <div key={platform.key} className="space-y-1">
              <div className="flex items-center gap-2">
                <Icon className="size-4 shrink-0 text-muted-foreground" />
                <Input
                  id={`social-${platform.key}`}
                  type="url"
                  placeholder={platform.placeholder}
                  value={value[platform.key] ?? ""}
                  onChange={(e) => handleChange(platform.key, e.target.value)}
                  aria-label={platform.label}
                  aria-invalid={Boolean(fieldError)}
                  aria-describedby={
                    fieldError ? `social-${platform.key}-error` : undefined
                  }
                />
              </div>
              {fieldError && (
                <p
                  id={`social-${platform.key}-error`}
                  className="pl-6 text-[10px] text-destructive"
                  role="alert"
                >
                  {fieldError}
                </p>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
