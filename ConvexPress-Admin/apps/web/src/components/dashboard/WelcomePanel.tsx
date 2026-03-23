/**
 * Dashboard System - Welcome Panel
 *
 * Dismissable welcome banner shown to users on their first visit.
 * Provides role-appropriate quick links to common actions.
 *
 * Mirrors WordPress's "Welcome to WordPress!" dashboard panel.
 */

import { Link } from "@tanstack/react-router";
import {
  XIcon,
  FileTextIcon,
  ImageIcon,
  SettingsIcon,
  UsersIcon,
  PenLineIcon,
  PaletteIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";

interface WelcomePanelProps {
  /** User's display name. */
  displayName?: string;
  /** User's capabilities for showing relevant quick links. */
  userCapabilities: string[];
  /** Callback to dismiss the panel. */
  onDismiss: () => void;
}

export function WelcomePanel({
  displayName,
  userCapabilities,
  onDismiss,
}: WelcomePanelProps) {
  const canCreatePosts = userCapabilities.includes("post.create");
  const canManageMedia = userCapabilities.includes("media.upload");
  const canManageUsers = userCapabilities.includes("profile.view");
  const canManageSettings = userCapabilities.includes(
    "settings.update_general",
  );
  const canCreatePages = userCapabilities.includes("page.create");
  const canManageThemes = userCapabilities.includes(
    "settings.update_general",
  );

  return (
    <div className="relative border border-border bg-card mb-4">
      {/* Dismiss button */}
      <button
        onClick={onDismiss}
        className="absolute top-2 right-2 text-muted-foreground hover:text-foreground transition-colors"
        title="Dismiss this welcome panel"
      >
        <XIcon className="size-4" />
      </button>

      <div className="p-4 pb-5">
        <h2 className="text-sm font-semibold text-foreground mb-1">
          Welcome to SmithHarper{displayName ? `, ${displayName}` : ""}!
        </h2>
        <p className="text-xs text-muted-foreground mb-4">
          Here are some links to get you started:
        </p>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {/* Get Started */}
          <div>
            <h3 className="text-xs font-semibold text-foreground mb-2">
              Get Started
            </h3>
            <ul className="space-y-1.5">
              {canManageThemes && (
                <QuickLink
                  to="/settings/general"
                  icon={<PaletteIcon className="size-3.5" />}
                  label="Customize Your Site"
                />
              )}
              {canCreatePosts && (
                <QuickLink
                  to="/posts/new"
                  icon={<PenLineIcon className="size-3.5" />}
                  label="Write Your First Post"
                />
              )}
              {canCreatePages && (
                <QuickLink
                  to="/pages/new"
                  icon={<FileTextIcon className="size-3.5" />}
                  label="Add a Page"
                />
              )}
            </ul>
          </div>

          {/* Next Steps */}
          <div>
            <h3 className="text-xs font-semibold text-foreground mb-2">
              Next Steps
            </h3>
            <ul className="space-y-1.5">
              {canManageMedia && (
                <QuickLink
                  to="/media"
                  icon={<ImageIcon className="size-3.5" />}
                  label="Manage Media"
                />
              )}
              {canManageUsers && (
                <QuickLink
                  to="/users"
                  icon={<UsersIcon className="size-3.5" />}
                  label="Manage Users"
                />
              )}
            </ul>
          </div>

          {/* More Actions */}
          <div>
            <h3 className="text-xs font-semibold text-foreground mb-2">
              More Actions
            </h3>
            <ul className="space-y-1.5">
              {canManageSettings && (
                <QuickLink
                  to="/settings/general"
                  icon={<SettingsIcon className="size-3.5" />}
                  label="Settings"
                />
              )}
            </ul>
          </div>
        </div>
      </div>

      {/* Bottom dismiss bar */}
      <div className="border-t border-border px-4 py-2 flex justify-end">
        <Button variant="ghost" size="xs" onClick={onDismiss}>
          Dismiss
        </Button>
      </div>
    </div>
  );
}

// ── Quick Link Item ───────────────────────────────────────────────────────

function QuickLink({
  to,
  icon,
  label,
}: {
  to: string;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <li>
      <Link
        to={to}
        className="inline-flex items-center gap-1.5 text-xs text-primary hover:text-primary/80 hover:underline transition-colors"
      >
        {icon}
        {label}
      </Link>
    </li>
  );
}
