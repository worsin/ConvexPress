/**
 * Per-widget settings, rendered from the registry's setting schema
 * (number / toggle / select / text). Values are clamped client-side and
 * re-normalized by the backend on save.
 */

import { useEffect, useState } from "react";

import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { DashboardWidgetDefinition, DashboardWidgetSetting } from "../types";

type SettingsValues = Record<string, string | number | boolean>;

interface WidgetSettingsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  widget: DashboardWidgetDefinition;
  values: SettingsValues;
  onSave: (values: SettingsValues) => void;
}

export function resolveWidgetSettings(widget: DashboardWidgetDefinition | undefined, stored: SettingsValues | undefined): SettingsValues {
  const out: SettingsValues = {};
  for (const setting of widget?.settings ?? []) {
    const value = stored?.[setting.key];
    out[setting.key] = value === undefined ? setting.defaultValue : value;
  }
  return out;
}

export function WidgetSettingsDialog({ open, onOpenChange, widget, values, onSave }: WidgetSettingsDialogProps) {
  const [draft, setDraft] = useState<SettingsValues>(values);
  useEffect(() => {
    if (open) setDraft(values);
  }, [open, values]);

  const update = (key: string, value: string | number | boolean) => setDraft((current) => ({ ...current, [key]: value }));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="rounded-none sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-base">{widget.title} settings</DialogTitle>
          <DialogDescription>{widget.description}</DialogDescription>
        </DialogHeader>
        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            onSave(clampAll(widget.settings ?? [], draft));
            onOpenChange(false);
          }}
        >
          {(widget.settings ?? []).map((setting) => (
            <SettingField key={setting.key} setting={setting} value={draft[setting.key]} onChange={(value) => update(setting.key, value)} />
          ))}
          <DialogFooter>
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              className="inline-flex h-9 items-center border border-border px-3 text-sm text-foreground transition-colors hover:bg-muted focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="inline-flex h-9 items-center bg-primary px-3 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring"
            >
              Save
            </button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function clampAll(settings: DashboardWidgetSetting[], values: SettingsValues): SettingsValues {
  const out: SettingsValues = {};
  for (const setting of settings) {
    const value = values[setting.key];
    if (value === undefined) continue;
    if (setting.kind === "number") {
      const number = Number(value);
      if (!Number.isFinite(number)) continue;
      out[setting.key] = Math.min(setting.max ?? number, Math.max(setting.min ?? number, number));
    } else if (setting.kind === "toggle") {
      out[setting.key] = value === true;
    } else {
      out[setting.key] = String(value);
    }
  }
  return out;
}

function SettingField({
  setting,
  value,
  onChange,
}: {
  setting: DashboardWidgetSetting;
  value: string | number | boolean | undefined;
  onChange: (value: string | number | boolean) => void;
}) {
  const id = `widget-setting-${setting.key}`;
  if (setting.kind === "toggle") {
    return (
      <div className="flex items-center gap-2">
        <Checkbox id={id} checked={value === true} onCheckedChange={(checked) => onChange(checked === true)} />
        <Label htmlFor={id}>{setting.label}</Label>
      </div>
    );
  }
  if (setting.kind === "select") {
    return (
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={id}>{setting.label}</Label>
        <select
          id={id}
          value={String(value ?? setting.defaultValue)}
          onChange={(event) => onChange(event.target.value)}
          className="h-9 border border-input bg-input/30 px-3 text-sm text-foreground outline-hidden focus-visible:ring-2 focus-visible:ring-ring"
        >
          {(setting.options ?? []).map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id}>{setting.label}</Label>
      <Input
        id={id}
        type={setting.kind === "number" ? "number" : "text"}
        min={setting.min}
        max={setting.max}
        value={String(value ?? setting.defaultValue)}
        onChange={(event) => onChange(setting.kind === "number" ? Number(event.target.value) : event.target.value)}
      />
      {setting.kind === "number" && (setting.min !== undefined || setting.max !== undefined) && (
        <p className="text-[11px] text-muted-foreground">
          {setting.min !== undefined ? `Min ${setting.min}` : ""}
          {setting.min !== undefined && setting.max !== undefined ? " · " : ""}
          {setting.max !== undefined ? `Max ${setting.max}` : ""}
        </p>
      )}
    </div>
  );
}
