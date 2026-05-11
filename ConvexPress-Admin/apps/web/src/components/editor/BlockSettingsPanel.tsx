/**
 * BlockSettingsPanel - Selected block settings tab
 *
 * Shows configuration options for the currently selected block in the editor.
 * Different blocks show different settings:
 *   - Image: src, alt, title, caption toggle, width, height, alignment
 *   - Embed: url, provider info, URL validation feedback
 *   - Callout: type (info/warning/error/success)
 *   - Button: text, url, variant, alignment
 *   - Spacer: height
 *   - Divider: style (solid/dashed/dotted/double)
 *   - Columns: count, gap size
 *   - Code Block: language
 *   - Heading: level
 */

import { useCallback, useState } from "react";
import type { Editor } from "@tiptap/react";

interface BlockSettingsPanelProps {
  editor: Editor;
}

export function BlockSettingsPanel({ editor }: BlockSettingsPanelProps) {
  const { selection } = editor.state;
  const node = selection.$from.parent;

  // Find the nearest block-level node
  const activeNodeName = (() => {
    if (editor.isActive("image")) return "image";
    if (editor.isActive("embed")) return "embed";
    if (editor.isActive("callout")) return "callout";
    if (editor.isActive("button")) return "button";
    if (editor.isActive("spacer")) return "spacer";
    if (editor.isActive("divider")) return "divider";
    if (editor.isActive("columns")) return "columns";
    if (editor.isActive("codeBlock")) return "codeBlock";
    if (editor.isActive("heading")) return "heading";
    if (editor.isActive("table")) return "table";
    if (editor.isActive("reusableBlock")) return "reusableBlock";
    return node.type.name;
  })();

  return (
    <div className="space-y-3">
      <h3 className="text-xs font-semibold text-foreground capitalize">
        {formatBlockName(activeNodeName)} Settings
      </h3>

      {activeNodeName === "image" && <ImageSettings editor={editor} />}
      {activeNodeName === "embed" && <EmbedSettings editor={editor} />}
      {activeNodeName === "callout" && <CalloutSettings editor={editor} />}
      {activeNodeName === "button" && <ButtonSettings editor={editor} />}
      {activeNodeName === "spacer" && <SpacerSettings editor={editor} />}
      {activeNodeName === "divider" && <DividerSettings editor={editor} />}
      {activeNodeName === "columns" && <ColumnsSettings editor={editor} />}
      {activeNodeName === "codeBlock" && <CodeBlockSettings editor={editor} />}
      {activeNodeName === "heading" && <HeadingSettings editor={editor} />}

      {!hasCustomSettings(activeNodeName) && (
        <p className="text-[10px] text-muted-foreground">
          No additional settings for this block type.
        </p>
      )}
    </div>
  );
}

// ─── Block-Specific Settings Components ──────────────────────────────────────

function ImageSettings({ editor }: { editor: Editor }) {
  const attrs = editor.getAttributes("image");

  return (
    <div className="space-y-2">
      <SettingsField
        label="Image URL"
        value={attrs.src || ""}
        onChange={(val) =>
          editor.chain().focus().updateAttributes("image", { src: val }).run()
        }
        placeholder="https://..."
      />
      <SettingsField
        label="Alt Text"
        value={attrs.alt || ""}
        onChange={(val) =>
          editor.chain().focus().updateAttributes("image", { alt: val }).run()
        }
        placeholder="Describe the image for screen readers"
      />
      <SettingsField
        label="Caption"
        value={attrs.title || ""}
        onChange={(val) =>
          editor.chain().focus().updateAttributes("image", { title: val }).run()
        }
        placeholder="Image caption (shown below image)"
      />

      {/* Dimensions */}
      <div className="flex items-center gap-2">
        <div className="flex-1">
          <label className="block text-[10px] font-medium text-muted-foreground mb-0.5">
            Width
          </label>
          <input
            type="number"
            value={attrs.width || ""}
            onChange={(e) =>
              editor
                .chain()
                .focus()
                .updateAttributes("image", {
                  width: e.target.value ? parseInt(e.target.value, 10) : undefined,
                })
                .run()
            }
            placeholder="Auto"
            className="w-full bg-muted/30 border border-border px-2 py-1 text-xs text-foreground placeholder:text-muted-foreground outline-hidden focus:border-primary"
          />
        </div>
        <div className="flex-1">
          <label className="block text-[10px] font-medium text-muted-foreground mb-0.5">
            Height
          </label>
          <input
            type="number"
            value={attrs.height || ""}
            onChange={(e) =>
              editor
                .chain()
                .focus()
                .updateAttributes("image", {
                  height: e.target.value ? parseInt(e.target.value, 10) : undefined,
                })
                .run()
            }
            placeholder="Auto"
            className="w-full bg-muted/30 border border-border px-2 py-1 text-xs text-foreground placeholder:text-muted-foreground outline-hidden focus:border-primary"
          />
        </div>
      </div>

      {/* Alignment */}
      <label className="block text-[10px] font-medium text-muted-foreground">
        Alignment
      </label>
      <select
        value={attrs.alignment || "center"}
        onChange={(e) =>
          editor
            .chain()
            .focus()
            .updateAttributes("image", { alignment: e.target.value })
            .run()
        }
        className="w-full bg-muted/30 border border-border px-2 py-1 text-xs text-foreground outline-hidden"
      >
        <option value="left">Left</option>
        <option value="center">Center</option>
        <option value="right">Right</option>
        <option value="wide">Wide</option>
        <option value="full">Full Width</option>
      </select>
    </div>
  );
}

function EmbedSettings({ editor }: { editor: Editor }) {
  const attrs = editor.getAttributes("embed");
  const url = attrs.url || "";

  // URL validation
  const validation = validateEmbedUrl(url);

  return (
    <div className="space-y-2">
      <div>
        <label className="block text-[10px] font-medium text-muted-foreground mb-0.5">
          URL
        </label>
        <input
          type="text"
          value={url}
          onChange={(e) =>
            editor.chain().focus().updateAttributes("embed", { url: e.target.value }).run()
          }
          placeholder="https://youtube.com/watch?v=..."
          className={`w-full bg-muted/30 border px-2 py-1 text-xs text-foreground placeholder:text-muted-foreground outline-hidden focus:border-primary ${
            url && !validation.isValid
              ? "border-destructive"
              : "border-border"
          }`}
        />
        {/* Validation feedback */}
        {url && !validation.isValid && (
          <p className="text-[10px] text-destructive mt-0.5">
            {validation.message}
          </p>
        )}
        {url && validation.isValid && validation.provider !== "generic" && (
          <p className="text-[10px] text-muted-foreground mt-0.5">
            Detected: {validation.provider}
          </p>
        )}
        {url && validation.isValid && validation.provider === "generic" && (
          <p className="text-[10px] text-muted-foreground/60 mt-0.5">
            Provider not recognized. Link preview will be used.
          </p>
        )}
      </div>
      {attrs.provider && attrs.provider !== "generic" && (
        <div className="text-[10px] text-muted-foreground">
          Provider: <span className="capitalize">{attrs.provider}</span>
        </div>
      )}
    </div>
  );
}

function CalloutSettings({ editor }: { editor: Editor }) {
  const attrs = editor.getAttributes("callout");

  return (
    <div className="space-y-2">
      <label className="block text-[10px] font-medium text-muted-foreground">
        Type
      </label>
      <select
        value={attrs.type || "info"}
        onChange={(e) =>
          editor
            .chain()
            .focus()
            .updateAttributes("callout", { type: e.target.value })
            .run()
        }
        className="w-full bg-muted/30 border border-border px-2 py-1 text-xs text-foreground outline-hidden"
      >
        <option value="info">Info</option>
        <option value="warning">Warning</option>
        <option value="error">Error</option>
        <option value="success">Success</option>
      </select>
    </div>
  );
}

function ButtonSettings({ editor }: { editor: Editor }) {
  const attrs = editor.getAttributes("button");

  return (
    <div className="space-y-2">
      <SettingsField
        label="Button Text"
        value={attrs.text || ""}
        onChange={(val) =>
          editor.chain().focus().updateAttributes("button", { text: val }).run()
        }
        placeholder="Click Here"
      />
      <SettingsField
        label="URL"
        value={attrs.url || ""}
        onChange={(val) =>
          editor.chain().focus().updateAttributes("button", { url: val }).run()
        }
        placeholder="https://..."
      />
      <label className="block text-[10px] font-medium text-muted-foreground">
        Variant
      </label>
      <select
        value={attrs.variant || "primary"}
        onChange={(e) =>
          editor
            .chain()
            .focus()
            .updateAttributes("button", { variant: e.target.value })
            .run()
        }
        className="w-full bg-muted/30 border border-border px-2 py-1 text-xs text-foreground outline-hidden"
      >
        <option value="primary">Primary</option>
        <option value="secondary">Secondary</option>
        <option value="outline">Outline</option>
      </select>
      <label className="block text-[10px] font-medium text-muted-foreground">
        Alignment
      </label>
      <select
        value={attrs.alignment || "left"}
        onChange={(e) =>
          editor
            .chain()
            .focus()
            .updateAttributes("button", { alignment: e.target.value })
            .run()
        }
        className="w-full bg-muted/30 border border-border px-2 py-1 text-xs text-foreground outline-hidden"
      >
        <option value="left">Left</option>
        <option value="center">Center</option>
        <option value="right">Right</option>
      </select>
    </div>
  );
}

function SpacerSettings({ editor }: { editor: Editor }) {
  const attrs = editor.getAttributes("spacer");

  return (
    <div className="space-y-2">
      <label className="block text-[10px] font-medium text-muted-foreground">
        Height (px)
      </label>
      <input
        type="range"
        min={8}
        max={200}
        value={attrs.height || 40}
        onChange={(e) =>
          editor
            .chain()
            .focus()
            .updateAttributes("spacer", { height: parseInt(e.target.value, 10) })
            .run()
        }
        className="w-full"
      />
      <span className="text-[10px] text-muted-foreground">
        {attrs.height || 40}px
      </span>
    </div>
  );
}

function DividerSettings({ editor }: { editor: Editor }) {
  const attrs = editor.getAttributes("divider");

  return (
    <div className="space-y-2">
      <label className="block text-[10px] font-medium text-muted-foreground">
        Style
      </label>
      <select
        value={attrs.style || "solid"}
        onChange={(e) =>
          editor
            .chain()
            .focus()
            .updateAttributes("divider", { style: e.target.value })
            .run()
        }
        className="w-full bg-muted/30 border border-border px-2 py-1 text-xs text-foreground outline-hidden"
      >
        <option value="solid">Solid</option>
        <option value="dashed">Dashed</option>
        <option value="dotted">Dotted</option>
        <option value="double">Double</option>
      </select>
    </div>
  );
}

function ColumnsSettings({ editor }: { editor: Editor }) {
  const attrs = editor.getAttributes("columns");

  return (
    <div className="space-y-2">
      <label className="block text-[10px] font-medium text-muted-foreground">
        Columns
      </label>
      <select
        value={attrs.count || 2}
        onChange={(e) =>
          editor
            .chain()
            .focus()
            .updateAttributes("columns", {
              count: parseInt(e.target.value, 10),
            })
            .run()
        }
        className="w-full bg-muted/30 border border-border px-2 py-1 text-xs text-foreground outline-hidden"
      >
        <option value={2}>2 Columns</option>
        <option value={3}>3 Columns</option>
        <option value={4}>4 Columns</option>
      </select>

      {/* Gap size */}
      <label className="block text-[10px] font-medium text-muted-foreground">
        Gap
      </label>
      <select
        value={attrs.gap || "medium"}
        onChange={(e) =>
          editor
            .chain()
            .focus()
            .updateAttributes("columns", { gap: e.target.value })
            .run()
        }
        className="w-full bg-muted/30 border border-border px-2 py-1 text-xs text-foreground outline-hidden"
      >
        <option value="small">Small</option>
        <option value="medium">Medium</option>
        <option value="large">Large</option>
      </select>

      {/* Stack on mobile */}
      <label className="flex items-center gap-2 text-[10px] text-muted-foreground cursor-pointer">
        <input
          type="checkbox"
          checked={attrs.stackOnMobile !== false}
          onChange={(e) =>
            editor
              .chain()
              .focus()
              .updateAttributes("columns", { stackOnMobile: e.target.checked })
              .run()
          }
          className="accent-primary"
        />
        Stack on mobile
      </label>
    </div>
  );
}

function CodeBlockSettings({ editor }: { editor: Editor }) {
  const attrs = editor.getAttributes("codeBlock");

  return (
    <div className="space-y-2">
      <SettingsField
        label="Language"
        value={attrs.language || ""}
        onChange={(val) =>
          editor
            .chain()
            .focus()
            .updateAttributes("codeBlock", { language: val })
            .run()
        }
        placeholder="typescript, python, etc."
      />
    </div>
  );
}

function HeadingSettings({ editor }: { editor: Editor }) {
  const attrs = editor.getAttributes("heading");

  return (
    <div className="space-y-2">
      <label className="block text-[10px] font-medium text-muted-foreground">
        Level
      </label>
      <select
        value={attrs.level || 2}
        onChange={(e) =>
          editor
            .chain()
            .focus()
            .toggleHeading({ level: parseInt(e.target.value, 10) as 1 | 2 | 3 | 4 | 5 | 6 })
            .run()
        }
        className="w-full bg-muted/30 border border-border px-2 py-1 text-xs text-foreground outline-hidden"
      >
        <option value={1}>Heading 1</option>
        <option value={2}>Heading 2</option>
        <option value={3}>Heading 3</option>
        <option value={4}>Heading 4</option>
        <option value={5}>Heading 5</option>
        <option value={6}>Heading 6</option>
      </select>
    </div>
  );
}

// ─── Shared Settings Field ───────────────────────────────────────────────────

interface SettingsFieldProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}

function SettingsField({
  label,
  value,
  onChange,
  placeholder,
}: SettingsFieldProps) {
  return (
    <div>
      <label className="block text-[10px] font-medium text-muted-foreground mb-0.5">
        {label}
      </label>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full bg-muted/30 border border-border px-2 py-1 text-xs text-foreground placeholder:text-muted-foreground outline-hidden focus:border-primary"
      />
    </div>
  );
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatBlockName(name: string): string {
  const names: Record<string, string> = {
    paragraph: "Paragraph",
    heading: "Heading",
    image: "Image",
    embed: "Embed",
    callout: "Callout",
    button: "Button",
    spacer: "Spacer",
    divider: "Divider",
    columns: "Columns",
    codeBlock: "Code Block",
    table: "Table",
    blockquote: "Blockquote",
    bulletList: "Bullet List",
    orderedList: "Ordered List",
    taskList: "Task List",
    reusableBlock: "Reusable Block",
  };
  return names[name] ?? name;
}

function hasCustomSettings(name: string): boolean {
  return [
    "image",
    "embed",
    "callout",
    "button",
    "spacer",
    "divider",
    "columns",
    "codeBlock",
    "heading",
  ].includes(name);
}

// ─── Embed URL Validation ───────────────────────────────────────────────────

const SUPPORTED_PROVIDERS: Record<string, string[]> = {
  youtube: ["youtube.com", "youtu.be"],
  vimeo: ["vimeo.com"],
  twitter: ["twitter.com", "x.com"],
};

function validateEmbedUrl(url: string): {
  isValid: boolean;
  provider: string;
  message: string;
} {
  if (!url.trim()) {
    return { isValid: false, provider: "generic", message: "URL is required" };
  }

  try {
    const parsed = new URL(url);
    if (!["http:", "https:"].includes(parsed.protocol)) {
      return {
        isValid: false,
        provider: "generic",
        message: "URL must start with http:// or https://",
      };
    }

    const host = parsed.hostname.replace("www.", "");

    for (const [provider, domains] of Object.entries(SUPPORTED_PROVIDERS)) {
      if (domains.some((d) => host.includes(d))) {
        return { isValid: true, provider, message: "" };
      }
    }

    // Valid URL but unrecognized provider
    return { isValid: true, provider: "generic", message: "" };
  } catch {
    return {
      isValid: false,
      provider: "generic",
      message: "Please enter a valid URL",
    };
  }
}
