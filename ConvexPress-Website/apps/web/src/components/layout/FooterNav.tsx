import { MenuItemTarget } from "@/components/menus/MenuItemTarget";

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

          return (
            <li key={item.id} className="flex items-center gap-4">
              <MenuItemTarget
                  item={item} separatorOrientation="vertical"
                  className="text-xs text-muted-foreground transition-colors hover:text-foreground"
                  {...linkProps}
                >
                  {item.label}
                </MenuItemTarget>
              {index < visibleItems.length - 1 && item.type !== "separator" && visibleItems[index + 1].type !== "separator" && (
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
