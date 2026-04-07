/**
 * FooterComposer - Two-column composer for configuring the site footer.
 *
 * Left panel: collapsible section controls with toggle, select, text, and variant-grid fields.
 * Right panel: real-time FooterPreview with device size toolbar.
 * Special handling for navColumns section (dynamic add/remove columns).
 *
 * Reads/writes the "footer" settings section via Convex.
 */

import { useState, useCallback, useEffect } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "@backend/convex/_generated/api";
import {
  ChevronDown,
  RotateCcw,
  Monitor,
  Tablet,
  Smartphone,
  Loader2,
  Save,
  ExternalLink,
  Plus,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { Switch as SwitchPrimitive } from "@base-ui/react/switch";
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from "@/components/ui/collapsible";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { FOOTER_DEFAULTS, FOOTER_SECTIONS } from "./constants";
import { FooterPreview } from "./FooterPreview";
import type { FooterConfig, ComposerField, ComposerSectionDef } from "./types";

// ─── Device Preview Sizes ───────────────────────────

type DeviceSize = "desktop" | "tablet" | "mobile";

const DEVICE_WIDTHS: Record<DeviceSize, string> = {
  desktop: "w-full",
  tablet: "max-w-[768px]",
  mobile: "max-w-[375px]",
};

// ─── Deep Merge Helper ──────────────────────────────

function deepMerge<T extends Record<string, unknown>>(
  defaults: T,
  overrides: Partial<T> | null | undefined,
): T {
  if (!overrides) return { ...defaults };
  const result = { ...defaults } as Record<string, unknown>;
  for (const key of Object.keys(defaults)) {
    const defVal = (defaults as Record<string, unknown>)[key];
    const overVal = (overrides as Record<string, unknown>)[key];
    if (
      defVal &&
      typeof defVal === "object" &&
      !Array.isArray(defVal) &&
      overVal &&
      typeof overVal === "object" &&
      !Array.isArray(overVal)
    ) {
      result[key] = deepMerge(
        defVal as Record<string, unknown>,
        overVal as Record<string, unknown>,
      );
    } else if (overVal !== undefined) {
      result[key] = overVal;
    }
  }
  return result as T;
}

// ─── Menu Source Options ────────────────────────────

const MENU_SOURCE_OPTIONS = [
  { value: "footer-1", label: "Footer Menu 1" },
  { value: "footer-2", label: "Footer Menu 2" },
  { value: "footer-3", label: "Footer Menu 3" },
  { value: "auto-pages", label: "Auto Pages" },
  { value: "custom", label: "Custom" },
];

// ─── Field Renderers ────────────────────────────────

function VariantGrid({
  field,
  value,
  onChange,
}: {
  field: ComposerField;
  value: string;
  onChange: (val: string) => void;
}) {
  const cols = field.columns === 2 ? "grid-cols-2" : "grid-cols-3";
  return (
    <div className={cn("grid gap-1.5", cols)}>
      {field.options?.map((opt) => (
        <button
          key={opt.value}
          type="button"
          onClick={() => onChange(opt.value)}
          className={cn(
            "px-2 py-1.5 text-xs rounded-md border text-center transition-colors",
            value === opt.value
              ? "border-primary bg-primary/10 text-primary font-medium"
              : "border-border bg-card text-muted-foreground hover:border-foreground/20",
          )}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

function SelectField({
  field,
  value,
  onChange,
}: {
  field: ComposerField;
  value: string;
  onChange: (val: string) => void;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-full h-8 rounded-md border border-border bg-card px-2 text-xs text-foreground outline-hidden focus:border-ring"
    >
      {field.options?.map((opt) => (
        <option key={opt.value} value={opt.value}>
          {opt.label}
        </option>
      ))}
    </select>
  );
}

function ToggleSwitch({
  checked,
  onChange,
  id,
}: {
  checked: boolean;
  onChange: (val: boolean) => void;
  id: string;
}) {
  return (
    <SwitchPrimitive.Root
      checked={checked}
      onCheckedChange={onChange}
      id={id}
      className={cn(
        "relative inline-flex h-4 w-7 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors focus-visible:outline-hidden focus-visible:ring-1 focus-visible:ring-ring/50",
        checked ? "bg-primary" : "bg-input",
      )}
    >
      <SwitchPrimitive.Thumb
        className={cn(
          "pointer-events-none block size-2.5 rounded-full shadow-sm transition-transform",
          checked
            ? "translate-x-3 bg-primary-foreground"
            : "translate-x-0.5 bg-foreground/70",
        )}
      />
    </SwitchPrimitive.Root>
  );
}

function ToggleField({
  field,
  value,
  onChange,
}: {
  field: ComposerField;
  value: boolean;
  onChange: (val: boolean) => void;
}) {
  const fieldId = `toggle-${field.id}`;
  return (
    <div className="flex items-center justify-between">
      <label htmlFor={fieldId} className="text-xs text-foreground cursor-pointer">
        {field.label}
      </label>
      <ToggleSwitch checked={value} onChange={onChange} id={fieldId} />
    </div>
  );
}

function TextField({
  field,
  value,
  onChange,
}: {
  field: ComposerField;
  value: string;
  onChange: (val: string) => void;
}) {
  return (
    <Input
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={field.label}
      className="h-8 text-xs"
    />
  );
}

// ─── Nav Columns Editor ─────────────────────────────

function NavColumnsEditor({
  columns,
  onChange,
}: {
  columns: FooterConfig["navColumns"]["columns"];
  onChange: (columns: FooterConfig["navColumns"]["columns"]) => void;
}) {
  const handleAddColumn = () => {
    if (columns.length >= 4) {
      toast.info("Maximum 4 navigation columns");
      return;
    }
    onChange([
      ...columns,
      { heading: `Column ${columns.length + 1}`, menuSource: "footer-1" },
    ]);
  };

  const handleRemoveColumn = (index: number) => {
    onChange(columns.filter((_, i) => i !== index));
  };

  const handleUpdateColumn = (
    index: number,
    field: "heading" | "menuSource",
    value: string,
  ) => {
    const updated = [...columns];
    updated[index] = { ...updated[index], [field]: value };
    onChange(updated);
  };

  return (
    <div className="space-y-2">
      {columns.map((col, index) => (
        <div
          key={index}
          className="border border-border rounded-md p-2.5 bg-card space-y-2"
        >
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
              Column {index + 1}
            </span>
            <button
              type="button"
              onClick={() => handleRemoveColumn(index)}
              className="text-muted-foreground hover:text-destructive transition-colors"
              title="Remove column"
            >
              <Trash2 className="size-3" />
            </button>
          </div>
          <Input
            value={col.heading}
            onChange={(e) =>
              handleUpdateColumn(index, "heading", e.target.value)
            }
            placeholder="Column heading"
            className="h-7 text-xs"
          />
          <select
            value={col.menuSource}
            onChange={(e) =>
              handleUpdateColumn(index, "menuSource", e.target.value)
            }
            className="w-full h-7 rounded-md border border-border bg-card px-2 text-xs text-foreground outline-hidden focus:border-ring"
          >
            {MENU_SOURCE_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>
      ))}

      <Button
        variant="ghost"
        size="xs"
        onClick={handleAddColumn}
        className="w-full gap-1"
        disabled={columns.length >= 4}
      >
        <Plus className="size-3" />
        Add Column
      </Button>
    </div>
  );
}

// ─── Section Panel ──────────────────────────────────

function SectionPanel({
  section,
  config,
  onToggle,
  onFieldChange,
  onNavColumnsChange,
}: {
  section: ComposerSectionDef;
  config: FooterConfig;
  onToggle: (sectionId: string, enabled: boolean) => void;
  onFieldChange: (sectionId: string, fieldId: string, value: unknown) => void;
  onNavColumnsChange: (columns: FooterConfig["navColumns"]["columns"]) => void;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const sectionConfig = config[section.id as keyof FooterConfig] as Record<
    string,
    unknown
  >;
  const isEnabled = section.hasToggle
    ? (sectionConfig?.enabled as boolean) ?? true
    : true;

  const isNavColumns = section.id === "navColumns";

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <div
        className={cn(
          "border border-border rounded-lg overflow-hidden",
          !isEnabled && section.hasToggle && "opacity-60",
        )}
      >
        {/* Section header */}
        <div className="flex items-center gap-2 px-3 py-2.5 bg-card">
          {section.hasToggle && (
            <ToggleSwitch
              checked={isEnabled}
              onChange={(val) => onToggle(section.id, val)}
              id={`section-toggle-${section.id}`}
            />
          )}
          <CollapsibleTrigger className="flex-1 flex items-center justify-between cursor-pointer min-w-0">
            <div className="min-w-0">
              <span className="text-xs font-medium text-foreground block">
                {section.label}
              </span>
              <span className="text-[10px] text-muted-foreground block truncate">
                {section.hint}
              </span>
            </div>
            <ChevronDown
              className={cn(
                "size-3.5 text-muted-foreground shrink-0 transition-transform duration-200",
                isOpen && "rotate-180",
              )}
            />
          </CollapsibleTrigger>
        </div>

        {/* Section fields */}
        <CollapsibleContent>
          <div className="px-3 py-3 space-y-3 border-t border-border bg-muted/30">
            {/* Standard fields */}
            {section.fields.map((field) => {
              const fieldValue = sectionConfig?.[field.id];

              return (
                <div key={field.id} className="space-y-1">
                  {field.type !== "toggle" && (
                    <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
                      {field.label}
                    </label>
                  )}

                  {field.type === "variant-grid" && (
                    <VariantGrid
                      field={field}
                      value={(fieldValue as string) ?? ""}
                      onChange={(val) =>
                        onFieldChange(section.id, field.id, val)
                      }
                    />
                  )}

                  {field.type === "select" && (
                    <SelectField
                      field={field}
                      value={(fieldValue as string) ?? ""}
                      onChange={(val) =>
                        onFieldChange(section.id, field.id, val)
                      }
                    />
                  )}

                  {field.type === "toggle" && (
                    <ToggleField
                      field={field}
                      value={(fieldValue as boolean) ?? false}
                      onChange={(val) =>
                        onFieldChange(section.id, field.id, val)
                      }
                    />
                  )}

                  {field.type === "text" && (
                    <TextField
                      field={field}
                      value={(fieldValue as string) ?? ""}
                      onChange={(val) =>
                        onFieldChange(section.id, field.id, val)
                      }
                    />
                  )}
                </div>
              );
            })}

            {/* Nav Columns special section */}
            {isNavColumns && (
              <NavColumnsEditor
                columns={config.navColumns.columns}
                onChange={onNavColumnsChange}
              />
            )}
          </div>
        </CollapsibleContent>
      </div>
    </Collapsible>
  );
}

// ─── Main Composer ───────────────────────────────────

export function FooterComposer() {
  const settingsData = useQuery(api.settings.queries.getBySection, {
    section: "footer",
  });
  const updateSection = useMutation(api.settings.mutations.updateSection);

  const [config, setConfig] = useState<FooterConfig>(FOOTER_DEFAULTS);
  const [isSaving, setIsSaving] = useState(false);
  const [device, setDevice] = useState<DeviceSize>("desktop");
  const [initialized, setInitialized] = useState(false);

  // Merge fetched data with defaults
  useEffect(() => {
    if (settingsData !== undefined && !initialized) {
      const stored = settingsData as Record<string, unknown> | null;
      if (stored) {
        // Deep merge but keep arrays (navColumns.columns) from stored data
        const merged = deepMerge(
          FOOTER_DEFAULTS,
          stored as Partial<FooterConfig>,
        );
        // Override columns array directly from stored if present
        const storedNavColumns = (stored as Partial<FooterConfig>)?.navColumns;
        if (storedNavColumns?.columns) {
          merged.navColumns = {
            ...merged.navColumns,
            columns: storedNavColumns.columns,
          };
        }
        setConfig(merged);
      }
      setInitialized(true);
    }
  }, [settingsData, initialized]);

  const handleToggle = useCallback(
    (sectionId: string, enabled: boolean) => {
      setConfig((prev) => ({
        ...prev,
        [sectionId]: {
          ...(prev[sectionId as keyof FooterConfig] as Record<string, unknown>),
          enabled,
        },
      }));
    },
    [],
  );

  const handleFieldChange = useCallback(
    (sectionId: string, fieldId: string, value: unknown) => {
      setConfig((prev) => ({
        ...prev,
        [sectionId]: {
          ...(prev[sectionId as keyof FooterConfig] as Record<string, unknown>),
          [fieldId]: value,
        },
      }));
    },
    [],
  );

  const handleNavColumnsChange = useCallback(
    (columns: FooterConfig["navColumns"]["columns"]) => {
      setConfig((prev) => ({
        ...prev,
        navColumns: {
          ...prev.navColumns,
          columns,
        },
      }));
    },
    [],
  );

  const handleReset = useCallback(() => {
    setConfig(FOOTER_DEFAULTS);
    toast.info("Reset to default footer settings");
  }, []);

  const handleSave = useCallback(async () => {
    setIsSaving(true);
    try {
      await updateSection({ section: "footer", values: config });
      toast.success("Footer saved successfully");
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "Failed to save footer";
      toast.error(message);
    } finally {
      setIsSaving(false);
    }
  }, [updateSection, config]);

  // Loading state
  if (settingsData === undefined) {
    return (
      <div className="flex flex-col gap-6 pb-8">
        <div>
          <h1 className="text-xl font-semibold text-foreground">
            Footer Builder
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Configure your website's footer layout and components.
          </p>
        </div>
        <div className="flex items-center justify-center py-20">
          <Loader2 className="size-6 animate-spin text-muted-foreground" />
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 pb-8">
      {/* Page header */}
      <div>
        <h1 className="text-xl font-semibold text-foreground">
          Footer Builder
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Configure your website's footer layout and components. Changes preview
          in real-time.
        </p>
      </div>

      {/* Two-column layout */}
      <div className="flex gap-6 items-start">
        {/* Left sidebar - section controls */}
        <div className="w-[360px] shrink-0 flex flex-col gap-3">
          {/* Sidebar header */}
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-foreground">
              Footer Sections
            </span>
            <Button variant="ghost" size="xs" onClick={handleReset}>
              <RotateCcw className="size-3" />
              Reset
            </Button>
          </div>

          {/* Section panels */}
          <div className="flex flex-col gap-2">
            {FOOTER_SECTIONS.map((section) => (
              <SectionPanel
                key={section.id}
                section={section}
                config={config}
                onToggle={handleToggle}
                onFieldChange={handleFieldChange}
                onNavColumnsChange={handleNavColumnsChange}
              />
            ))}
          </div>

          {/* Save bar */}
          <div className="flex items-center gap-2 pt-2 border-t border-border">
            <Button variant="ghost" size="sm" className="flex-1 gap-1.5">
              <ExternalLink className="size-3" />
              Preview on Site
            </Button>
            <Button
              size="sm"
              className="flex-1 gap-1.5"
              onClick={handleSave}
              disabled={isSaving}
            >
              {isSaving ? (
                <Loader2 className="size-3 animate-spin" />
              ) : (
                <Save className="size-3" />
              )}
              {isSaving ? "Saving..." : "Save Footer"}
            </Button>
          </div>
        </div>

        {/* Right panel - preview */}
        <div className="flex-1 min-w-0 flex flex-col gap-3">
          {/* Device toolbar */}
          <div className="flex items-center gap-1 self-end">
            {(
              [
                { size: "desktop", icon: Monitor, label: "Desktop" },
                { size: "tablet", icon: Tablet, label: "Tablet" },
                { size: "mobile", icon: Smartphone, label: "Mobile" },
              ] as const
            ).map(({ size, icon: Icon, label }) => (
              <Button
                key={size}
                variant={device === size ? "outline" : "ghost"}
                size="icon-xs"
                onClick={() => setDevice(size)}
                title={label}
              >
                <Icon className="size-3" />
              </Button>
            ))}
          </div>

          {/* Placeholder page content above footer */}
          <div
            className={cn(
              "mx-auto transition-all duration-300",
              DEVICE_WIDTHS[device],
            )}
          >
            <div className="rounded-lg border border-border/50 bg-muted/20 p-6 space-y-3">
              <div className="h-3 w-2/3 rounded bg-foreground/5" />
              <div className="h-2 w-full rounded bg-foreground/5" />
              <div className="h-2 w-5/6 rounded bg-foreground/5" />
              <div className="h-2 w-4/5 rounded bg-foreground/5" />
              <div className="h-20 w-full rounded bg-foreground/5 mt-4" />
            </div>
          </div>

          {/* Preview container */}
          <div
            className={cn(
              "mx-auto transition-all duration-300",
              DEVICE_WIDTHS[device],
            )}
          >
            <FooterPreview config={config} />
          </div>
        </div>
      </div>
    </div>
  );
}
