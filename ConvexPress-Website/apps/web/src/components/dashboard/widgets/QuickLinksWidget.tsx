import { ExternalLink, PenSquare, Settings, User, Zap } from "lucide-react";
import { Link } from "@tanstack/react-router";

import { useCanFn } from "@/hooks/useCan";
import { DashboardWidget } from "../DashboardWidget";

interface QuickLinksWidgetProps {
  /** User profile is kept for future use (e.g., conditional links). */
  user?: { _id: string };
}

interface QuickLinkItem {
  label: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  requiresCapability?: string;
}

const QUICK_LINKS: QuickLinkItem[] = [
  {
    label: "Edit Profile",
    href: "/dashboard/profile",
    icon: User,
  },
  {
    label: "Account Settings",
    href: "/dashboard/settings",
    icon: Settings,
  },
  {
    label: "Write a Post",
    href: "/dashboard/posts",
    icon: PenSquare,
    requiresCapability: "post.create",
  },
  {
    label: "View Site",
    href: "/",
    icon: ExternalLink,
  },
];

/**
 * Action shortcut cards for common dashboard tasks.
 *
 * Uses the `useCanFn()` hook to check capabilities reactively.
 * Links requiring a capability the user lacks are filtered out.
 */
export function QuickLinksWidget({ user }: QuickLinksWidgetProps) {
  void user;
  const can = useCanFn();

  const visibleLinks = QUICK_LINKS.filter((link) => {
    if (!link.requiresCapability) return true;
    return can(link.requiresCapability);
  });

  return (
    <DashboardWidget title="Quick Links" icon={Zap}>
      <div className="grid grid-cols-2 gap-2">
        {visibleLinks.map((link) => {
          const Icon = link.icon;
          return (
            <Link
              key={link.href}
              to={link.href}
              className="flex flex-col items-center gap-1.5 border border-border p-4 text-center transition-colors hover:bg-muted/50"
            >
              <Icon className="size-5 text-muted-foreground" aria-hidden="true" />
              <span className="text-xs text-foreground">{link.label}</span>
            </Link>
          );
        })}
      </div>
    </DashboardWidget>
  );
}
