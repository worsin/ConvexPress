import { useState, useCallback, useRef } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useMutation } from "convex/react";
import { api } from "@backend/convex/_generated/api";
import {
  Save,
  Copy,
  BookTemplate,
  ChevronDown,
  ArrowLeft,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SECTION_DEFINITIONS, DEFAULT_LAYOUT_CONFIG, CONTENT_WIDTH_OPTIONS } from "./constants";
import { PRESET_CONFIGS } from "./presets";
import { SectionControl } from "./SectionControl";
import { VariantPicker } from "./VariantPicker";
import { LayoutPreview } from "./LayoutPreview";
import type { LayoutConfig, SectionConfig, ContentWidth } from "./types";

function slugify(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-");
}

interface LayoutComposerProps {
  initialConfig?: LayoutConfig;
  initialName?: string;
  initialDescription?: string;
  layoutId?: string;
  layoutType?: "preset" | "custom" | "ai";
}

export function LayoutComposer({
  initialConfig,
  initialName = "",
  initialDescription = "",
  layoutId,
  layoutType,
}: LayoutComposerProps) {
  const navigate = useNavigate();
  const [config, setConfig] = useState<LayoutConfig>(
    initialConfig ?? DEFAULT_LAYOUT_CONFIG
  );
  const [name, setName] = useState(initialName);
  const [description, setDescription] = useState(initialDescription);
  const [deviceWidth, setDeviceWidth] = useState<"desktop" | "tablet" | "mobile">("desktop");
  const [presetOpen, setPresetOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const presetRef = useRef<HTMLDivElement>(null);

  const createLayout = useMutation(api.layouts.mutations.create);
  const updateLayout = useMutation(api.layouts.mutations.update);

  const isEditing = !!layoutId;

  // ---- Config update helpers ----

  const updateSection = useCallback(
    (type: string, updates: Partial<SectionConfig>) => {
      setConfig((prev) => ({
        ...prev,
        sections: prev.sections.map((s) =>
          s.type === type ? { ...s, ...updates } : s
        ),
      }));
    },
    []
  );

  const updateSectionOption = useCallback(
    (type: string, optionId: string, value: unknown) => {
      setConfig((prev) => ({
        ...prev,
        sections: prev.sections.map((s) =>
          s.type === type
            ? { ...s, options: { ...s.options, [optionId]: value } }
            : s
        ),
      }));
    },
    []
  );

  const setContentWidth = useCallback((width: ContentWidth) => {
    setConfig((prev) => ({ ...prev, contentWidth: width }));
  }, []);

  const loadPreset = useCallback((presetKey: string) => {
    const preset = PRESET_CONFIGS[presetKey];
    if (!preset) return;
    setConfig(preset.config);
    if (!name) setName(preset.name);
    if (!description) setDescription(preset.description);
    setPresetOpen(false);
    toast.success(`Loaded "${preset.name}" preset`);
  }, [name, description]);

  // ---- Save ----

  const handleSave = async () => {
    if (!name.trim()) {
      toast.error("Please enter a layout name");
      return;
    }

    setSaving(true);
    try {
      if (isEditing) {
        await updateLayout({
          id: layoutId as any,
          name: name.trim(),
          slug: slugify(name),
          description: description.trim() || undefined,
          config,
        });
        toast.success("Layout updated");
      } else {
        const id = await createLayout({
          name: name.trim(),
          slug: slugify(name),
          description: description.trim() || undefined,
          type: "custom",
          config,
        });
        toast.success("Layout created");
        navigate({ to: "/layouts/$layoutId", params: { layoutId: id as string } });
      }
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to save layout"
      );
    } finally {
      setSaving(false);
    }
  };

  const handleDuplicate = async () => {
    if (!name.trim()) {
      toast.error("Please enter a layout name");
      return;
    }

    setSaving(true);
    try {
      const id = await createLayout({
        name: `${name.trim()} (Copy)`,
        slug: slugify(`${name} copy`),
        description: description.trim() || undefined,
        type: "custom",
        config,
      });
      toast.success("Layout duplicated");
      navigate({ to: "/layouts/$layoutId", params: { layoutId: id as string } });
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to duplicate layout"
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex flex-col h-full">
      {/* Top bar */}
      <div className="flex items-center gap-3 border-b border-border px-4 py-3">
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={() => navigate({ to: "/layouts" })}
        >
          <ArrowLeft className="size-4" />
        </Button>
        <h1 className="text-base font-semibold text-foreground">
          {isEditing ? "Edit Layout" : "New Layout"}
        </h1>
        {layoutType && (
          <span
            className={cn(
              "rounded-full px-2 py-0.5 text-[10px] font-medium",
              layoutType === "preset"
                ? "bg-primary/15 text-primary"
                : layoutType === "ai"
                  ? "bg-amber-500/15 text-amber-400"
                  : "bg-emerald-500/15 text-emerald-400"
            )}
          >
            {layoutType === "ai" ? "AI Generated" : layoutType === "preset" ? "Preset" : "Custom"}
          </span>
        )}
      </div>

      {/* Main area: sidebar + preview */}
      <div className="flex flex-1 min-h-0">
        {/* Left sidebar - controls */}
        <div className="w-[340px] shrink-0 border-r border-border flex flex-col">
          <div className="flex-1 overflow-y-auto p-3 space-y-3">
            {/* Header with preset selector */}
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-foreground">Sections</h2>
              <div className="relative" ref={presetRef}>
                <Button
                  variant="outline"
                  size="xs"
                  onClick={() => setPresetOpen(!presetOpen)}
                >
                  <BookTemplate className="size-3" data-icon="inline-start" />
                  Start from Preset
                  <ChevronDown className="size-3" data-icon="inline-end" />
                </Button>

                {presetOpen && (
                  <div className="absolute right-0 top-full z-50 mt-1 w-56 rounded-xl border border-border bg-popover shadow-lg">
                    <div className="p-1">
                      {Object.entries(PRESET_CONFIGS).map(([key, preset]) => (
                        <button
                          key={key}
                          type="button"
                          onClick={() => loadPreset(key)}
                          className="flex w-full flex-col items-start rounded-lg px-3 py-2 text-left hover:bg-muted/50 transition-colors"
                        >
                          <span className="text-sm font-medium text-foreground">
                            {preset.name}
                          </span>
                          <span className="text-[10px] text-muted-foreground line-clamp-1">
                            {preset.description}
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Content Width */}
            <SectionControl
              label="Content Width"
              hint="Maximum width of the content area"
              enabled={true}
              onToggle={() => {}}
              canDisable={false}
              defaultExpanded={true}
            >
              <VariantPicker
                variants={CONTENT_WIDTH_OPTIONS.map((o) => ({
                  id: o.value,
                  label: o.label,
                }))}
                selected={config.contentWidth}
                onChange={(id) => setContentWidth(id as ContentWidth)}
              />
            </SectionControl>

            {/* Section controls */}
            {SECTION_DEFINITIONS.map((sectionDef) => {
              const sectionCfg = config.sections.find(
                (s) => s.type === sectionDef.type
              );
              if (!sectionCfg) return null;

              return (
                <SectionControl
                  key={sectionDef.type}
                  label={sectionDef.label}
                  hint={sectionDef.hint}
                  enabled={sectionCfg.enabled}
                  onToggle={(enabled) =>
                    updateSection(sectionDef.type, { enabled })
                  }
                  canDisable={!sectionDef.alwaysOn}
                >
                  {/* Variant picker */}
                  {sectionDef.variants && sectionDef.variants.length > 0 && (
                    <div>
                      <Label className="text-xs text-muted-foreground mb-1.5">
                        Variant
                      </Label>
                      <VariantPicker
                        variants={sectionDef.variants}
                        selected={sectionCfg.variant || sectionDef.variants[0].id}
                        onChange={(id) =>
                          updateSection(sectionDef.type, { variant: id })
                        }
                        columns={sectionDef.variants.length > 4 ? 3 : 2}
                      />
                    </div>
                  )}

                  {/* Options */}
                  {sectionDef.options?.map((optDef) => {
                    // Filter by appliesTo if specified
                    if (
                      optDef.appliesTo &&
                      !optDef.appliesTo.includes(sectionCfg.variant || "")
                    ) {
                      return null;
                    }

                    const currentValue =
                      sectionCfg.options?.[optDef.id] ?? optDef.defaultValue;

                    if (optDef.type === "toggle") {
                      return (
                        <div
                          key={optDef.id}
                          className="flex items-center justify-between"
                        >
                          <Label className="text-xs text-muted-foreground">
                            {optDef.label}
                          </Label>
                          <button
                            type="button"
                            role="switch"
                            aria-checked={!!currentValue}
                            onClick={() =>
                              updateSectionOption(
                                sectionDef.type,
                                optDef.id,
                                !currentValue
                              )
                            }
                            className={cn(
                              "relative inline-flex h-4 w-7 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors",
                              currentValue ? "bg-primary" : "bg-muted"
                            )}
                          >
                            <span
                              className={cn(
                                "pointer-events-none inline-block h-3 w-3 rounded-full bg-white shadow-sm transition-transform",
                                currentValue
                                  ? "translate-x-3"
                                  : "translate-x-0"
                              )}
                            />
                          </button>
                        </div>
                      );
                    }

                    if (optDef.type === "select" && optDef.values) {
                      return (
                        <div key={optDef.id}>
                          <Label className="text-xs text-muted-foreground mb-1">
                            {optDef.label}
                          </Label>
                          <select
                            value={currentValue as string}
                            onChange={(e) =>
                              updateSectionOption(
                                sectionDef.type,
                                optDef.id,
                                e.target.value
                              )
                            }
                            className="w-full rounded-lg border border-border bg-input/30 px-2.5 py-1.5 text-xs text-foreground outline-none focus:border-primary transition-colors"
                          >
                            {optDef.values.map((v) => (
                              <option key={v.value} value={v.value}>
                                {v.label}
                              </option>
                            ))}
                          </select>
                        </div>
                      );
                    }

                    if (optDef.type === "number") {
                      return (
                        <div key={optDef.id}>
                          <Label className="text-xs text-muted-foreground mb-1">
                            {optDef.label}
                          </Label>
                          <Input
                            type="number"
                            value={currentValue as number}
                            onChange={(e) =>
                              updateSectionOption(
                                sectionDef.type,
                                optDef.id,
                                Number(e.target.value)
                              )
                            }
                            className="h-7 text-xs"
                          />
                        </div>
                      );
                    }

                    if (optDef.type === "text") {
                      return (
                        <div key={optDef.id}>
                          <Label className="text-xs text-muted-foreground mb-1">
                            {optDef.label}
                          </Label>
                          <Input
                            value={currentValue as string}
                            onChange={(e) =>
                              updateSectionOption(
                                sectionDef.type,
                                optDef.id,
                                e.target.value
                              )
                            }
                            className="h-7 text-xs"
                          />
                        </div>
                      );
                    }

                    return null;
                  })}
                </SectionControl>
              );
            })}
          </div>

          {/* Save bar */}
          <div className="border-t border-border p-3 space-y-2 bg-card">
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Name</Label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Layout name..."
                className="h-8 text-sm"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">
                Description
              </Label>
              <Input
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Optional description..."
                className="h-8 text-sm"
              />
            </div>
            <div className="flex gap-2">
              {isEditing && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleDuplicate}
                  disabled={saving}
                  className="flex-1"
                >
                  <Copy className="size-3.5" data-icon="inline-start" />
                  Duplicate
                </Button>
              )}
              <Button
                size="sm"
                onClick={handleSave}
                disabled={saving}
                className="flex-1"
              >
                <Save className="size-3.5" data-icon="inline-start" />
                {saving ? "Saving..." : "Save Layout"}
              </Button>
            </div>
          </div>
        </div>

        {/* Right panel - preview */}
        <div className="flex-1 min-w-0">
          <LayoutPreview
            config={config}
            deviceWidth={deviceWidth}
            onDeviceChange={setDeviceWidth}
          />
        </div>
      </div>
    </div>
  );
}
