/**
 * Page Access Editor Component
 *
 * Shared component for editing a role's admin route access permissions.
 * Used by both the Edit Role and New Role pages.
 *
 * Displays a grid of checkboxes for all admin routes, with visual
 * indication of routes implied by parent path matching.
 *
 * SYNC WARNING: The ADMIN_ROUTES array below must stay in sync with
 * ALL_ADMIN_PAGES in ConvexPress-Admin/packages/backend/convex/seed/roles.ts.
 * If you add a route to the backend, add it here too.
 */

import { cn } from "@/lib/utils";

// ─── Admin Routes ──────────────────────────────────────────────────────────
// Synced with ALL_ADMIN_PAGES in convex/seed/roles.ts (45 entries).
// SYNC WARNING: Changes here must be mirrored in the backend seed data.

const ADMIN_ROUTES = [
  // Core
  { path: "/admin", label: "Dashboard" },
  { path: "/admin/dashboard", label: "Dashboard (explicit)" },

  // Posts
  { path: "/admin/posts", label: "Posts" },
  { path: "/admin/posts/new", label: "Posts > Add New" },
  { path: "/admin/posts/edit", label: "Posts > Edit" },

  // Pages
  { path: "/admin/pages", label: "Pages" },
  { path: "/admin/pages/new", label: "Pages > Add New" },
  { path: "/admin/pages/edit", label: "Pages > Edit" },

  // Media
  { path: "/admin/media", label: "Media Library" },
  { path: "/admin/media/new", label: "Media > Add New" },

  // Comments
  { path: "/admin/comments", label: "Comments" },

  // Users
  { path: "/admin/users", label: "Users" },
  { path: "/admin/users/new", label: "Users > Add New" },
  { path: "/admin/users/edit", label: "Users > Edit" },
  { path: "/admin/users/profile", label: "Users > Your Profile" },

  // Roles
  { path: "/admin/roles", label: "Roles & Capabilities" },
  { path: "/admin/roles/new", label: "Roles > Add New" },
  { path: "/admin/roles/edit", label: "Roles > Edit" },

  // Taxonomy
  { path: "/admin/categories", label: "Categories" },
  { path: "/admin/tags", label: "Tags" },

  // Settings
  { path: "/admin/settings", label: "Settings" },
  { path: "/admin/settings/general", label: "Settings > General" },
  { path: "/admin/settings/reading", label: "Settings > Reading" },
  { path: "/admin/settings/writing", label: "Settings > Writing" },
  { path: "/admin/settings/discussion", label: "Settings > Discussion" },
  { path: "/admin/settings/permalinks", label: "Settings > Permalinks" },
  { path: "/admin/settings/privacy", label: "Settings > Privacy" },
  { path: "/admin/settings/email", label: "Settings > Email" },

  // Appearance & Theming
  { path: "/admin/widgets", label: "Widgets" },
  { path: "/admin/menus", label: "Menus" },
  { path: "/admin/themes", label: "Themes" },

  // SEO & Content Systems
  { path: "/admin/seo", label: "SEO" },
  { path: "/admin/search", label: "Search" },
  { path: "/admin/revisions", label: "Revisions" },
  { path: "/admin/custom-fields", label: "Custom Fields" },

  // Communication
  { path: "/admin/email-notifications", label: "Email Notifications" },
  { path: "/admin/site-notifications", label: "Site Notifications" },

  // Administration
  { path: "/admin/api", label: "API" },
  { path: "/admin/audit-log", label: "Audit Log" },
  { path: "/admin/events", label: "Events" },
  { path: "/admin/routing", label: "Routing" },
  { path: "/admin/registration", label: "Registration" },
  { path: "/admin/password-management", label: "Password Management" },

  // Tools
  { path: "/admin/tools", label: "Tools" },
  { path: "/admin/tools/import", label: "Tools > Import" },
  { path: "/admin/tools/export", label: "Tools > Export" },

  // System
  { path: "/admin/updates", label: "Updates" },
  { path: "/admin/rss", label: "RSS" },
  { path: "/admin/sitemap", label: "Sitemap" },
];

// ─── Component ─────────────────────────────────────────────────────────────

interface PageAccessEditorProps {
  pageAccess: string[];
  onChange: (pageAccess: string[]) => void;
}

export function PageAccessEditor({ pageAccess, onChange }: PageAccessEditorProps) {
  const accessSet = new Set(pageAccess);

  const toggleRoute = (path: string) => {
    const next = new Set(accessSet);
    if (next.has(path)) {
      next.delete(path);
    } else {
      next.add(path);
    }
    onChange(Array.from(next));
  };

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-0 border border-border">
      {ADMIN_ROUTES.map((route) => {
        const isEnabled = accessSet.has(route.path);
        // Check if a parent path implies access
        const isImplied =
          !isEnabled &&
          Array.from(accessSet).some(
            (p) =>
              route.path !== p && route.path.startsWith(p + "/"),
          );

        return (
          <label
            key={route.path}
            className={cn(
              "flex items-center gap-2.5 px-3 py-1.5 cursor-pointer border-b border-r border-border transition-colors",
              isEnabled
                ? "bg-primary/5"
                : isImplied
                  ? "bg-primary/3"
                  : "hover:bg-muted/30",
            )}
          >
            <input
              type="checkbox"
              checked={isEnabled}
              onChange={() => toggleRoute(route.path)}
              className="size-3.5 accent-primary"
            />
            <div className="min-w-0 flex-1">
              <span className="text-xs text-foreground">{route.label}</span>
              {isImplied && (
                <span className="text-[10px] text-muted-foreground ml-1">
                  (implied by parent)
                </span>
              )}
            </div>
          </label>
        );
      })}
    </div>
  );
}
