/**
 * Customer dashboard — home layout editor (/customer-dashboard/layouts/$scope)
 *
 * Edits the widget grid for one scope. Changes stay local until Save; leaving
 * with unsaved edits asks first.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation } from "convex/react";
import { useQuery } from "convex-helpers/react/cache";
import { toast } from "sonner";
import { ArrowLeft, Monitor, Plus, RotateCcw, Save, Smartphone, Trash2 } from "lucide-react";

import { api } from "@backend/convex/_generated/api";
import {
  buildDefaultLayoutItems,
  DASHBOARD_WIDGETS,
  pluginIsEnabled,
  type DashboardLayoutItem,
  type DashboardWidgetDefinition,
  type DashboardWidgetSize,
} from "@backend/convex/extensions/dashboard/registry";
import { DashboardTabBar } from "@/components/customer-dashboard/DashboardTabBar";
import { SegmentedControl, ToggleRow } from "@/components/customer-dashboard/fields";
import { LayoutGridEditor } from "@/components/customer-dashboard/layout-editor/LayoutGridEditor";
import { WidgetInspector } from "@/components/customer-dashboard/layout-editor/WidgetInspector";
import { WidgetPickerDialog } from "@/components/customer-dashboard/layout-editor/WidgetPickerDialog";
import { PluginGuard } from "@/components/plugins/PluginGuard";
import { PageHeader } from "@/components/shell/PageHeader";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { usePluginSettings } from "@/hooks/usePluginSettings";
import { useUnsavedChangesWarning } from "@/hooks/useUnsavedChangesWarning";
import {
  addWidgetItem,
  finalizeLayout,
  layoutsEqual,
  removeItem,
  resizeItem,
  sizePresetsFor,
  updateItemSettings,
} from "@/lib/customer-dashboard/grid";
import { defaultLayoutTitle, describeScope, isValidScope, type ScopeOptions } from "@/lib/customer-dashboard/scopes";

export const Route = createFileRoute("/_authenticated/_admin/customer-dashboard/layouts/$scope")({
  component: LayoutEditorPage,
});

function LayoutEditorPage() {
  return (
    <PluginGuard pluginId="dashboard">
      <LayoutEditor />
    </PluginGuard>
  );
}

interface LayoutDoc {
  scope: string;
  exists: boolean;
  title: string;
  items: DashboardLayoutItem[];
  membersCanEdit: boolean;
}

function LayoutEditor() {
  const { scope } = Route.useParams();
  const navigate = useNavigate();
  const valid = isValidScope(scope);
  const layout = useQuery(api.extensions.dashboard.queries.defaultLayout, valid ? { scope } : "skip") as LayoutDoc | undefined;
  const scopeOptions = useQuery(api.extensions.dashboard.queries.scopeOptions) as ScopeOptions | undefined;
  const saveDefaultLayout = useMutation(api.extensions.dashboard.mutations.saveDefaultLayout);
  const deleteDefaultLayout = useMutation(api.extensions.dashboard.mutations.deleteDefaultLayout);
  const { values: pluginFlags } = usePluginSettings();
  const flags = pluginFlags as Record<string, unknown>;

  const [items, setItems] = useState<DashboardLayoutItem[] | null>(null);
  const [baseline, setBaseline] = useState<DashboardLayoutItem[] | null>(null);
  const [title, setTitle] = useState("");
  const [baselineTitle, setBaselineTitle] = useState("");
  const [membersCanEdit, setMembersCanEdit] = useState(true);
  const [baselineMembersCanEdit, setBaselineMembersCanEdit] = useState(true);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [view, setView] = useState<"desktop" | "mobile">("desktop");
  const [pickerOpen, setPickerOpen] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [saving, setSaving] = useState(false);

  // Seed from the server once; re-sync only while nothing is edited locally.
  useEffect(() => {
    if (!layout) return;
    const serverTitle = layout.exists ? layout.title : defaultLayoutTitle(scope, scopeOptions);
    const clean =
      items === null ||
      (baseline !== null && layoutsEqual(items, baseline) && title === baselineTitle && membersCanEdit === baselineMembersCanEdit);
    if (clean) {
      setItems(layout.items);
      setBaseline(layout.items);
      setTitle(serverTitle);
      setBaselineTitle(serverTitle);
      setMembersCanEdit(layout.membersCanEdit);
      setBaselineMembersCanEdit(layout.membersCanEdit);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layout, scopeOptions]);

  const isDirty =
    items !== null &&
    baseline !== null &&
    (!layoutsEqual(items, baseline) || title !== baselineTitle || membersCanEdit !== baselineMembersCanEdit);
  useUnsavedChangesWarning({ isDirty, enabled: !saving });

  const widgetById = useMemo(() => new Map(DASHBOARD_WIDGETS.map((widget) => [widget.id, widget])), []);
  const selectedItem = items?.find((item) => item.key === selectedKey) ?? null;
  const selectedWidget = selectedItem ? (widgetById.get(selectedItem.widgetId) ?? null) : null;
  const counts = useMemo(() => {
    const out: Record<string, number> = {};
    for (const item of items ?? []) out[item.widgetId] = (out[item.widgetId] ?? 0) + 1;
    return out;
  }, [items]);

  const change = useCallback((next: DashboardLayoutItem[]) => setItems(next), []);
  const handleAdd = useCallback(
    (widget: DashboardWidgetDefinition, size?: DashboardWidgetSize) => {
      setItems((current) => {
        const next = addWidgetItem(current ?? [], widget, size);
        const added = next.find((item) => !(current ?? []).some((existing) => existing.key === item.key));
        if (added) setSelectedKey(added.key);
        return next;
      });
      setPickerOpen(false);
      toast.success(`${widget.title} added`);
    },
    [],
  );
  const handleResize = useCallback(
    (key: string, size: DashboardWidgetSize) => {
      setItems((current) => {
        if (!current) return current;
        const item = current.find((entry) => entry.key === key);
        const widget = item ? widgetById.get(item.widgetId) : undefined;
        if (!item || !widget) return current;
        const presets = sizePresetsFor(widget);
        const preset = presets.find((entry) => entry.size === size);
        if (!preset) return current;
        return finalizeLayout(resizeItem(current, key, preset.w, preset.h, presets));
      });
    },
    [widgetById],
  );
  const handleSettings = useCallback((key: string, settings: Record<string, string | number | boolean>) => {
    setItems((current) => (current ? updateItemSettings(current, key, settings) : current));
  }, []);
  const handleRemove = useCallback((key: string) => {
    setItems((current) => (current ? removeItem(current, key) : current));
    setSelectedKey((current) => (current === key ? null : current));
  }, []);

  const handleSave = async () => {
    if (!items) return;
    setSaving(true);
    try {
      await saveDefaultLayout({ scope, title: title.trim() || defaultLayoutTitle(scope, scopeOptions), items, membersCanEdit });
      setBaseline(items);
      setBaselineTitle(title);
      setBaselineMembersCanEdit(membersCanEdit);
      toast.success("Layout saved");
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : "Failed to save layout");
    } finally {
      setSaving(false);
    }
  };

  const handleReset = () => {
    setItems(buildDefaultLayoutItems(flags));
    setSelectedKey(null);
    setConfirmReset(false);
    toast.info("Reset to the platform default — save to keep it");
  };

  const handleDelete = async () => {
    setSaving(true);
    try {
      await deleteDefaultLayout({ scope });
      toast.success("Layout deleted");
      setBaseline(items);
      await navigate({ to: "/customer-dashboard/layouts" });
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : "Failed to delete layout");
      setSaving(false);
    }
  };

  if (!valid) {
    return (
      <div className="space-y-[18px]">
        <PageHeader eyebrow="Customer dashboard" title="Layout not found" />
        <DashboardTabBar />
        <p className="text-sm text-muted-foreground">
          "{scope}" is not a valid layout scope.{" "}
          <Link to="/customer-dashboard/layouts" className="text-primary underline-offset-4 hover:underline">
            Back to layouts
          </Link>
        </p>
      </div>
    );
  }

  const described = describeScope(scope, scopeOptions);
  const disabledCount = (items ?? []).filter((item) => {
    const widget = widgetById.get(item.widgetId);
    return widget ? !pluginIsEnabled(widget.pluginId, flags) : true;
  }).length;

  return (
    <div className="space-y-[18px]">
      <PageHeader
        eyebrow={
          <Link to="/customer-dashboard/layouts" className="inline-flex items-center gap-1 hover:text-foreground">
            <ArrowLeft className="size-3" aria-hidden="true" />
            Home layouts
          </Link>
        }
        title={title || described.name}
        chip={
          <Badge variant="outline" className="font-sans text-[11px] uppercase tracking-wide">
            {described.kind === "default" ? "Everyone" : `${described.kind} · ${described.slug}`}
          </Badge>
        }
        meta={[
          <span key="count">{items?.length ?? 0} widgets</span>,
          layout && !layout.exists ? <span key="unsaved">Not saved yet — showing the platform default</span> : null,
          isDirty ? <span key="dirty" className="text-warning">Unsaved changes</span> : <span key="clean">All changes saved</span>,
        ]}
        actions={
          <>
            <Button variant="outline" size="sm" onClick={() => setPickerOpen(true)} disabled={!items}>
              <Plus data-icon="inline-start" />
              Add widget
            </Button>
            <Button variant="outline" size="sm" onClick={() => setConfirmReset(true)} disabled={!items}>
              <RotateCcw data-icon="inline-start" />
              Reset to platform default
            </Button>
            <Button size="sm" onClick={() => void handleSave()} disabled={!isDirty || saving || !items}>
              <Save data-icon="inline-start" />
              {saving ? "Saving…" : "Save layout"}
            </Button>
          </>
        }
      />
      <DashboardTabBar />

      <div className="flex flex-wrap items-end gap-x-6 gap-y-3 rounded-xl border border-border bg-card px-4 py-3 shadow-soft">
        {scope !== "default" && (
          <div className="flex min-w-56 flex-col gap-1.5">
            <Label htmlFor="layout-title" className="text-[13px]">
              Layout name
            </Label>
            <Input id="layout-title" value={title} onChange={(event) => setTitle(event.target.value)} maxLength={80} className="h-8" />
          </div>
        )}
        <div className="min-w-64 flex-1">
          <ToggleRow
            id="membersCanEdit"
            label="Members can rearrange"
            description="Move, resize, and hide widgets on their own copy of this layout."
            checked={membersCanEdit}
            onCheckedChange={setMembersCanEdit}
          />
        </div>
        <SegmentedControl
          aria-label="Preview width"
          value={view}
          onValueChange={setView}
          options={[
            { value: "desktop", label: "Desktop", icon: <Monitor className="size-3.5" /> },
            { value: "mobile", label: "Mobile", icon: <Smartphone className="size-3.5" /> },
          ]}
        />
        {layout?.exists && scope !== "default" && (
          <Button variant="destructive" size="sm" onClick={() => setConfirmDelete(true)}>
            <Trash2 data-icon="inline-start" />
            Delete layout
          </Button>
        )}
      </div>

      {disabledCount > 0 && (
        <p className="rounded-lg border border-warning/40 bg-warning-soft px-3 py-2 text-xs text-warning">
          {disabledCount} widget{disabledCount === 1 ? "" : "s"} belong to a disabled plugin and stay hidden for members until it is enabled.
        </p>
      )}

      <div className="grid items-start gap-[18px] xl:grid-cols-[minmax(0,1fr)_300px]">
        {items === null ? (
          <div className="h-[420px] animate-pulse rounded-xl bg-muted" />
        ) : (
          <LayoutGridEditor
            items={items}
            onChange={change}
            widgets={DASHBOARD_WIDGETS}
            pluginFlags={flags}
            selectedKey={selectedKey}
            onSelect={setSelectedKey}
            mobilePreview={view === "mobile"}
          />
        )}
        <WidgetInspector
          item={selectedItem}
          widget={selectedWidget}
          itemCount={items?.length ?? 0}
          onResize={handleResize}
          onSettingsChange={handleSettings}
          onRemove={handleRemove}
        />
      </div>

      <WidgetPickerDialog open={pickerOpen} onOpenChange={setPickerOpen} widgets={DASHBOARD_WIDGETS} pluginFlags={flags} counts={counts} onAdd={handleAdd} />

      <AlertDialog open={confirmReset} onOpenChange={setConfirmReset}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Reset to the platform default?</AlertDialogTitle>
            <AlertDialogDescription>
              Replaces the grid with the widgets marked default in the registry for the plugins enabled on this site. Nothing is stored until you save.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep my layout</AlertDialogCancel>
            <AlertDialogAction onClick={handleReset}>Reset</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this layout?</AlertDialogTitle>
            <AlertDialogDescription>
              Members with this {described.kind} fall back to the next layout in the chain (plan, role, then everyone). Their own arrangements are kept.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => void handleDelete()}>Delete layout</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
