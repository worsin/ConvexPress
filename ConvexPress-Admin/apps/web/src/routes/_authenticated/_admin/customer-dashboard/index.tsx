/**
 * Customer dashboard — settings (/customer-dashboard)
 *
 * Every field of the "dashboard" settings section with a live structure
 * preview of the shell. Autosaves through the shared settings draft hook;
 * menu ↔ location assignment saves immediately (it is not part of the
 * settings section).
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation } from "convex/react";
import { useQuery } from "convex-helpers/react/cache";
import { toast } from "sonner";
import { ExternalLink, Image as ImageIcon, LayoutPanelLeft, LayoutPanelTop, PanelsTopLeft } from "lucide-react";

import { api } from "@backend/convex/_generated/api";
import type { Id } from "@backend/convex/_generated/dataModel";
import { DASHBOARD_PAGES, pluginIsEnabled } from "@backend/convex/extensions/dashboard/registry";
import { DashboardTabBar } from "@/components/customer-dashboard/DashboardTabBar";
import {
  FieldRow,
  SegmentedControl,
  SelectControl,
  ToggleRow,
  type SelectOption,
} from "@/components/customer-dashboard/fields";
import { StructurePreview } from "@/components/customer-dashboard/StructurePreview";
import { LucideDynamicIcon } from "@/components/icons/LucideDynamicIcon";
import { MediaPicker } from "@/components/media/MediaPicker";
import { PluginGuard } from "@/components/plugins/PluginGuard";
import { SaveBar } from "@/components/settings/integrations/SaveBar";
import { PageHeader } from "@/components/shell/PageHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { usePluginSettings } from "@/hooks/usePluginSettings";
import { useSettingsAutosaveDraft } from "@/hooks/useSettingsAutosaveDraft";
import {
  buildPreviewFromMenu,
  buildProfileFromRegistry,
  buildSidebarFromRegistry,
  buildTopbarFromRegistry,
  createDashboardDraft,
  draftToSectionValues,
  GENERATED_FROM_REGISTRY,
  PAGE_GROUP_LABELS,
  SIDEBAR_WIDTH_MAX,
  SIDEBAR_WIDTH_MIN,
  validateDashboardDraft,
  type DashboardSettingsDraft,
  type PreviewMenuItem,
} from "@/lib/customer-dashboard/settings-model";

export const Route = createFileRoute("/_authenticated/_admin/customer-dashboard/")({
  component: CustomerDashboardSettingsPage,
});

function CustomerDashboardSettingsPage() {
  return (
    <PluginGuard pluginId="dashboard">
      <CustomerDashboardSettings />
    </PluginGuard>
  );
}

interface MenuRow {
  _id: Id<"menus">;
  name: string;
  itemCount?: number;
}

interface LocationRow {
  slug: string;
  name: string;
  description?: string;
  menuId?: Id<"menus"> | null;
  menuName?: string | null;
}

type Surface = "sidebar" | "topbar" | "profile";

const SURFACES: Array<{ key: Surface; field: keyof DashboardSettingsDraft; label: string; help: string }> = [
  { key: "sidebar", field: "sidebarLocation", label: "Sidebar", help: "Main navigation down the left of the dashboard." },
  { key: "topbar", field: "topbarLocation", label: "Top bar", help: "Links across the top, next to the brand." },
  { key: "profile", field: "profileLocation", label: "Profile menu", help: "The avatar dropdown in the header — on the dashboard and the storefront." },
];

function CustomerDashboardSettings() {
  const settings = useQuery(api.settings.queries.getBySection, { section: "dashboard" }) as
    | Record<string, unknown>
    | null
    | undefined;
  const general = useQuery(api.settings.queries.getBySection, { section: "general" }) as
    | Record<string, unknown>
    | null
    | undefined;
  const menus = useQuery(api.menus.queries.listMenus) as MenuRow[] | undefined;
  const locations = useQuery(api.menus.queries.getMenuLocations) as LocationRow[] | undefined;
  const updateSection = useMutation(api.settings.mutations.updateSection);
  const assignMenuToLocation = useMutation(api.menus.mutations.assignMenuToLocation);
  const { values: pluginFlags } = usePluginSettings();

  const { draft, setDraft, discardChanges, isDirty, autosaveStatus, autosaveError } = useSettingsAutosaveDraft<
    DashboardSettingsDraft,
    Record<string, unknown>
  >({
    source: settings,
    createDraft: createDashboardDraft,
    onSave: async (next) => {
      const errors = validateDashboardDraft(next);
      const first = Object.values(errors)[0];
      if (first) throw new Error(first);
      await updateSection({ section: "dashboard", values: draftToSectionValues(next) });
    },
  });

  const errors = useMemo(() => (draft ? validateDashboardDraft(draft) : {}), [draft]);
  const update = useCallback(
    <K extends keyof DashboardSettingsDraft>(key: K, value: DashboardSettingsDraft[K]) => {
      setDraft((current) => (current ? { ...current, [key]: value } : current));
    },
    [setDraft],
  );

  // ── Menus feeding each surface ────────────────────────────────────────────
  const locationBySlug = useMemo(() => new Map((locations ?? []).map((location) => [location.slug, location])), [locations]);
  const surfaceMenuId = (surface: Surface): Id<"menus"> | null => {
    if (!draft) return null;
    const slug = String(draft[SURFACES.find((entry) => entry.key === surface)!.field]);
    return locationBySlug.get(slug)?.menuId ?? null;
  };
  const sidebarMenuId = surfaceMenuId("sidebar");
  const topbarMenuId = surfaceMenuId("topbar");
  const profileMenuId = surfaceMenuId("profile");
  const sidebarMenu = useQuery(api.menus.queries.getMenu, sidebarMenuId ? { menuId: sidebarMenuId } : "skip") as
    | { name: string; items: PreviewMenuItem[] }
    | null
    | undefined;
  const topbarMenu = useQuery(api.menus.queries.getMenu, topbarMenuId ? { menuId: topbarMenuId } : "skip") as
    | { name: string; items: PreviewMenuItem[] }
    | null
    | undefined;
  const profileMenu = useQuery(api.menus.queries.getMenu, profileMenuId ? { menuId: profileMenuId } : "skip") as
    | { name: string; items: PreviewMenuItem[] }
    | null
    | undefined;

  const [assigning, setAssigning] = useState<Surface | null>(null);
  const assignSurfaceMenu = async (surface: Surface, menuId: string) => {
    if (!draft) return;
    const slug = String(draft[SURFACES.find((entry) => entry.key === surface)!.field]);
    setAssigning(surface);
    try {
      await assignMenuToLocation({ locationSlug: slug, menuId: menuId ? (menuId as Id<"menus">) : undefined });
      toast.success(menuId ? "Menu assigned" : "Generated from the page registry");
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : "Failed to assign menu");
    } finally {
      setAssigning(null);
    }
  };

  // ── Custom logo via the media library ─────────────────────────────────────
  const [pendingMediaId, setPendingMediaId] = useState<Id<"media"> | null>(null);
  const pendingMedia = useQuery(api.media.queries.get, pendingMediaId ? { mediaId: pendingMediaId } : "skip") as
    | { url?: string }
    | null
    | undefined;
  useEffect(() => {
    if (pendingMediaId && pendingMedia?.url) {
      update("customLogoUrl", pendingMedia.url);
      update("brandMark", "custom");
      setPendingMediaId(null);
    }
  }, [pendingMedia, pendingMediaId, update]);

  // ── Preview model ─────────────────────────────────────────────────────────
  const basePath = draft?.basePath && !errors.basePath ? draft.basePath : "/dashboard";
  const siteName = String(general?.siteTitle ?? general?.siteName ?? "Your site");
  const preview = useMemo(() => {
    const pages = DASHBOARD_PAGES;
    const flags = pluginFlags as Record<string, unknown>;
    return {
      sidebar: sidebarMenu
        ? buildPreviewFromMenu(sidebarMenu.items, pages, flags, basePath)
        : buildSidebarFromRegistry(pages, flags, basePath),
      topbar: topbarMenu
        ? buildPreviewFromMenu(topbarMenu.items, pages, flags, basePath)
        : buildTopbarFromRegistry(pages, flags, basePath),
      profile: profileMenu
        ? buildPreviewFromMenu(profileMenu.items, pages, flags, basePath)
        : buildProfileFromRegistry(pages, flags, basePath),
      sidebarSource: sidebarMenu ? `Menu · ${sidebarMenu.name}` : "Generated from page registry",
      topbarSource: topbarMenu ? `Menu · ${topbarMenu.name}` : "Generated from page registry",
      profileSource: profileMenu ? `Menu · ${profileMenu.name}` : "Generated from page registry",
    };
  }, [basePath, pluginFlags, profileMenu, sidebarMenu, topbarMenu]);

  const pageOptions = useMemo<SelectOption[]>(
    () =>
      DASHBOARD_PAGES.map((page) => {
        const enabled = pluginIsEnabled(page.pluginId, pluginFlags as Record<string, unknown>);
        return {
          value: page.id,
          label: page.title,
          description: enabled ? `${PAGE_GROUP_LABELS[page.group]} · ${basePath}${page.path}` : `${page.pluginId} plugin is off`,
          disabled: !enabled,
          icon: <LucideDynamicIcon name={page.icon} className="size-4 text-ink-2" />,
        };
      }),
    [basePath, pluginFlags],
  );
  const landingTitle = DASHBOARD_PAGES.find((page) => page.id === draft?.landingPage)?.title ?? "Dashboard";

  const menuOptions = useMemo<SelectOption[]>(
    () => [
      { value: GENERATED_FROM_REGISTRY, label: "Generated from page registry", description: "Every enabled dashboard page, grouped." },
      ...(menus ?? []).map((menu) => ({
        value: menu._id as string,
        label: menu.name,
        description: `${menu.itemCount ?? 0} item${(menu.itemCount ?? 0) === 1 ? "" : "s"}`,
      })),
    ],
    [menus],
  );
  const locationOptions = useMemo<SelectOption[]>(
    () => (locations ?? []).map((location) => ({ value: location.slug, label: location.name, description: location.description })),
    [locations],
  );

  if (settings === undefined || !draft) {
    return (
      <div className="space-y-[18px]">
        <PageHeader eyebrow="Customer dashboard" title="Settings" />
        <DashboardTabBar />
        <div className="grid gap-[18px] xl:grid-cols-[minmax(0,1fr)_minmax(0,460px)]">
          <div className="space-y-[18px]">
            <div className="h-64 animate-pulse rounded-xl bg-muted" />
            <div className="h-48 animate-pulse rounded-xl bg-muted" />
          </div>
          <div className="h-96 animate-pulse rounded-xl bg-muted" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-[18px]">
      <PageHeader
        eyebrow="Customer dashboard"
        title="Settings"
        meta={[
          <span key="path">
            Lives at <code className="font-mono text-[12px]">{basePath}</code>
          </span>,
          <span key="layout">{draft.layout === "both" ? "Sidebar + top bar" : draft.layout === "sidebar" ? "Sidebar layout" : "Top bar layout"}</span>,
        ]}
        actions={
          <Button variant="outline" size="sm" nativeButton={false} render={<Link to="/customer-dashboard/layouts" />}>
            <PanelsTopLeft data-icon="inline-start" />
            Home layouts
          </Button>
        }
      />
      <DashboardTabBar />

      <div className="grid items-start gap-[18px] xl:grid-cols-[minmax(0,1fr)_minmax(0,460px)]">
        <div className="space-y-[18px]">
          {/* Address & layout */}
          <Card data-size="sm">
            <CardHeader>
              <CardTitle>Address and layout</CardTitle>
              <CardDescription>Where the dashboard lives and which navigation surfaces the shell renders.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-5 md:grid-cols-2">
              <FieldRow
                label="Base path"
                htmlFor="basePath"
                error={errors.basePath}
                description="Menu items linking to dashboard pages can override this per link."
              >
                <Input
                  id="basePath"
                  value={draft.basePath}
                  onChange={(event) => update("basePath", event.target.value)}
                  placeholder="/dashboard"
                  className="font-mono"
                  aria-invalid={Boolean(errors.basePath)}
                />
              </FieldRow>
              <FieldRow label="Landing page" htmlFor="landingPage" description="What opens at the base path.">
                <SelectControl id="landingPage" value={draft.landingPage} onValueChange={(value) => update("landingPage", value)} options={pageOptions} />
              </FieldRow>
              <FieldRow label="Navigation layout" description="Both keeps the sidebar for pages and the top bar for quick links.">
                <SegmentedControl
                  aria-label="Navigation layout"
                  value={draft.layout}
                  onValueChange={(value) => update("layout", value)}
                  options={[
                    { value: "sidebar", label: "Sidebar", icon: <LayoutPanelLeft className="size-3.5" /> },
                    { value: "topbar", label: "Top bar", icon: <LayoutPanelTop className="size-3.5" /> },
                    { value: "both", label: "Both", icon: <PanelsTopLeft className="size-3.5" /> },
                  ]}
                />
              </FieldRow>
              <FieldRow label="Footer" description="Minimal shows copyright and help; full adds link columns.">
                <SegmentedControl
                  aria-label="Footer"
                  value={draft.footerVariant}
                  onValueChange={(value) => update("footerVariant", value)}
                  options={[
                    { value: "minimal", label: "Minimal" },
                    { value: "full", label: "Full" },
                    { value: "none", label: "None" },
                  ]}
                />
              </FieldRow>
            </CardContent>
          </Card>

          {/* Navigation menus */}
          <Card data-size="sm">
            <CardHeader>
              <CardTitle>Navigation menus</CardTitle>
              <CardDescription>
                Assign a menu to each surface, or let the shell generate one from the page registry. Build menus with dashboard pages, headings, badges, and visibility rules in{" "}
                <Link to="/menus" className="text-primary underline-offset-4 hover:underline">
                  Menus
                </Link>
                .
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4">
              {SURFACES.map((surface) => {
                const slug = String(draft[surface.field]);
                const location = locationBySlug.get(slug);
                const hidden = (surface.key === "sidebar" && draft.layout === "topbar") || (surface.key === "topbar" && draft.layout === "sidebar");
                return (
                  <div
                    key={surface.key}
                    className="grid gap-3 rounded-lg border border-border bg-surface-2/60 p-3 md:grid-cols-[160px_minmax(0,1fr)_minmax(0,220px)] md:items-start"
                  >
                    <div>
                      <div className="text-[13px] font-medium text-foreground">{surface.label}</div>
                      <p className="mt-0.5 text-xs text-muted-foreground">{surface.help}</p>
                      {hidden && <p className="mt-1 text-xs text-warning">Hidden by the current layout.</p>}
                    </div>
                    <FieldRow label="Menu" htmlFor={`${surface.key}-menu`}>
                      <SelectControl
                        id={`${surface.key}-menu`}
                        value={(location?.menuId as string | undefined) ?? GENERATED_FROM_REGISTRY}
                        onValueChange={(value) => void assignSurfaceMenu(surface.key, value)}
                        options={menuOptions}
                        disabled={assigning === surface.key || !locations}
                      />
                    </FieldRow>
                    <FieldRow label="Location slug" htmlFor={`${surface.key}-location`} description="Advanced: which menu location feeds this surface.">
                      <SelectControl
                        id={`${surface.key}-location`}
                        size="sm"
                        value={slug}
                        onValueChange={(value) => update(surface.field, value as never)}
                        options={locationOptions.length ? locationOptions : [{ value: slug, label: slug }]}
                      />
                    </FieldRow>
                  </div>
                );
              })}
            </CardContent>
          </Card>

          {/* Sidebar */}
          <Card data-size="sm">
            <CardHeader>
              <CardTitle>Sidebar</CardTitle>
              <CardDescription>Desktop behaviour; on phones the sidebar becomes a drawer.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-2">
              <ToggleRow
                id="sidebarCollapsedByDefault"
                label="Start collapsed to icons"
                description="Members can expand it; their choice is remembered."
                checked={draft.sidebarCollapsedByDefault}
                onCheckedChange={(value) => update("sidebarCollapsedByDefault", value)}
                disabled={draft.layout === "topbar"}
              />
              <FieldRow label={`Sidebar width · ${draft.sidebarWidth}px`} htmlFor="sidebarWidth" error={errors.sidebarWidth}>
                <div className="flex items-center gap-3">
                  <input
                    id="sidebarWidth"
                    type="range"
                    min={SIDEBAR_WIDTH_MIN}
                    max={SIDEBAR_WIDTH_MAX}
                    step={4}
                    value={Math.min(SIDEBAR_WIDTH_MAX, Math.max(SIDEBAR_WIDTH_MIN, draft.sidebarWidth))}
                    onChange={(event) => update("sidebarWidth", Number(event.target.value))}
                    disabled={draft.layout === "topbar"}
                    className="h-1.5 flex-1 cursor-pointer appearance-none rounded-full bg-line-strong accent-primary"
                    aria-label="Sidebar width"
                  />
                  <Input
                    type="number"
                    min={SIDEBAR_WIDTH_MIN}
                    max={SIDEBAR_WIDTH_MAX}
                    value={draft.sidebarWidth}
                    onChange={(event) => update("sidebarWidth", Number(event.target.value))}
                    disabled={draft.layout === "topbar"}
                    className="w-24 font-mono"
                    aria-label="Sidebar width in pixels"
                  />
                </div>
              </FieldRow>
            </CardContent>
          </Card>

          {/* Top bar & brand */}
          <Card data-size="sm">
            <CardHeader>
              <CardTitle>Header and brand</CardTitle>
              <CardDescription>Utilities in the top-right and how the site is represented.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-5 md:grid-cols-2">
              <div className="divide-y divide-border">
                <ToggleRow id="showThemeToggle" label="Theme toggle" description="Light / dark switch for members." checked={draft.showThemeToggle} onCheckedChange={(value) => update("showThemeToggle", value)} />
                <ToggleRow id="showNotificationBell" label="Notification bell" description="Unread count and a quick inbox." checked={draft.showNotificationBell} onCheckedChange={(value) => update("showNotificationBell", value)} />
                <ToggleRow id="showSearch" label="Search" description="Search orders, tickets, courses, and help." checked={draft.showSearch} onCheckedChange={(value) => update("showSearch", value)} />
              </div>
              <div className="grid gap-4">
                <FieldRow label="Brand mark">
                  <SegmentedControl
                    aria-label="Brand mark"
                    value={draft.brandMark}
                    onValueChange={(value) => update("brandMark", value)}
                    options={[
                      { value: "site", label: "Site logo" },
                      { value: "custom", label: "Custom" },
                      { value: "none", label: "Name only" },
                    ]}
                  />
                </FieldRow>
                {draft.brandMark === "custom" && (
                  <FieldRow label="Custom logo" htmlFor="customLogoUrl" error={errors.customLogoUrl} description="Pick from the media library or paste a URL.">
                    <div className="flex items-start gap-3">
                      <div className="grid size-12 shrink-0 place-items-center overflow-hidden rounded-lg border border-border bg-surface-2">
                        {draft.customLogoUrl ? (
                          <img src={draft.customLogoUrl} alt="" className="size-full object-contain" />
                        ) : (
                          <ImageIcon className="size-4 text-muted-foreground" />
                        )}
                      </div>
                      <div className="flex min-w-0 flex-1 flex-col gap-2">
                        <Input
                          id="customLogoUrl"
                          value={draft.customLogoUrl}
                          onChange={(event) => update("customLogoUrl", event.target.value)}
                          placeholder="https://… or /media/logo.svg"
                          aria-invalid={Boolean(errors.customLogoUrl)}
                        />
                        <MediaPicker
                          label="Choose from library"
                          allowedTypes={["image"]}
                          onSelect={(mediaId) => setPendingMediaId(mediaId)}
                          onClear={() => update("customLogoUrl", "")}
                        />
                      </div>
                    </div>
                  </FieldRow>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Home */}
          <Card data-size="sm">
            <CardHeader>
              <CardTitle>Home page</CardTitle>
              <CardDescription>
                The widget grid members land on. Arrange the defaults per role or plan in{" "}
                <Link to="/customer-dashboard/layouts" className="text-primary underline-offset-4 hover:underline">
                  Home layouts
                </Link>
                .
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-2">
              <ToggleRow
                id="membersCanEditHome"
                label="Members can rearrange their home"
                description="Move, resize, and hide widgets. Layouts can still lock this off individually."
                checked={draft.membersCanEditHome}
                onCheckedChange={(value) => update("membersCanEditHome", value)}
              />
              <FieldRow label="Welcome headline" htmlFor="welcomeHeadline" error={errors.welcomeHeadline} description="{name} becomes the member's first name.">
                <Input id="welcomeHeadline" value={draft.welcomeHeadline} onChange={(event) => update("welcomeHeadline", event.target.value)} placeholder="Welcome back, {name}" />
              </FieldRow>
            </CardContent>
          </Card>
        </div>

        <Card data-size="sm" className="xl:sticky xl:top-4">
          <CardHeader>
            <CardTitle>Structure preview</CardTitle>
            <CardDescription>What the shell renders for a signed-in member, using the menus above.</CardDescription>
          </CardHeader>
          <CardContent>
            <StructurePreview
              draft={draft}
              sidebar={preview.sidebar}
              topbar={preview.topbar}
              profile={preview.profile}
              sidebarSource={preview.sidebarSource}
              topbarSource={preview.topbarSource}
              profileSource={preview.profileSource}
              landingTitle={landingTitle}
              siteName={siteName}
            />
            <p className="mt-3 flex items-center gap-1.5 text-xs text-muted-foreground">
              <ExternalLink className="size-3" aria-hidden="true" />
              The website reads these settings live — no deploy needed.
            </p>
          </CardContent>
        </Card>
      </div>

      <SaveBar mode="autosave" dirty={isDirty} onDiscard={discardChanges} autosaveStatus={autosaveStatus} autosaveError={autosaveError} />
    </div>
  );
}
