/**
 * ColorPalettePicker Component
 *
 * Editable color palette: grid of color swatches with hex input + visual picker.
 * Each palette entry has slug, name, and color.
 */

import { useState } from "react";
import { Plus, X } from "lucide-react";

interface PaletteEntry {
  slug: string;
  name: string;
  color: string;
}

interface ColorPalettePickerProps {
  palette: PaletteEntry[];
  onChange: (palette: PaletteEntry[]) => void;
}

export function ColorPalettePicker({ palette, onChange }: ColorPalettePickerProps) {
  const [editIndex, setEditIndex] = useState<number | null>(null);

  function handleColorChange(index: number, field: keyof PaletteEntry, value: string) {
    const updated = [...palette];
    updated[index] = { ...updated[index], [field]: value };
    onChange(updated);
  }

  function handleAdd() {
    const count = palette.length + 1;
    onChange([
      ...palette,
      { slug: `color-${count}`, name: `Color ${count}`, color: "#000000" },
    ]);
    setEditIndex(palette.length);
  }

  function handleRemove(index: number) {
    if (palette.length <= 1) return; // Must keep at least one
    const updated = palette.filter((_, i) => i !== index);
    onChange(updated);
    setEditIndex(null);
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {palette.map((entry, i) => (
          <button
            key={entry.slug}
            type="button"
            onClick={() => setEditIndex(editIndex === i ? null : i)}
            className={`group relative h-10 w-10 border transition-all ${
              editIndex === i ? "border-foreground ring-2 ring-ring" : "border-border hover:border-foreground/50"
            }`}
            style={{ backgroundColor: entry.color }}
            title={`${entry.name} (${entry.color})`}
          />
        ))}
        <button
          type="button"
          onClick={handleAdd}
          className="flex h-10 w-10 items-center justify-center border border-dashed border-border hover:border-foreground/50 transition-colors"
        >
          <Plus className="h-4 w-4 text-muted-foreground" />
        </button>
      </div>

      {editIndex !== null && editIndex < palette.length && (
        <div className="border border-border bg-card p-3 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium">Edit Color</span>
            <button
              type="button"
              onClick={() => setEditIndex(null)}
              className="text-muted-foreground hover:text-foreground"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
          <div className="grid grid-cols-3 gap-2">
            <div>
              <label className="text-xs text-muted-foreground block mb-1">Slug</label>
              <input
                type="text"
                value={palette[editIndex].slug}
                onChange={(e) => handleColorChange(editIndex, "slug", e.target.value)}
                className="dark:bg-input/30 border-input h-7 border bg-transparent px-2 text-xs w-full outline-hidden focus:border-ring"
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground block mb-1">Name</label>
              <input
                type="text"
                value={palette[editIndex].name}
                onChange={(e) => handleColorChange(editIndex, "name", e.target.value)}
                className="dark:bg-input/30 border-input h-7 border bg-transparent px-2 text-xs w-full outline-hidden focus:border-ring"
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground block mb-1">Color</label>
              <div className="flex items-center gap-1">
                <input
                  type="color"
                  value={palette[editIndex].color}
                  onChange={(e) => handleColorChange(editIndex, "color", e.target.value)}
                  className="h-7 w-7 border border-input cursor-pointer"
                />
                <input
                  type="text"
                  value={palette[editIndex].color}
                  onChange={(e) => handleColorChange(editIndex, "color", e.target.value)}
                  className="dark:bg-input/30 border-input h-7 border bg-transparent px-2 text-xs flex-1 min-w-0 outline-hidden focus:border-ring"
                />
              </div>
            </div>
          </div>
          {palette.length > 1 && (
            <button
              type="button"
              onClick={() => handleRemove(editIndex)}
              className="text-xs text-destructive hover:text-destructive/80 transition-colors"
            >
              Remove color
            </button>
          )}
        </div>
      )}
    </div>
  );
}
