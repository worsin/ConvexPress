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
    <section
      aria-label="Welcome"
      className="relative overflow-hidden rounded-xl border border-border bg-card shadow-soft"
    >
      <button
        onClick={onDismiss}
        className="absolute right-3 top-3 grid size-7 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        title="Dismiss this welcome panel"
        aria-label="Dismiss welcome panel"
      >
        <XIcon className="size-4" aria-hidden="true" />
      </button>

      <div className="px-6 pb-6 pt-5">
        <p className="eyebrow">Getting started</p>
        <h2 className="mt-1.5 font-serif text-[26px] leading-none tracking-[-0.01em] text-foreground">
          Welcome to ConvexPress{displayName ? `, ${displayName}` : ""}
        </h2>
        <p className="mt-2 text-[13px] text-ink-2">
          Here are some links to get you started:
        </p>

        <div className="mt-5 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {/* Get Started */}
          <div>
            <h3 className="mb-2 text-[13px] font-semibold text-foreground">
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
            <h3 className="mb-2 text-[13px] font-semibold text-foreground">
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
            <h3 className="mb-2 text-[13px] font-semibold text-foreground">
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
      <div className="flex justify-end border-t border-border bg-surface-2 px-4 py-2">
        <Button variant="ghost" size="xs" onClick={onDismiss}>
          Dismiss
        </Button>
      </div>
    </section>
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
        className="inline-flex items-center gap-2 text-[13px] font-medium text-primary transition-colors hover:text-foreground"
      >
        {icon}
        {label}
      </Link>
    </li>
  );
}
