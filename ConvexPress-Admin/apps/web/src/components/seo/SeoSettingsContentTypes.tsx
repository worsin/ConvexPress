/**
 * SeoSettingsContentTypes - Title templates and noindex defaults per content type.
 */

import { useState, useEffect, useCallback, useMemo } from "react";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";
import { useSeoSetting } from "@/hooks/seo/useSeoSettings";
import { useSeoMutations } from "@/hooks/seo/useSeoMutations";
import { TemplateVariableInput } from "./TemplateVariableInput";
import { CONTENT_TYPE_CONFIGS } from "@/lib/seo/constants";
import { previewTemplate } from "@/lib/seo/templates";
import { useDebouncedAutosave } from "./useDebouncedAutosave";

export function SeoSettingsContentTypes() {
  const settingsData = useSeoSetting("titles");
  const { updateGlobal } = useSeoMutations();
  const [values, setValues] = useState<Record<string, unknown>>({});

  useEffect(() => {
    if (settingsData?.value) {
      setValues(settingsData.value as Record<string, unknown>);
    }
  }, [settingsData]);

  const current = (settingsData?.value ?? {}) as Record<string, unknown>;
  const nextValue = useMemo(() => ({ ...current, ...values }), [current, values]);
  const currentSignature = useMemo(() => JSON.stringify(current), [current]);
  const nextSignature = useMemo(() => JSON.stringify(nextValue), [nextValue]);
  const hasChanges = settingsData !== undefined && currentSignature !== nextSignature;

  const saveMutation = useCallback(async () => {
    await updateGlobal({
      key: "titles",
      value: JSON.stringify(nextValue),
    });
  }, [nextValue, updateGlobal]);
  const { status, error } = useDebouncedAutosave({
    enabled: hasChanges,
    signature: nextSignature,
    onSave: saveMutation,
  });

  const updateValue = (key: string, value: unknown) => {
    setValues((prev) => ({ ...prev, [key]: value }));
  };

  const separator = (values.separator as string) ?? "|";
  const siteTitle = (values.siteTitle as string) || "My Site";
  const statusText =
    status === "saving"
      ? "Saving..."
      : status === "pending"
        ? "Saving shortly..."
        : status === "error"
          ? error ?? "Autosave failed."
          : "All changes saved.";

  if (settingsData === undefined) {
    return <div className="py-8 text-center text-xs text-muted-foreground">Loading settings...</div>;
  }

  return (
    <div className="space-y-6">
      <p className="text-xs text-muted-foreground">
        Configure title templates and search engine indexing defaults for each content type.
      </p>

      {CONTENT_TYPE_CONFIGS.map((config) => {
        const templateValue = (values[config.templateField] as string) ?? config.defaultTemplate;
        const noindexValue = (values[config.noindexField] as boolean) ?? false;
        const preview = previewTemplate(templateValue, {
          siteTitle,
          separator,
          sampleTitle: `Sample ${config.label.replace(/s$/, "")}`,
        });

        return (
          <div key={config.key} className="space-y-2 pb-4 border-b border-border last:border-0">
            <h4 className="text-xs font-semibold text-foreground">{config.label}</h4>

            <div className="space-y-1">
              <Label className="text-[11px] text-muted-foreground">Title Template</Label>
              <TemplateVariableInput
                value={templateValue}
                onChange={(v) => updateValue(config.templateField, v)}
                placeholder={config.defaultTemplate}
                preview={preview}
              />
            </div>

            <div className="flex items-center gap-2">
              <Checkbox
                checked={noindexValue}
                onCheckedChange={(checked) =>
                  updateValue(config.noindexField, !!checked)
                }
              />
              <Label className="cursor-pointer text-xs font-normal">
                Default: Discourage search engines from indexing {config.label.toLowerCase()}
              </Label>
            </div>
          </div>
        );
      })}

      <p
        className={cn(
          "text-xs",
          status === "error" ? "text-destructive" : "text-muted-foreground",
        )}
        aria-live="polite"
      >
        {statusText}
      </p>
    </div>
  );
}
