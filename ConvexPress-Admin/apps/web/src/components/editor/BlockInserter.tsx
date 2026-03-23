/**
 * BlockInserter - Categorized block picker panel
 *
 * Displays a searchable, categorized list of available blocks.
 * Opens as a dropdown panel below the "+ Add Block" button.
 * Categories: Text, Media, Design, Reusable.
 *
 * Respects capability gates:
 *   - canUploadFiles: when false, hides the "Image" block from Media category
 *     (Contributors without upload_files capability cannot insert image blocks)
 */

import { useState, useMemo, useRef, useEffect, type ReactNode } from "react";
import { useQuery } from "convex/react";
import { api } from "@backend/convex/_generated/api";
import {
  Pilcrow,
  Heading1,
  Heading2,
  Heading3,
  Heading4,
  List,
  ListOrdered,
  ListChecks,
  Quote,
  Code,
  Table2,
  ImageIcon,
  Video,
  MousePointerClick,
  Columns2,
  SeparatorHorizontal,
  Minus,
  Megaphone,
  Puzzle,
} from "lucide-react";
import { getSlashCommandItems, getBlockCategory, createReusableBlockItem } from "./slash-command-items";
import { useEditorContext } from "./ContentEditorProvider";
import type { SlashCommandItem } from "@/types/editor";

interface BlockInserterProps {
  onSelect: (item: SlashCommandItem) => void;
  onClose: () => void;
}

const CATEGORY_LABELS: Record<string, string> = {
  text: "Text",
  media: "Media",
  design: "Design",
  reusable: "Reusable",
};

const CATEGORY_ORDER = ["text", "media", "design", "reusable"];

export function BlockInserter({ onSelect, onClose }: BlockInserterProps) {
  const [search, setSearch] = useState("");
  const searchInputRef = useRef<HTMLInputElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const { canUploadFiles, canCreateReusableBlocks } = useEditorContext();

  // Fetch published reusable blocks from Convex
  const reusableBlocks = useQuery(
    api.editor.queries.listReusableBlocks,
    { publishedOnly: true },
  );

  const items = useMemo(() => {
    const all = getSlashCommandItems();

    // Hide image block for users without upload_files capability
    const filtered = canUploadFiles
      ? all
      : all.filter((item) => item.id !== "image");

    // Merge in reusable blocks from Convex (published ones)
    if (reusableBlocks && reusableBlocks.length > 0) {
      const reusableItems = reusableBlocks.map((block) =>
        createReusableBlockItem(block),
      );
      return [...filtered, ...reusableItems];
    }

    return filtered;
  }, [canUploadFiles, reusableBlocks]);

  // Filter items by search query
  const filtered = useMemo(() => {
    if (!search.trim()) return items;
    const lower = search.toLowerCase();
    return items.filter(
      (item) =>
        item.label.toLowerCase().includes(lower) ||
        item.description.toLowerCase().includes(lower) ||
        item.aliases.some((a) => a.toLowerCase().includes(lower)),
    );
  }, [items, search]);

  // Group by category
  const grouped = useMemo(() => {
    const groups: Record<string, SlashCommandItem[]> = {};
    for (const item of filtered) {
      const cat = getBlockCategory(item.id);
      if (!groups[cat]) groups[cat] = [];
      groups[cat].push(item);
    }
    return groups;
  }, [filtered]);

  // Auto-focus search input
  useEffect(() => {
    searchInputRef.current?.focus();
  }, []);

  // Close on click outside
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        onClose();
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [onClose]);

  // Close on Escape
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  return (
    <div
      ref={panelRef}
      className="border-b border-border bg-card"
      role="listbox"
      aria-label="Block inserter"
    >
      {/* Search */}
      <div className="px-3 py-2 border-b border-border">
        <input
          ref={searchInputRef}
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search blocks..."
          className="w-full bg-transparent text-sm text-foreground placeholder:text-muted-foreground outline-hidden"
          aria-label="Search blocks"
        />
      </div>

      {/* Block list */}
      <div className="max-h-[300px] overflow-y-auto p-2">
        {filtered.length === 0 && (
          <p className="text-xs text-muted-foreground py-4 text-center">
            No blocks found
          </p>
        )}

        {CATEGORY_ORDER.map((category) => {
          const categoryItems = grouped[category];
          if (!categoryItems || categoryItems.length === 0) return null;

          return (
            <div key={category} className="mb-3 last:mb-0">
              <h4 className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground px-2 mb-1">
                {CATEGORY_LABELS[category]}
              </h4>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-1">
                {categoryItems.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => onSelect(item)}
                    className="flex items-center gap-2 px-2 py-1.5 text-left text-xs hover:bg-muted/50 transition-colors group"
                    role="option"
                    aria-label={item.label}
                  >
                    <span className="text-muted-foreground group-hover:text-foreground shrink-0">
                      {getBlockIcon(item.id)}
                    </span>
                    <span className="text-foreground truncate">
                      {item.label}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/**
 * Get a Lucide icon component for a block type.
 */
function getBlockIcon(blockId: string): ReactNode {
  const size = 14;
  // Reusable blocks all get the Puzzle icon
  if (blockId.startsWith("reusable-")) {
    return <Puzzle size={size} />;
  }
  const icons: Record<string, ReactNode> = {
    paragraph: <Pilcrow size={size} />,
    heading1: <Heading1 size={size} />,
    heading2: <Heading2 size={size} />,
    heading3: <Heading3 size={size} />,
    heading4: <Heading4 size={size} />,
    bulletList: <List size={size} />,
    orderedList: <ListOrdered size={size} />,
    taskList: <ListChecks size={size} />,
    blockquote: <Quote size={size} />,
    codeBlock: <Code size={size} />,
    table: <Table2 size={size} />,
    image: <ImageIcon size={size} />,
    embed: <Video size={size} />,
    button: <MousePointerClick size={size} />,
    columns: <Columns2 size={size} />,
    spacer: <SeparatorHorizontal size={size} />,
    divider: <Minus size={size} />,
    callout: <Megaphone size={size} />,
  };
  return icons[blockId] ?? <Pilcrow size={size} />;
}
