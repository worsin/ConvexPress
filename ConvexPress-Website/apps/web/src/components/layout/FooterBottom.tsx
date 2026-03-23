import { cn } from "@/lib/utils";

import { SocialLinks } from "./SocialLinks";

interface FooterBottomProps {
  siteTitle: string;
  className?: string;
}

/**
 * Bottom-most footer row with copyright notice and social links.
 */
export function FooterBottom({ siteTitle, className }: FooterBottomProps) {
  const year = new Date().getFullYear();

  return (
    <div
      data-slot="footer-bottom"
      className={cn(
        "flex flex-col items-center justify-between gap-4 sm:flex-row",
        className,
      )}
    >
      <p className="text-xs text-muted-foreground">
        &copy; {year} {siteTitle}. All rights reserved.
      </p>
      <SocialLinks iconSize="sm" />
    </div>
  );
}
