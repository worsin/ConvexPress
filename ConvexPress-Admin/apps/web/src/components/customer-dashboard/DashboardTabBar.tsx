import { Link, useMatchRoute } from "@tanstack/react-router";

import { cn } from "@/lib/utils";

const TABS = [
  { id: "settings", label: "Settings", to: "/customer-dashboard", exact: true },
  { id: "layouts", label: "Home layouts", to: "/customer-dashboard/layouts", exact: false },
  { id: "menus", label: "Menus", to: "/menus", exact: false },
] as const;

/** Tab strip shared by the customer dashboard admin pages. */
export function DashboardTabBar() {
  const matchRoute = useMatchRoute();
  return (
    <nav aria-label="Customer dashboard sections" className="flex gap-5 border-b border-border">
      {TABS.map((tab) => {
        const active = Boolean(matchRoute({ to: tab.to, fuzzy: !tab.exact }));
        return (
          <Link
            key={tab.id}
            to={tab.to}
            className={cn(
              "-mb-px border-b-2 pb-2.5 text-[13px] font-medium transition-colors",
              active ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
