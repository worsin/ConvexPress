/**
 * FieldSettingsPanel - Expanded settings for a field definition
 *
 * Shows type-specific settings, validation, wrapper options,
 * and conditional logic toggle when a field row is expanded.
 */

import { useCallback, useMemo, useState, useTransition } from "react";
import { useMutation } from "convex/react";
import { toast } from "sonner";

import { api } from "@backend/convex/_generated/api";
import type { Id } from "@backend/convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import { ConditionalLogicBuilder } from "@/components/custom-fields/ConditionalLogicBuilder";
import { FIELD_TYPE_LABELS } from "@/components/custom-fields/FieldTypeSelector";
import { cn, getErrorMessage } from "@/lib/utils";

interface FieldSettingsPanelProps {
  field: {
    _id: string;
    groupId: string;
    label: string;
    name: string;
    key: string;
    type: string;
    instructions?: string;
    required: boolean;
    defaultValue?: string;
    settings: string;
    conditionalLogic?: string;
    wrapperWidth?: string;
    wrapperClass?: string;
    wrapperId?: string;
    menuOrder: number;
    parentFieldId?: string;
  };
  allFields: Array<{
    _id: string;
    label: string;
    name: string;
    key: string;
    type: string;
  }>;
  groupId: string;
}

/** All supported field types for the type selector */
const SUPPORTED_TYPES = [
  "text", "textarea", "number", "range", "email", "url", "password",
  "image", "file", "wysiwyg", "oembed", "gallery",
  "select", "checkbox", "radio", "button_group", "true_false",
  "link", "post_object", "page_link", "relationship", "taxonomy", "user",
  "date_picker", "date_time_picker", "time_picker", "color_picker",
  "message", "accordion", "tab",
  "group", "repeater", "flexible_content",
];

export function FieldSettingsPanel({
  field,
  allFields,
  groupId,
}: FieldSettingsPanelProps) {
  const updateField = useMutation(api.customFields.mutations.updateField);

  // --- Local state ---
  const [label, setLabel] = useState(field.label);
  const [name, setName] = useState(field.name);
  const [type, setType] = useState(field.type);
  const [instructions, setInstructions] = useState(field.instructions ?? "");
  const [required, setRequired] = useState(field.required);
  const [defaultValue, setDefaultValue] = useState(field.defaultValue ?? "");
  const [settings, setSettings] = useState(field.settings);
  const [conditionalLogic, setConditionalLogic] = useState(
    field.conditionalLogic,
  );
  const [wrapperWidth, setWrapperWidth] = useState(field.wrapperWidth ?? "");
  const [wrapperClass, setWrapperClass] = useState(field.wrapperClass ?? "");
  const [wrapperId, setWrapperId] = useState(field.wrapperId ?? "");
  const [showConditional, setShowConditional] = useState(
    !!field.conditionalLogic,
  );

  // useTransition for non-blocking save operations
  const [isSaving, startSaveTransition] = useTransition();

  // No sync-from-props useEffect needed:
  // This component conditionally renders (mounts/unmounts) when the field row
  // is expanded/collapsed, so useState initializers run fresh each time.
  // Removing the sync effect prevents stomping local edits from Convex live updates.

  // Parse settings
  const parsedSettings = useMemo(() => {
    try {
      return JSON.parse(settings);
    } catch {
      return {};
    }
  }, [settings]);

  // --- Save handler ---
  const handleSave = useCallback(() => {
    if (!label.trim()) {
      toast.error("Label is required");
      return;
    }
    startSaveTransition(async () => {
      try {
        await updateField({
          fieldId: field._id as Id<"fieldDefinitions">,
          label: label.trim(),
          name: name.trim() || undefined,
          type,
          instructions: instructions.trim() || undefined,
          required,
          defaultValue: defaultValue || undefined,
          settings,
          conditionalLogic: showConditional ? conditionalLogic : undefined,
          wrapperWidth: wrapperWidth || undefined,
          wrapperClass: wrapperClass || undefined,
          wrapperId: wrapperId || undefined,
        });
        toast.success("Field updated");
      } catch (error: unknown) {
        const message = getErrorMessage(error, "Failed to update field");
        console.error("Failed to update field:", error);
        toast.error(message);
      }
    });
  }, [
    label, name, type, instructions, required, defaultValue,
    settings, conditionalLogic, showConditional,
    wrapperWidth, wrapperClass, wrapperId,
    field._id, updateField,
  ]);

  // --- Update settings helper ---
  const updateSettings = useCallback(
    (key: string, value: unknown) => {
      const current = { ...parsedSettings };
      if (value === undefined || value === "" || value === null) {
        delete current[key];
      } else {
        current[key] = value;
      }
      setSettings(JSON.stringify(current));
    },
    [parsedSettings],
  );

  // Sibling fields for conditional logic (exclude self)
  const siblingFields = useMemo(
    () => allFields.filter((f) => f._id !== field._id),
    [allFields, field._id],
  );

  return (
    <div className="space-y-4">
      {/* Core fields: Label, Name, Type */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div>
          <label className="block text-xs font-medium text-foreground mb-1">
            Field Label
          </label>
          <input
            type="text"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            className="w-full h-8 rounded-none border border-border bg-background px-2 text-xs focus:outline-hidden focus:ring-1 focus:ring-ring"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-foreground mb-1">
            Field Name
          </label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="auto-generated from label"
            className="w-full h-8 rounded-none border border-border bg-background px-2 text-xs focus:outline-hidden focus:ring-1 focus:ring-ring"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-foreground mb-1">
            Field Type
          </label>
          <select
            value={type}
            onChange={(e) => setType(e.target.value)}
            className="w-full h-8 rounded-none border border-border bg-background px-2 text-xs"
          >
            {SUPPORTED_TYPES.map((t) => (
              <option key={t} value={t}>
                {FIELD_TYPE_LABELS[t] ?? t}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Instructions */}
      <div>
        <label className="block text-xs font-medium text-foreground mb-1">
          Instructions
        </label>
        <textarea
          value={instructions}
          onChange={(e) => setInstructions(e.target.value)}
          rows={2}
          placeholder="Help text shown to the user"
          className="w-full rounded-none border border-border bg-background px-2 py-1.5 text-xs focus:outline-hidden focus:ring-1 focus:ring-ring resize-y"
        />
      </div>

      {/* Required + Default Value */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={required}
              onChange={(e) => setRequired(e.target.checked)}
              className="size-3.5"
            />
            <span className="text-xs font-medium text-foreground">
              Required
            </span>
          </label>
        </div>
        <div>
          <label className="block text-xs font-medium text-foreground mb-1">
            Default Value
          </label>
          <input
            type="text"
            value={defaultValue}
            onChange={(e) => setDefaultValue(e.target.value)}
            className="w-full h-8 rounded-none border border-border bg-background px-2 text-xs focus:outline-hidden focus:ring-1 focus:ring-ring"
          />
        </div>
      </div>

      {/* Type-specific settings */}
      <TypeSpecificSettings
        type={type}
        settings={parsedSettings}
        onUpdate={updateSettings}
      />

      {/* Wrapper settings (collapsible) */}
      <details className="border border-border rounded-none">
        <summary className="px-3 py-2 text-xs font-medium text-muted-foreground cursor-pointer hover:text-foreground">
          Wrapper Attributes
        </summary>
        <div className="px-3 py-3 border-t border-border grid grid-cols-1 md:grid-cols-3 gap-3">
          <div>
            <label className="block text-xs text-muted-foreground mb-1">
              Width
            </label>
            <input
              type="text"
              value={wrapperWidth}
              onChange={(e) => setWrapperWidth(e.target.value)}
              placeholder="e.g., 50%"
              className="w-full h-7 rounded-none border border-border bg-background px-2 text-xs focus:outline-hidden focus:ring-1 focus:ring-ring"
            />
          </div>
          <div>
            <label className="block text-xs text-muted-foreground mb-1">
              Class
            </label>
            <input
              type="text"
              value={wrapperClass}
              onChange={(e) => setWrapperClass(e.target.value)}
              className="w-full h-7 rounded-none border border-border bg-background px-2 text-xs focus:outline-hidden focus:ring-1 focus:ring-ring"
            />
          </div>
          <div>
            <label className="block text-xs text-muted-foreground mb-1">
              ID
            </label>
            <input
              type="text"
              value={wrapperId}
              onChange={(e) => setWrapperId(e.target.value)}
              className="w-full h-7 rounded-none border border-border bg-background px-2 text-xs focus:outline-hidden focus:ring-1 focus:ring-ring"
            />
          </div>
        </div>
      </details>

      {/* Conditional Logic (collapsible) */}
      <details className="border border-border rounded-none">
        <summary className="px-3 py-2 text-xs font-medium text-muted-foreground cursor-pointer hover:text-foreground">
          Conditional Logic
        </summary>
        <div className="px-3 py-3 border-t border-border">
          <label className="flex items-center gap-2 mb-3 cursor-pointer">
            <input
              type="checkbox"
              checked={showConditional}
              onChange={(e) => setShowConditional(e.target.checked)}
              className="size-3.5"
            />
            <span className="text-xs text-foreground">
              Enable conditional logic
            </span>
          </label>
          {showConditional && (
            <ConditionalLogicBuilder
              value={conditionalLogic}
              onChange={setConditionalLogic}
              siblingFields={siblingFields}
            />
          )}
        </div>
      </details>

      {/* Field key (read-only) */}
      <div className="text-xs text-muted-foreground">
        Field Key: <code className="px-1 py-0.5 bg-muted">{field.key}</code>
      </div>

      {/* Save button */}
      <div className="flex justify-end">
        <Button size="sm" onClick={handleSave} disabled={isSaving}>
          {isSaving ? "Saving..." : "Update Field"}
        </Button>
      </div>
    </div>
  );
}

// ─── Type-Specific Settings Component ──────────────────────────────────────

interface TypeSpecificSettingsProps {
  type: string;
  settings: Record<string, any>;
  onUpdate: (key: string, value: unknown) => void;
}

function TypeSpecificSettings({
  type,
  settings,
  onUpdate,
}: TypeSpecificSettingsProps) {
  switch (type) {
    case "text":
    case "email":
    case "url":
    case "password":
      return (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div>
            <label className="block text-xs text-muted-foreground mb-1">
              Placeholder
            </label>
            <input
              type="text"
              value={settings.placeholder ?? ""}
              onChange={(e) => onUpdate("placeholder", e.target.value)}
              className="w-full h-7 rounded-none border border-border bg-background px-2 text-xs focus:outline-hidden focus:ring-1 focus:ring-ring"
            />
          </div>
          {type === "text" && (
            <>
              <div>
                <label className="block text-xs text-muted-foreground mb-1">
                  Max Length
                </label>
                <input
                  type="number"
                  value={settings.maxLength ?? ""}
                  onChange={(e) =>
                    onUpdate(
                      "maxLength",
                      e.target.value ? parseInt(e.target.value) : undefined,
                    )
                  }
                  className="w-full h-7 rounded-none border border-border bg-background px-2 text-xs focus:outline-hidden focus:ring-1 focus:ring-ring"
                />
              </div>
              <div>
                <label className="block text-xs text-muted-foreground mb-1">
                  Prepend
                </label>
                <input
                  type="text"
                  value={settings.prepend ?? ""}
                  onChange={(e) => onUpdate("prepend", e.target.value)}
                  className="w-full h-7 rounded-none border border-border bg-background px-2 text-xs focus:outline-hidden focus:ring-1 focus:ring-ring"
                />
              </div>
            </>
          )}
        </div>
      );

    case "textarea":
      return (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div>
            <label className="block text-xs text-muted-foreground mb-1">
              Placeholder
            </label>
            <input
              type="text"
              value={settings.placeholder ?? ""}
              onChange={(e) => onUpdate("placeholder", e.target.value)}
              className="w-full h-7 rounded-none border border-border bg-background px-2 text-xs focus:outline-hidden focus:ring-1 focus:ring-ring"
            />
          </div>
          <div>
            <label className="block text-xs text-muted-foreground mb-1">
              Rows
            </label>
            <input
              type="number"
              value={settings.rows ?? 4}
              onChange={(e) =>
                onUpdate("rows", parseInt(e.target.value) || 4)
              }
              min={1}
              className="w-full h-7 rounded-none border border-border bg-background px-2 text-xs focus:outline-hidden focus:ring-1 focus:ring-ring"
            />
          </div>
          <div>
            <label className="block text-xs text-muted-foreground mb-1">
              Max Length
            </label>
            <input
              type="number"
              value={settings.maxLength ?? ""}
              onChange={(e) =>
                onUpdate(
                  "maxLength",
                  e.target.value ? parseInt(e.target.value) : undefined,
                )
              }
              className="w-full h-7 rounded-none border border-border bg-background px-2 text-xs focus:outline-hidden focus:ring-1 focus:ring-ring"
            />
          </div>
        </div>
      );

    case "number":
      return (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <div>
            <label className="block text-xs text-muted-foreground mb-1">
              Placeholder
            </label>
            <input
              type="text"
              value={settings.placeholder ?? ""}
              onChange={(e) => onUpdate("placeholder", e.target.value)}
              className="w-full h-7 rounded-none border border-border bg-background px-2 text-xs focus:outline-hidden focus:ring-1 focus:ring-ring"
            />
          </div>
          <div>
            <label className="block text-xs text-muted-foreground mb-1">
              Min
            </label>
            <input
              type="number"
              value={settings.min ?? ""}
              onChange={(e) =>
                onUpdate("min", e.target.value ? parseFloat(e.target.value) : undefined)
              }
              className="w-full h-7 rounded-none border border-border bg-background px-2 text-xs focus:outline-hidden focus:ring-1 focus:ring-ring"
            />
          </div>
          <div>
            <label className="block text-xs text-muted-foreground mb-1">
              Max
            </label>
            <input
              type="number"
              value={settings.max ?? ""}
              onChange={(e) =>
                onUpdate("max", e.target.value ? parseFloat(e.target.value) : undefined)
              }
              className="w-full h-7 rounded-none border border-border bg-background px-2 text-xs focus:outline-hidden focus:ring-1 focus:ring-ring"
            />
          </div>
          <div>
            <label className="block text-xs text-muted-foreground mb-1">
              Step
            </label>
            <input
              type="number"
              value={settings.step ?? ""}
              onChange={(e) =>
                onUpdate("step", e.target.value ? parseFloat(e.target.value) : undefined)
              }
              className="w-full h-7 rounded-none border border-border bg-background px-2 text-xs focus:outline-hidden focus:ring-1 focus:ring-ring"
            />
          </div>
        </div>
      );

    case "range":
      return (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div>
            <label className="block text-xs text-muted-foreground mb-1">Min</label>
            <input
              type="number"
              value={settings.min ?? 0}
              onChange={(e) => onUpdate("min", parseFloat(e.target.value) || 0)}
              className="w-full h-7 rounded-none border border-border bg-background px-2 text-xs focus:outline-hidden focus:ring-1 focus:ring-ring"
            />
          </div>
          <div>
            <label className="block text-xs text-muted-foreground mb-1">Max</label>
            <input
              type="number"
              value={settings.max ?? 100}
              onChange={(e) => onUpdate("max", parseFloat(e.target.value) || 100)}
              className="w-full h-7 rounded-none border border-border bg-background px-2 text-xs focus:outline-hidden focus:ring-1 focus:ring-ring"
            />
          </div>
          <div>
            <label className="block text-xs text-muted-foreground mb-1">Step</label>
            <input
              type="number"
              value={settings.step ?? 1}
              onChange={(e) => onUpdate("step", parseFloat(e.target.value) || 1)}
              className="w-full h-7 rounded-none border border-border bg-background px-2 text-xs focus:outline-hidden focus:ring-1 focus:ring-ring"
            />
          </div>
        </div>
      );

    case "select":
    case "checkbox":
    case "radio":
    case "button_group":
      return (
        <div className="space-y-3">
          <div>
            <label className="block text-xs text-muted-foreground mb-1">
              Choices (one per line, format: value : label)
            </label>
            <textarea
              value={
                (settings.choices ?? [])
                  .map((c) =>
                    c.label !== c.value ? `${c.value} : ${c.label}` : c.value,
                  )
                  .join("\n") ?? ""
              }
              onChange={(e) => {
                const choices = e.target.value
                  .split("\n")
                  .filter((l) => l.trim())
                  .map((line) => {
                    const parts = line.split(":").map((p) => p.trim());
                    return {
                      value: parts[0] ?? "",
                      label: parts[1] ?? parts[0] ?? "",
                    };
                  });
                onUpdate("choices", choices);
              }}
              rows={5}
              placeholder="option1 : Option 1&#10;option2 : Option 2"
              className="w-full rounded-none border border-border bg-background px-2 py-1.5 text-xs font-mono focus:outline-hidden focus:ring-1 focus:ring-ring resize-y"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            {type === "select" && (
              <>
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={settings.multiple ?? false}
                    onChange={(e) => onUpdate("multiple", e.target.checked)}
                    className="size-3.5"
                  />
                  <span className="text-xs text-foreground">Allow multiple</span>
                </label>
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={settings.allowNull ?? false}
                    onChange={(e) => onUpdate("allowNull", e.target.checked)}
                    className="size-3.5"
                  />
                  <span className="text-xs text-foreground">Allow null</span>
                </label>
              </>
            )}
            {(type === "checkbox" || type === "radio" || type === "button_group") && (
              <div>
                <label className="block text-xs text-muted-foreground mb-1">
                  Layout
                </label>
                <select
                  value={settings.layout ?? "vertical"}
                  onChange={(e) => onUpdate("layout", e.target.value)}
                  className="w-full h-7 rounded-none border border-border bg-background px-2 text-xs"
                >
                  <option value="vertical">Vertical</option>
                  <option value="horizontal">Horizontal</option>
                </select>
              </div>
            )}
          </div>
        </div>
      );

    case "true_false":
      return (
        <div>
          <label className="block text-xs text-muted-foreground mb-1">
            Message
          </label>
          <input
            type="text"
            value={settings.message ?? ""}
            onChange={(e) => onUpdate("message", e.target.value)}
            placeholder="Displayed next to the toggle"
            className="w-full h-7 rounded-none border border-border bg-background px-2 text-xs focus:outline-hidden focus:ring-1 focus:ring-ring"
          />
        </div>
      );

    case "image":
    case "file":
      return (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs text-muted-foreground mb-1">
              Return Format
            </label>
            <select
              value={settings.returnFormat ?? "id"}
              onChange={(e) => onUpdate("returnFormat", e.target.value)}
              className="w-full h-7 rounded-none border border-border bg-background px-2 text-xs"
            >
              <option value="id">ID</option>
              <option value="url">URL</option>
              <option value="object">Object</option>
            </select>
          </div>
          <div>
            <label className="block text-xs text-muted-foreground mb-1">
              Library
            </label>
            <select
              value={settings.library ?? "all"}
              onChange={(e) => onUpdate("library", e.target.value)}
              className="w-full h-7 rounded-none border border-border bg-background px-2 text-xs"
            >
              <option value="all">All</option>
              <option value="uploadedTo">Uploaded to this post</option>
            </select>
          </div>
        </div>
      );

    case "gallery":
      return (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div>
            <label className="block text-xs text-muted-foreground mb-1">
              Return Format
            </label>
            <select
              value={settings.returnFormat ?? "id"}
              onChange={(e) => onUpdate("returnFormat", e.target.value)}
              className="w-full h-7 rounded-none border border-border bg-background px-2 text-xs"
            >
              <option value="id">ID</option>
              <option value="url">URL</option>
              <option value="object">Object</option>
            </select>
          </div>
          <div>
            <label className="block text-xs text-muted-foreground mb-1">Min Images</label>
            <input
              type="number"
              value={settings.minImages ?? ""}
              onChange={(e) =>
                onUpdate("minImages", e.target.value ? parseInt(e.target.value) : undefined)
              }
              min={0}
              className="w-full h-7 rounded-none border border-border bg-background px-2 text-xs focus:outline-hidden focus:ring-1 focus:ring-ring"
            />
          </div>
          <div>
            <label className="block text-xs text-muted-foreground mb-1">Max Images</label>
            <input
              type="number"
              value={settings.maxImages ?? ""}
              onChange={(e) =>
                onUpdate("maxImages", e.target.value ? parseInt(e.target.value) : undefined)
              }
              min={0}
              className="w-full h-7 rounded-none border border-border bg-background px-2 text-xs focus:outline-hidden focus:ring-1 focus:ring-ring"
            />
          </div>
        </div>
      );

    case "wysiwyg":
      return (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs text-muted-foreground mb-1">Toolbar</label>
            <select
              value={settings.toolbar ?? "full"}
              onChange={(e) => onUpdate("toolbar", e.target.value)}
              className="w-full h-7 rounded-none border border-border bg-background px-2 text-xs"
            >
              <option value="full">Full</option>
              <option value="basic">Basic</option>
            </select>
          </div>
          <div>
            <label className="flex items-center gap-2 mt-4">
              <input
                type="checkbox"
                checked={settings.mediaUpload ?? true}
                onChange={(e) => onUpdate("mediaUpload", e.target.checked)}
                className="size-3.5"
              />
              <span className="text-xs text-foreground">Allow media upload</span>
            </label>
          </div>
        </div>
      );

    case "repeater":
      return (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div>
            <label className="block text-xs text-muted-foreground mb-1">Layout</label>
            <select
              value={settings.layout ?? "table"}
              onChange={(e) => onUpdate("layout", e.target.value)}
              className="w-full h-7 rounded-none border border-border bg-background px-2 text-xs"
            >
              <option value="table">Table</option>
              <option value="block">Block</option>
              <option value="row">Row</option>
            </select>
          </div>
          <div>
            <label className="block text-xs text-muted-foreground mb-1">Min Rows</label>
            <input
              type="number"
              value={settings.minRows ?? ""}
              onChange={(e) =>
                onUpdate("minRows", e.target.value ? parseInt(e.target.value) : undefined)
              }
              min={0}
              className="w-full h-7 rounded-none border border-border bg-background px-2 text-xs focus:outline-hidden focus:ring-1 focus:ring-ring"
            />
          </div>
          <div>
            <label className="block text-xs text-muted-foreground mb-1">Max Rows</label>
            <input
              type="number"
              value={settings.maxRows ?? ""}
              onChange={(e) =>
                onUpdate("maxRows", e.target.value ? parseInt(e.target.value) : undefined)
              }
              min={0}
              className="w-full h-7 rounded-none border border-border bg-background px-2 text-xs focus:outline-hidden focus:ring-1 focus:ring-ring"
            />
          </div>
        </div>
      );

    case "group":
      return (
        <div>
          <label className="block text-xs text-muted-foreground mb-1">Layout</label>
          <select
            value={settings.layout ?? "block"}
            onChange={(e) => onUpdate("layout", e.target.value)}
            className="w-full h-7 rounded-none border border-border bg-background px-2 text-xs"
          >
            <option value="block">Block</option>
            <option value="table">Table</option>
            <option value="row">Row</option>
          </select>
        </div>
      );

    case "message":
      return (
        <div>
          <label className="block text-xs text-muted-foreground mb-1">
            Message Content
          </label>
          <textarea
            value={settings.message ?? ""}
            onChange={(e) => onUpdate("message", e.target.value)}
            rows={4}
            className="w-full rounded-none border border-border bg-background px-2 py-1.5 text-xs focus:outline-hidden focus:ring-1 focus:ring-ring resize-y"
          />
        </div>
      );

    case "tab":
      return (
        <div>
          <label className="block text-xs text-muted-foreground mb-1">Placement</label>
          <select
            value={settings.placement ?? "top"}
            onChange={(e) => onUpdate("placement", e.target.value)}
            className="w-full h-7 rounded-none border border-border bg-background px-2 text-xs"
          >
            <option value="top">Top</option>
            <option value="left">Left</option>
          </select>
        </div>
      );

    case "color_picker":
      return (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={settings.enableOpacity ?? false}
              onChange={(e) => onUpdate("enableOpacity", e.target.checked)}
              className="size-3.5"
            />
            <span className="text-xs text-foreground">Enable opacity</span>
          </label>
          <div>
            <label className="block text-xs text-muted-foreground mb-1">Default Color</label>
            <input
              type="text"
              value={settings.defaultColor ?? ""}
              onChange={(e) => onUpdate("defaultColor", e.target.value)}
              placeholder="#000000"
              className="w-full h-7 rounded-none border border-border bg-background px-2 text-xs focus:outline-hidden focus:ring-1 focus:ring-ring"
            />
          </div>
        </div>
      );

    case "date_picker":
    case "date_time_picker":
    case "time_picker":
      return (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs text-muted-foreground mb-1">
              Display Format
            </label>
            <input
              type="text"
              value={settings.displayFormat ?? ""}
              onChange={(e) => onUpdate("displayFormat", e.target.value)}
              placeholder={type === "time_picker" ? "HH:mm" : "YYYY-MM-DD"}
              className="w-full h-7 rounded-none border border-border bg-background px-2 text-xs focus:outline-hidden focus:ring-1 focus:ring-ring"
            />
          </div>
          <div>
            <label className="block text-xs text-muted-foreground mb-1">
              Return Format
            </label>
            <input
              type="text"
              value={settings.returnFormat ?? ""}
              onChange={(e) => onUpdate("returnFormat", e.target.value)}
              placeholder={type === "time_picker" ? "HH:mm:ss" : "YYYY-MM-DD"}
              className="w-full h-7 rounded-none border border-border bg-background px-2 text-xs focus:outline-hidden focus:ring-1 focus:ring-ring"
            />
          </div>
        </div>
      );

    case "post_object":
    case "page_link":
    case "relationship":
      return (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs text-muted-foreground mb-1">
              Post Types (comma-separated)
            </label>
            <input
              type="text"
              value={(settings.postType ?? []).join(", ")}
              onChange={(e) =>
                onUpdate(
                  "postType",
                  e.target.value.split(",").map((s) => s.trim()).filter(Boolean),
                )
              }
              placeholder="post, page"
              className="w-full h-7 rounded-none border border-border bg-background px-2 text-xs focus:outline-hidden focus:ring-1 focus:ring-ring"
            />
          </div>
          {(type === "post_object" || type === "relationship") && (
            <div>
              <label className="block text-xs text-muted-foreground mb-1">
                Return Format
              </label>
              <select
                value={settings.returnFormat ?? "id"}
                onChange={(e) => onUpdate("returnFormat", e.target.value)}
                className="w-full h-7 rounded-none border border-border bg-background px-2 text-xs"
              >
                <option value="id">ID</option>
                <option value="object">Object</option>
              </select>
            </div>
          )}
        </div>
      );

    case "taxonomy":
      return (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs text-muted-foreground mb-1">
              Taxonomy
            </label>
            <input
              type="text"
              value={settings.taxonomy ?? ""}
              onChange={(e) => onUpdate("taxonomy", e.target.value)}
              placeholder="category"
              className="w-full h-7 rounded-none border border-border bg-background px-2 text-xs focus:outline-hidden focus:ring-1 focus:ring-ring"
            />
          </div>
          <div>
            <label className="block text-xs text-muted-foreground mb-1">
              Field Type
            </label>
            <select
              value={settings.fieldType ?? "checkbox"}
              onChange={(e) => onUpdate("fieldType", e.target.value)}
              className="w-full h-7 rounded-none border border-border bg-background px-2 text-xs"
            >
              <option value="checkbox">Checkbox</option>
              <option value="select">Select</option>
              <option value="multi_select">Multi Select</option>
              <option value="radio">Radio</option>
            </select>
          </div>
        </div>
      );

    case "user":
      return (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs text-muted-foreground mb-1">
              Roles (comma-separated)
            </label>
            <input
              type="text"
              value={(settings.role ?? []).join(", ")}
              onChange={(e) =>
                onUpdate(
                  "role",
                  e.target.value.split(",").map((s) => s.trim()).filter(Boolean),
                )
              }
              placeholder="administrator, editor"
              className="w-full h-7 rounded-none border border-border bg-background px-2 text-xs focus:outline-hidden focus:ring-1 focus:ring-ring"
            />
          </div>
          <div>
            <label className="flex items-center gap-2 mt-4">
              <input
                type="checkbox"
                checked={settings.multiple ?? false}
                onChange={(e) => onUpdate("multiple", e.target.checked)}
                className="size-3.5"
              />
              <span className="text-xs text-foreground">Allow multiple</span>
            </label>
          </div>
        </div>
      );

    case "oembed":
      return (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs text-muted-foreground mb-1">Width</label>
            <input
              type="number"
              value={settings.width ?? ""}
              onChange={(e) =>
                onUpdate("width", e.target.value ? parseInt(e.target.value) : undefined)
              }
              className="w-full h-7 rounded-none border border-border bg-background px-2 text-xs focus:outline-hidden focus:ring-1 focus:ring-ring"
            />
          </div>
          <div>
            <label className="block text-xs text-muted-foreground mb-1">Height</label>
            <input
              type="number"
              value={settings.height ?? ""}
              onChange={(e) =>
                onUpdate("height", e.target.value ? parseInt(e.target.value) : undefined)
              }
              className="w-full h-7 rounded-none border border-border bg-background px-2 text-xs focus:outline-hidden focus:ring-1 focus:ring-ring"
            />
          </div>
        </div>
      );

    case "link":
      return (
        <div className="text-xs text-muted-foreground">
          Link fields store URL, title, and target. No additional settings needed.
        </div>
      );

    case "accordion":
      return (
        <div>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={settings.open ?? false}
              onChange={(e) => onUpdate("open", e.target.checked)}
              className="size-3.5"
            />
            <span className="text-xs text-foreground">Open by default</span>
          </label>
        </div>
      );

    case "flexible_content":
      return (
        <div className="text-xs text-muted-foreground">
          Flexible content layouts are configured through sub-fields. Add sub-fields to define each layout.
        </div>
      );

    default:
      return (
        <div className="text-xs text-muted-foreground">
          No additional settings for this field type.
        </div>
      );
  }
}
