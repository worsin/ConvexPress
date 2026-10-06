/** Footer section controls owned by the Customizer draft. */

import { useState, useId } from "react";
import {
  ChevronDown,
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
import type { FooterConfig, ComposerField, ComposerSectionDef } from "./types";

// ─── Deep Merge Helper ──────────────────────────────

function deepMerge<T extends object>(
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
  id,
  field,
  value,
  onChange,
}: {
  id: string;
  field: ComposerField;
  value: string;
  onChange: (val: string) => void;
}) {
  return (
    <select
      id={id}
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
  label,
}: {
  checked: boolean;
  onChange: (val: boolean) => void;
  id: string;
  label: string;
}) {
  return (
    <SwitchPrimitive.Root
      aria-label={label}
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
      <ToggleSwitch checked={value} onChange={onChange} id={fieldId} label={field.label} />
    </div>
  );
}

function TextField({
  id,
  field,
  value,
  onChange,
}: {
  id: string;
  field: ComposerField;
  value: string;
  onChange: (val: string) => void;
}) {
  return (
    <Input
      id={id}
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
  const fieldPrefix = useId();
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
              label={section.label}
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
              const fieldId = `${fieldPrefix}-${field.id}`;

              return (
                <div key={field.id} className="space-y-1">
                  {field.type !== "toggle" && (
                    <label htmlFor={field.type === "text" || field.type === "select" ? fieldId : undefined} className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
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
                      id={fieldId}
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
                      id={fieldId}
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

/** Existing footer section/column controls reuse the active template draft. */
export function FooterSettingsEditor({ value, onChange }: { value: Record<string, unknown>; onChange: (value: Record<string, unknown>) => void }) {
  const config = deepMerge(FOOTER_DEFAULTS, value as unknown as Partial<FooterConfig>);
  const setField = (sectionId: string, fieldId: string, next: unknown) => onChange({ ...value, [sectionId]: { ...(config[sectionId as keyof FooterConfig] as Record<string, unknown>), [fieldId]: next } });
  return <div className="space-y-2">{FOOTER_SECTIONS.map(section => <SectionPanel key={section.id} section={section} config={config} onToggle={(id, enabled) => setField(id, "enabled", enabled)} onFieldChange={setField} onNavColumnsChange={columns => setField("navColumns", "columns", columns)} />)}</div>;
}
