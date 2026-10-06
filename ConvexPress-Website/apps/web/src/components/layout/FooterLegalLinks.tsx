import { Link } from "@tanstack/react-router";
import { footerMenuItems } from "@/components/menus/footerMenuItems";
import { MenuItemTarget } from "@/components/menus/MenuItemTarget";
import { useMenuForLocation } from "@/hooks/layout/useMenuForLocation";
import type { FooterConfig } from "@/lib/layout/types";

const linkClass = "text-xs text-muted-foreground transition-colors hover:text-foreground";

/** Matches the legal choices and destinations used by section-to-row conversion. */
export function FooterLegalLinks({ choice }: { choice: FooterConfig["bottomBar"]["legalLinks"] }) {
  if (choice === "none") return null;
  if (choice === "custom") return <CustomLegalLinks />;
  return (
    <nav aria-label="Legal links">
      <ul className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <li><Link to="/privacy" className={linkClass}>Privacy Policy</Link></li>
        {choice === "privacy-terms" && <li><Link to="/terms" className={linkClass}>Terms of Service</Link></li>}
      </ul>
    </nav>
  );
}

function CustomLegalLinks() {
  const menu = useMenuForLocation("footer");
  const items = footerMenuItems(menu?.items ?? []);
  if (!items.length) return null;
  return (
    <nav aria-label="Legal links">
      <ul className="flex flex-wrap items-center gap-x-4 gap-y-2">
        {items.map(item => <li key={item.id}><MenuItemTarget item={item} target={item.target} rel={item.rel} separatorOrientation="vertical" className={linkClass} /></li>)}
      </ul>
    </nav>
  );
}
