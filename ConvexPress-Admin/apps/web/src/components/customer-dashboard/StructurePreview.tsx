/**
 * Structure preview — a schematic of the customer dashboard shell built from
 * the draft settings and the menus assigned to the dashboard locations (or
 * generated from the page registry when a location is unassigned).
 *
 * Schematic on purpose: it shows structure (which surfaces exist, what is in
 * them, badges, visibility notes), not the website's brand styling.
 */

import { Bell, ChevronDown, Moon, Search, Sparkles } from "lucide-react";

import { LucideDynamicIcon } from "@/components/icons/LucideDynamicIcon";
import type { DashboardSettingsDraft, PreviewNode } from "@/lib/customer-dashboard/settings-model";
import { welcomePreview } from "@/lib/customer-dashboard/settings-model";
import { badgeSourceLabel } from "@/lib/menus/item-editor-model";
import { cn } from "@/lib/utils";

interface StructurePreviewProps {
  draft: DashboardSettingsDraft;
  sidebar: PreviewNode[];
  topbar: PreviewNode[];
  profile: PreviewNode[];
  sidebarSource: string;
  topbarSource: string;
  profileSource: string;
  landingTitle: string;
  siteName: string;
}

function BadgeDot({ badge }: { badge?: string }) {
  if (!badge) return null;
  return (
    <span
      title={badgeSourceLabel(badge)}
      className="ml-auto inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-semibold text-primary-foreground"
    >
      3
    </span>
  );
}

function NavRows({ nodes, compact, depth = 0 }: { nodes: PreviewNode[]; compact: boolean; depth?: number }) {
  return (
    <ul className={cn("flex flex-col", compact ? "items-center gap-1.5" : "gap-0.5")}>
      {nodes.map((node) => {
        if (node.kind === "separator") {
          return <li key={node.key} className={cn("my-1 h-px bg-border", compact ? "w-5" : "w-full")} aria-hidden="true" />;
        }
        if (node.kind === "heading") {
          if (compact) return null;
          return (
            <li key={node.key} className="eyebrow mt-2.5 px-2 pb-1 first:mt-0">
              {node.label}
            </li>
          );
        }
        return (
          <li key={node.key} className="flex flex-col">
            <div
              title={node.note}
              className={cn(
                "flex items-center gap-2 rounded-md text-[12.5px] text-foreground",
                compact ? "size-8 justify-center" : "px-2 py-1.5",
                node.note && "text-muted-foreground",
              )}
              style={!compact && depth > 0 ? { paddingLeft: 8 + depth * 14 } : undefined}
            >
              <LucideDynamicIcon name={node.icon} className="size-3.5 shrink-0 text-ink-2" />
              {!compact && <span className="truncate">{node.label}</span>}
              {!compact && <BadgeDot badge={node.badge} />}
              {!compact && node.note && (
                <span aria-hidden="true" className="size-1.5 shrink-0 rounded-full bg-warning" />
              )}
            </div>
            {!compact && node.children && node.children.length > 0 && (
              <NavRows nodes={node.children} compact={false} depth={depth + 1} />
            )}
          </li>
        );
      })}
    </ul>
  );
}

function SourceTag({ source }: { source: string }) {
  return <span className="eyebrow normal-case tracking-normal">{source}</span>;
}

export function StructurePreview({
  draft,
  sidebar,
  topbar,
  profile,
  sidebarSource,
  topbarSource,
  profileSource,
  landingTitle,
  siteName,
}: StructurePreviewProps) {
  const showSidebar = draft.layout !== "topbar";
  const showTopbar = draft.layout !== "sidebar";
  const collapsed = draft.sidebarCollapsedByDefault;
  const sidebarWidth = collapsed ? 56 : Math.round(draft.sidebarWidth * 0.55);

  return (
    <div className="flex flex-col gap-3">
      <div className="overflow-hidden rounded-xl border border-line-strong bg-background shadow-soft">
        {/* Top chrome */}
        <div className="flex h-11 items-center gap-3 border-b border-border bg-card px-3">
          <div className="flex min-w-0 items-center gap-2">
            {draft.brandMark === "custom" && draft.customLogoUrl ? (
              <img src={draft.customLogoUrl} alt="" className="h-5 max-w-20 object-contain" />
            ) : draft.brandMark === "site" ? (
              <span className="grid size-5 place-items-center rounded-md bg-foreground text-[9px] font-semibold text-background">
                {siteName.slice(0, 1).toUpperCase() || "S"}
              </span>
            ) : null}
            <span className="truncate text-[12.5px] font-semibold text-foreground">{siteName}</span>
          </div>
          {showTopbar && (
            <div className="ml-2 flex min-w-0 items-center gap-1 overflow-hidden">
              {topbar.filter((node) => node.kind === "link").slice(0, 6).map((node) => (
                <span
                  key={node.key}
                  title={node.note}
                  className="inline-flex shrink-0 items-center gap-1 rounded-md px-2 py-1 text-[12px] text-ink-2"
                >
                  <LucideDynamicIcon name={node.icon} className="size-3" />
                  {node.label}
                  {node.badge && <span className="size-1.5 rounded-full bg-primary" />}
                </span>
              ))}
            </div>
          )}
          <div className="ml-auto flex items-center gap-1.5 text-ink-2">
            {draft.showSearch && <Search className="size-3.5" aria-label="Search" />}
            {draft.showNotificationBell && (
              <span className="relative">
                <Bell className="size-3.5" aria-label="Notifications" />
                <span className="absolute -right-0.5 -top-0.5 size-1.5 rounded-full bg-primary" />
              </span>
            )}
            {draft.showThemeToggle && <Moon className="size-3.5" aria-label="Theme" />}
            <span className="ml-1 inline-flex items-center gap-1 rounded-full border border-line-strong bg-surface-2 py-0.5 pl-0.5 pr-1.5">
              <span className="size-4 rounded-full bg-primary-soft" />
              <ChevronDown className="size-3" />
            </span>
          </div>
        </div>

        <div className="flex min-h-[300px]">
          {showSidebar && (
            <aside
              className="shrink-0 border-r border-border bg-sidebar p-2"
              style={{ width: sidebarWidth }}
              aria-label="Sidebar preview"
            >
              <NavRows nodes={sidebar} compact={collapsed} />
            </aside>
          )}
          <main className="flex min-w-0 flex-1 flex-col gap-3 p-4">
            <div>
              <div className="eyebrow">{landingTitle}</div>
              <div className="mt-1 font-serif text-[22px] leading-none text-foreground">
                {welcomePreview(draft.welcomeHeadline)}
              </div>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <div className="col-span-2 h-16 rounded-lg border border-border bg-card" />
              <div className="h-16 rounded-lg border border-border bg-card" />
              <div className="h-12 rounded-lg border border-border bg-card" />
              <div className="col-span-2 h-12 rounded-lg border border-border bg-card" />
            </div>
            {draft.footerVariant !== "none" && (
              <div
                className={cn(
                  "mt-auto border-t border-border pt-2 text-[10.5px] text-muted-foreground",
                  draft.footerVariant === "full" ? "grid grid-cols-3 gap-2" : "flex justify-between",
                )}
              >
                {draft.footerVariant === "full" ? (
                  <>
                    <span>{siteName}</span>
                    <span>Help · Privacy · Terms</span>
                    <span className="text-right">© {new Date().getFullYear()}</span>
                  </>
                ) : (
                  <>
                    <span>© {siteName}</span>
                    <span>Help</span>
                  </>
                )}
              </div>
            )}
          </main>

          {/* Profile dropdown, drawn as a detached card */}
          <div className="w-36 shrink-0 self-start py-3 pr-3">
            <div className="rounded-xl border border-line-strong bg-popover p-1.5 shadow-float">
              <div className="mb-1 flex items-center gap-2 px-2 py-1.5">
                <span className="size-6 rounded-full bg-primary-soft" />
                <span className="min-w-0">
                  <span className="block truncate text-[12px] font-medium text-foreground">Avery Lane</span>
                  <span className="block truncate text-[10.5px] text-muted-foreground">Member</span>
                </span>
              </div>
              <NavRows nodes={profile} compact={false} />
            </div>
          </div>
        </div>
      </div>

      <dl className="grid grid-cols-3 gap-2 text-[11.5px]">
        <div className={cn("rounded-lg border border-border bg-card px-2.5 py-2", !showSidebar && "opacity-50")}>
          <dt className="font-medium text-foreground">Sidebar</dt>
          <dd className="mt-0.5 text-muted-foreground"><SourceTag source={showSidebar ? sidebarSource : "hidden by layout"} /></dd>
        </div>
        <div className={cn("rounded-lg border border-border bg-card px-2.5 py-2", !showTopbar && "opacity-50")}>
          <dt className="font-medium text-foreground">Top bar</dt>
          <dd className="mt-0.5 text-muted-foreground"><SourceTag source={showTopbar ? topbarSource : "hidden by layout"} /></dd>
        </div>
        <div className="rounded-lg border border-border bg-card px-2.5 py-2">
          <dt className="font-medium text-foreground">Profile menu</dt>
          <dd className="mt-0.5 text-muted-foreground"><SourceTag source={profileSource} /></dd>
        </div>
      </dl>
      <p className="flex items-center gap-1.5 text-[11.5px] text-muted-foreground">
        <Sparkles className="size-3" aria-hidden="true" />
        Amber dots mark items with visibility rules or a disabled plugin; hover for details.
      </p>
    </div>
  );
}
