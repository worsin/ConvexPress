import { useState } from "react";
import { Check, Copy, Linkedin, Share2 } from "lucide-react";
import { SiFacebook, SiReddit, SiX } from "@icons-pack/react-simple-icons";
import { toast } from "sonner";

import { cn } from "@/lib/utils";

interface ShareButtonsProps {
  url: string;
  title: string;
  className?: string;
}

/**
 * Copy link and social sharing buttons for single post pages.
 */
export function ShareButtons({ url, title, className }: ShareButtonsProps) {
  const [copied, setCopied] = useState(false);

  const encodedUrl = encodeURIComponent(url);
  const encodedTitle = encodeURIComponent(title);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      toast.success("Link copied to clipboard");
      // Reset icon after a brief delay for visual feedback
      const timer = globalThis.setTimeout(() => setCopied(false), 2000);
      return () => globalThis.clearTimeout(timer);
    } catch {
      toast.error("Failed to copy link");
    }
  }

  const platforms = [
    {
      id: "twitter",
      label: "Share on X",
      icon: SiX,
      href: `https://x.com/intent/tweet?url=${encodedUrl}&text=${encodedTitle}`,
    },
    {
      id: "facebook",
      label: "Share on Facebook",
      icon: SiFacebook,
      href: `https://www.facebook.com/sharer/sharer.php?u=${encodedUrl}`,
    },
    {
      id: "linkedin",
      label: "Share on LinkedIn",
      icon: Linkedin,
      href: `https://www.linkedin.com/shareArticle?mini=true&url=${encodedUrl}&title=${encodedTitle}`,
    },
    {
      id: "reddit",
      label: "Share on Reddit",
      icon: SiReddit,
      href: `https://www.reddit.com/submit?url=${encodedUrl}&title=${encodedTitle}`,
    },
  ];

  return (
    <div
      data-slot="share-buttons"
      className={cn("flex items-center gap-2", className)}
    >
      <span className="flex items-center gap-1 text-xs text-muted-foreground">
        <Share2 className="size-3" aria-hidden="true" />
        Share
      </span>

      {/* Copy Link */}
      <button
        type="button"
        onClick={handleCopy}
        className="flex items-center gap-1 rounded-none border border-border px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        aria-label={copied ? "Link copied" : "Copy link"}
      >
        {copied ? (
          <>
            <Check className="size-3" aria-hidden="true" />
            <span>Copied</span>
          </>
        ) : (
          <>
            <Copy className="size-3" aria-hidden="true" />
            <span>Copy</span>
          </>
        )}
      </button>

      {/* Social Platforms */}
      {platforms.map((platform) => (
        <a
          key={platform.id}
          href={platform.href}
          target="_blank"
          rel="noopener noreferrer"
          className="flex size-7 items-center justify-center rounded-none border border-border text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          aria-label={platform.label}
        >
          <platform.icon className="size-3" aria-hidden="true" />
        </a>
      ))}
    </div>
  );
}
