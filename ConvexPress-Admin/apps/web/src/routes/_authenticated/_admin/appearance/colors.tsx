/**
 * Website Colors Page
 *
 * Settings-style page for managing the website's color palette.
 * Reads/writes the active theme's globalStyles.settings.color.palette
 * via theme queries/mutations.
 *
 * Colors map to shadcn CSS variables used across the website frontend.
 */

import { useState, useCallback, useRef, useEffect } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation } from "convex/react";
import { useQuery } from "convex-helpers/react/cache";
import { api } from "@backend/convex/_generated/api";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

import { SettingsSection } from "@/components/settings/SettingsSection";
import { SettingsField } from "@/components/settings/SettingsField";

export const Route = createFileRoute(
  "/_authenticated/_admin/appearance/colors",
)({
  component: WebsiteColorsPage,
});

// ─── Color Definitions ───────────────────────────────────────────────────────

interface ColorDef {
  slug: string;
  label: string;
  description: string;
}

const BRAND_COLORS: ColorDef[] = [
  { slug: "primary", label: "Primary", description: "Primary brand color (buttons, links)" },
  { slug: "primary-foreground", label: "Primary Foreground", description: "Text on primary backgrounds" },
  { slug: "secondary", label: "Secondary", description: "Secondary elements" },
  { slug: "secondary-foreground", label: "Secondary Foreground", description: "Text on secondary backgrounds" },
  { slug: "accent", label: "Accent", description: "Accent highlights (hover states)" },
  { slug: "accent-foreground", label: "Accent Foreground", description: "Text on accent backgrounds" },
  { slug: "destructive", label: "Destructive", description: "Error/delete actions" },
  { slug: "destructive-foreground", label: "Destructive Foreground", description: "Text on destructive backgrounds" },
];

const SURFACE_COLORS: ColorDef[] = [
  { slug: "background", label: "Background", description: "Page background color" },
  { slug: "card", label: "Card", description: "Card/panel backgrounds" },
  { slug: "card-foreground", label: "Card Foreground", description: "Text inside cards" },
  { slug: "muted", label: "Muted", description: "Muted backgrounds" },
];

const TEXT_COLORS: ColorDef[] = [
  { slug: "foreground", label: "Foreground", description: "Default text color" },
  { slug: "muted-foreground", label: "Muted Foreground", description: "De-emphasized text" },
];

const UI_ELEMENT_COLORS: ColorDef[] = [
  { slug: "border", label: "Border", description: "Default border color" },
  { slug: "input", label: "Input", description: "Form input borders" },
  { slug: "ring", label: "Ring", description: "Focus ring color" },
];

const ALL_COLOR_DEFS = [
  ...BRAND_COLORS,
  ...SURFACE_COLORS,
  ...TEXT_COLORS,
  ...UI_ELEMENT_COLORS,
];

// Default colors (shadcn dark theme defaults)
const DEFAULT_COLORS: Record<string, string> = {
  background: "#09090b",
  foreground: "#fafafa",
  primary: "#fafafa",
  "primary-foreground": "#18181b",
  secondary: "#27272a",
  "secondary-foreground": "#fafafa",
  muted: "#27272a",
  "muted-foreground": "#a1a1aa",
  accent: "#27272a",
  "accent-foreground": "#fafafa",
  card: "#09090b",
  "card-foreground": "#fafafa",
  border: "#27272a",
  input: "#27272a",
  ring: "#d4d4d8",
  destructive: "#7f1d1d",
  "destructive-foreground": "#fafafa",
};

// ─── Types ───────────────────────────────────────────────────────────────────

interface PaletteEntry {
  slug: string;
  name: string;
  color: string;
}

/** Nested structure for theme globalStyles */
interface GlobalStylesWithPalette {
  settings?: {
    color?: {
      palette?: PaletteEntry[];
    };
  };
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function getColorFromPalette(palette: PaletteEntry[], slug: string): string {
  const entry = palette.find((p) => p.slug === slug);
  return entry?.color ?? DEFAULT_COLORS[slug] ?? "#000000";
}

function updatePaletteEntry(
  palette: PaletteEntry[],
  slug: string,
  color: string,
  label: string,
): PaletteEntry[] {
  const existing = palette.findIndex((p) => p.slug === slug);
  if (existing >= 0) {
    const updated = [...palette];
    updated[existing] = { ...updated[existing], color };
    return updated;
  }
  return [...palette, { slug, name: label, color }];
}

// ─── Color Input Component ───────────────────────────────────────────────────

function ColorInput({
  value,
  onChange,
}: {
  value: string;
  onChange: (color: string) => void;
}) {
  const [localValue, setLocalValue] = useState(value);

  useEffect(() => {
    setLocalValue(value);
  }, [value]);

  return (
    <div className="flex items-center gap-2">
      <input
        type="color"
        value={value}
        onChange={(e) => {
          setLocalValue(e.target.value);
          onChange(e.target.value);
        }}
        className="h-8 w-8 border border-input cursor-pointer shrink-0"
      />
      <input
        type="text"
        value={localValue}
        onChange={(e) => {
          setLocalValue(e.target.value);
          // Only propagate valid hex values
          if (/^#[0-9a-fA-F]{6}$/.test(e.target.value)) {
            onChange(e.target.value);
          }
        }}
        onBlur={() => {
          // On blur, reset to current value if invalid
          if (!/^#[0-9a-fA-F]{6}$/.test(localValue)) {
            setLocalValue(value);
          }
        }}
        className="dark:bg-input/30 border-input h-8 border bg-transparent px-2.5 text-xs w-28 outline-hidden focus:border-ring font-mono"
        placeholder="#000000"
        maxLength={7}
      />
      <div
        className="h-8 w-16 border border-border"
        style={{ backgroundColor: value }}
        title={`Preview: ${value}`}
      />
    </div>
  );
}

// ─── Page Component ──────────────────────────────────────────────────────────

function WebsiteColorsPage() {
  const activeTheme = useQuery(api.themes.queries.getActive);
  const updateGlobalStyles = useMutation(api.themes.mutations.updateGlobalStyles);

  const [isSaving, setIsSaving] = useState(false);
  const [lastSaved, setLastSaved] = useState<number | null>(null);
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Extract palette from active theme
  const palette: PaletteEntry[] =
    (activeTheme?.globalStyles as GlobalStylesWithPalette)?.settings?.color?.palette ?? [];

  // Debounced save function
  const savePalette = useCallback(
    (newPalette: PaletteEntry[]) => {
      if (!activeTheme?._id) return;

      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }

      saveTimeoutRef.current = setTimeout(async () => {
        setIsSaving(true);
        try {
          await updateGlobalStyles({
            themeId: activeTheme._id,
            globalStyles: {
              settings: {
                color: {
                  palette: newPalette,
                },
              },
            } as GlobalStylesWithPalette,
          });
          setLastSaved(Date.now());
        } catch (err: unknown) {
          toast.error((err as { data?: { message?: string }; message?: string })?.data?.message ?? "Failed to save colors");
        } finally {
          setIsSaving(false);
        }
      }, 600);
    },
    [activeTheme?._id, updateGlobalStyles],
  );

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, []);

  const handleColorChange = useCallback(
    (slug: string, label: string, color: string) => {
      const newPalette = updatePaletteEntry(palette, slug, color, label);
      savePalette(newPalette);
    },
    [palette, savePalette],
  );

  // Loading state
  if (activeTheme === undefined) {
    return (
      <div className="flex flex-col gap-6 pb-8">
        <div>
          <h1 className="text-xl font-semibold text-foreground">Website Colors</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Manage your website's color palette.
          </p>
        </div>
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      </div>
    );
  }

  // No active theme
  if (activeTheme === null) {
    return (
      <div className="flex flex-col gap-6 pb-8">
        <div>
          <h1 className="text-xl font-semibold text-foreground">Website Colors</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Manage your website's color palette.
          </p>
        </div>
        <div className="border border-border bg-card p-6 text-center">
          <p className="text-sm text-muted-foreground">
            No active theme found. Create and activate a theme first.
          </p>
        </div>
      </div>
    );
  }

  // Render color section helper
  function renderColorSection(
    title: string,
    description: string,
    colors: ColorDef[],
  ) {
    return (
      <SettingsSection title={title} description={description}>
        {colors.map((colorDef) => (
          <SettingsField
            key={colorDef.slug}
            label={colorDef.label}
            description={colorDef.description}
            htmlFor={`color-${colorDef.slug}`}
          >
            <ColorInput
              value={getColorFromPalette(palette, colorDef.slug)}
              onChange={(color) =>
                handleColorChange(colorDef.slug, colorDef.label, color)
              }
            />
          </SettingsField>
        ))}
      </SettingsSection>
    );
  }

  // Format relative time for last saved
  function formatRelativeTime(timestamp: number): string {
    const diff = Date.now() - timestamp;
    const seconds = Math.floor(diff / 1000);
    if (seconds < 60) return "just now";
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;
    return `${Math.floor(minutes / 60)}h ago`;
  }

  return (
    <div className="flex flex-col gap-6 pb-8">
      {/* Page header */}
      <div>
        <h1 className="text-xl font-semibold text-foreground">Website Colors</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Manage your website's color palette. Changes are saved automatically
          and applied to the active theme
          {activeTheme.name ? ` "${activeTheme.name}"` : ""}.
        </p>
      </div>

      {/* Color sections */}
      <div className="flex flex-col gap-6">
        {renderColorSection(
          "Brand Colors",
          "Primary, secondary, and accent colors that define your brand identity.",
          BRAND_COLORS,
        )}
        {renderColorSection(
          "Surfaces",
          "Background colors for pages, cards, and muted areas.",
          SURFACE_COLORS,
        )}
        {renderColorSection(
          "Text",
          "Colors for body text and de-emphasized content.",
          TEXT_COLORS,
        )}
        {renderColorSection(
          "UI Elements",
          "Colors for borders, input fields, and focus rings.",
          UI_ELEMENT_COLORS,
        )}
      </div>

      {/* Save status */}
      <div className="flex items-center justify-between border-t border-border pt-3 text-xs">
        <span className={isSaving ? "text-muted-foreground" : "text-success"}>
          {isSaving ? "Saving changes..." : "All changes saved."}
        </span>
        {lastSaved && (
          <span className="text-muted-foreground">
            Last saved {formatRelativeTime(lastSaved)}
          </span>
        )}
      </div>
    </div>
  );
}
