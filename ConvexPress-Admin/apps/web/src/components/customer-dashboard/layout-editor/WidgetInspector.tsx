/**
 * Widget inspector — the per-widget settings drawer beside the grid.
 * Fields are driven by the registry's `settings` schema for the widget.
 */

import { Keyboard, Trash2 } from "lucide-react";

import type { DashboardLayoutItem, DashboardWidgetDefinition, DashboardWidgetSize } from "@backend/convex/extensions/dashboard/registry";
import { FieldRow, SelectControl, SwitchControl } from "@/components/customer-dashboard/fields";
import { LucideDynamicIcon } from "@/components/icons/LucideDynamicIcon";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { presetForRect, sizePresetsFor } from "@/lib/customer-dashboard/grid";

interface WidgetInspectorProps {
  item: DashboardLayoutItem | null;
  widget: DashboardWidgetDefinition | null;
  itemCount: number;
  onResize: (key: string, size: DashboardWidgetSize) => void;
  onSettingsChange: (key: string, settings: Record<string, string | number | boolean>) => void;
  onRemove: (key: string) => void;
}

const SIZE_LABELS: Record<DashboardWidgetSize, string> = {
  sm: "Small · 3 × 2",
  md: "Medium · 4 × 3",
  lg: "Large · 6 × 3",
  xl: "Full width · 12 × 4",
};

function Shortcuts() {
  return (
    <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 text-[12px] text-muted-foreground">
      <dt><kbd className="rounded border border-line-strong bg-surface-2 px-1 font-mono text-[10.5px] text-foreground">↑ ↓ ← →</kbd></dt>
      <dd>Move the focused widget</dd>
      <dt><kbd className="rounded border border-line-strong bg-surface-2 px-1 font-mono text-[10.5px] text-foreground">Shift + arrows</kbd></dt>
      <dd>Step through its sizes</dd>
      <dt><kbd className="rounded border border-line-strong bg-surface-2 px-1 font-mono text-[10.5px] text-foreground">Delete</kbd></dt>
      <dd>Remove it</dd>
    </dl>
  );
}

export function WidgetInspector({ item, widget, itemCount, onResize, onSettingsChange, onRemove }: WidgetInspectorProps) {
  if (!item || !widget) {
    return (
      <aside aria-label="Widget settings" className="flex flex-col gap-4 rounded-xl border border-border bg-card p-4 shadow-soft">
        <div>
          <h3 className="text-[15px] font-semibold text-foreground">Widget settings</h3>
          <p className="mt-1 text-xs text-muted-foreground">
            Select a widget on the grid to change its size and options. {itemCount} widget{itemCount === 1 ? "" : "s"} on this layout.
          </p>
        </div>
        <div className="flex items-center gap-1.5 text-[12px] font-medium text-foreground">
          <Keyboard className="size-3.5" aria-hidden="true" />
          Keyboard
        </div>
        <Shortcuts />
      </aside>
    );
  }

  const presets = sizePresetsFor(widget);
  const current = presetForRect(item, presets);
  const settings = item.settings ?? {};

  return (
    <aside aria-label={`Settings for ${widget.title}`} className="flex flex-col gap-4 rounded-xl border border-border bg-card p-4 shadow-soft">
      <div className="flex items-start gap-3">
        <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-surface-2 text-ink-2">
          <LucideDynamicIcon name={widget.icon} className="size-4" />
        </span>
        <div className="min-w-0">
          <h3 className="text-[15px] font-semibold text-foreground">{widget.title}</h3>
          <p className="mt-0.5 text-xs text-muted-foreground">{widget.description}</p>
          <p className="mt-1 font-mono text-[11px] text-muted-foreground">
            {item.key} · col {item.x + 1}, row {item.y + 1}
          </p>
        </div>
      </div>

      <FieldRow label="Size" htmlFor="widget-size" description="Only sizes this widget renders well at.">
        <SelectControl
          id="widget-size"
          value={current?.size ?? presets[0]?.size ?? "md"}
          onValueChange={(size) => onResize(item.key, size)}
          options={presets.map((preset) => ({ value: preset.size, label: SIZE_LABELS[preset.size] }))}
        />
      </FieldRow>

      {widget.settings && widget.settings.length > 0 ? (
        <div className="flex flex-col gap-3 border-t border-border pt-4">
          <div className="eyebrow">Options</div>
          {widget.settings.map((setting) => {
            const id = `widget-setting-${setting.key}`;
            const value = settings[setting.key] ?? setting.defaultValue;
            const set = (next: string | number | boolean) => onSettingsChange(item.key, { ...settings, [setting.key]: next });
            if (setting.kind === "toggle") {
              return (
                <div key={setting.key} className="flex items-center justify-between gap-3">
                  <label htmlFor={id} className="text-[13px] text-foreground">
                    {setting.label}
                  </label>
                  <SwitchControl id={id} checked={value === true} onCheckedChange={set} />
                </div>
              );
            }
            if (setting.kind === "select") {
              return (
                <FieldRow key={setting.key} label={setting.label} htmlFor={id}>
                  <SelectControl id={id} size="sm" value={String(value)} onValueChange={set} options={(setting.options ?? []).map((option) => ({ value: option.value, label: option.label }))} />
                </FieldRow>
              );
            }
            if (setting.kind === "number") {
              return (
                <FieldRow key={setting.key} label={setting.label} htmlFor={id} description={setting.min !== undefined && setting.max !== undefined ? `${setting.min}–${setting.max}` : undefined}>
                  <Input
                    id={id}
                    type="number"
                    min={setting.min}
                    max={setting.max}
                    value={Number(value)}
                    onChange={(event) => {
                      const number = Number(event.target.value);
                      if (!Number.isFinite(number)) return;
                      set(Math.min(setting.max ?? number, Math.max(setting.min ?? number, number)));
                    }}
                    className="h-8 font-mono"
                  />
                </FieldRow>
              );
            }
            return (
              <FieldRow key={setting.key} label={setting.label} htmlFor={id}>
                <Input id={id} value={String(value)} maxLength={200} onChange={(event) => set(event.target.value)} className="h-8" />
              </FieldRow>
            );
          })}
          {Object.keys(settings).length > 0 && (
            <Button variant="ghost" size="xs" className="self-start" onClick={() => onSettingsChange(item.key, {})}>
              Reset options
            </Button>
          )}
        </div>
      ) : (
        <p className="border-t border-border pt-4 text-xs text-muted-foreground">This widget has no options.</p>
      )}

      <div className="flex items-center justify-between border-t border-border pt-4">
        <Button variant="destructive" size="sm" onClick={() => onRemove(item.key)}>
          <Trash2 data-icon="inline-start" />
          Remove
        </Button>
        <span className="text-[11px] text-muted-foreground">{itemCount} on layout</span>
      </div>
    </aside>
  );
}
