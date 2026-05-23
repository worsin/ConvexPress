import { Link } from "@tanstack/react-router";

import { useMenuForLocation } from "@/hooks/layout/useMenuForLocation";

/**
 * Horizontal footer navigation links from the "footer" menu location.
 * Flat links only (no dropdowns in footer).
 */
export function FooterNav() {
  const footerMenu = useMenuForLocation("footer");

  if (!footerMenu || footerMenu.items.length === 0) return null;

  const visibleItems = footerMenu.items.filter((item) => !item.isOrphaned);

  if (visibleItems.length === 0) return null;

  return (
    <nav data-slot="footer-nav" aria-label="Footer navigation">
      <ul role="list" className="flex flex-wrap items-center justify-center gap-x-4 gap-y-2">
        {visibleItems.map((item, index) => {
          const linkProps = {
            ...(item.target ? { target: item.target } : {}),
            ...(item.rel ? { rel: item.rel } : {}),
          };
          const isExternal =
            item.url.startsWith("http://") || item.url.startsWith("https://");

          return (
            <li key={item.id} className="flex items-center gap-4">
              {isExternal ? (
                <a
                  href={item.url}
                  className="text-xs text-muted-foreground transition-colors hover:text-foreground"
                  {...linkProps}
                >
                  {item.label}
                </a>
              ) : (
                <Link
                  to={item.url}
                  className="text-xs text-muted-foreground transition-colors hover:text-foreground"
                  {...linkProps}
                >
                  {item.label}
                </Link>
              )}
              {index < visibleItems.length - 1 && (
                <span className="text-border" aria-hidden="true">
                  |
                </span>
              )}
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
