/**
 * SlashCommandMenu - Floating suggestion menu for / commands
 *
 * Appears when the user types `/` in an empty paragraph.
 * Filters suggestions as the user continues typing.
 * Supports keyboard navigation (ArrowUp, ArrowDown, Enter, Escape).
 */

import { useState, useEffect, useRef, useCallback, type ReactNode } from "react";
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
import type { SlashCommandItem } from "@/types/editor";

interface SlashCommandMenuProps {
  items: SlashCommandItem[];
  query: string;
  clientRect: (() => DOMRect | null) | null;
  onSelect: (item: SlashCommandItem) => void;
  onClose: () => void;
}

export function SlashCommandMenu({
  items,
  query,
  clientRect,
  onSelect,
  onClose,
}: SlashCommandMenuProps) {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const menuRef = useRef<HTMLDivElement>(null);

  // Reset selection when items change
  useEffect(() => {
    setSelectedIndex(0);
  }, [items]);

  // Keyboard navigation
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (items.length === 0) return;

      switch (e.key) {
        case "ArrowDown":
          e.preventDefault();
          setSelectedIndex((prev) => (prev + 1) % items.length);
          break;
        case "ArrowUp":
          e.preventDefault();
          setSelectedIndex((prev) =>
            prev === 0 ? items.length - 1 : prev - 1,
          );
          break;
        case "Enter":
          e.preventDefault();
          if (items[selectedIndex]) {
            onSelect(items[selectedIndex]);
          }
          break;
        case "Escape":
          e.preventDefault();
          onClose();
          break;
      }
    },
    [items, selectedIndex, onSelect, onClose],
  );

  useEffect(() => {
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);

  // Position the menu based on the cursor rect
  const rect = clientRect?.();
  const style: React.CSSProperties = rect
    ? {
        position: "fixed",
        top: `${rect.bottom + 4}px`,
        left: `${rect.left}px`,
        zIndex: 50,
      }
    : {
        position: "absolute",
        top: "100%",
        left: 0,
        zIndex: 50,
      };

  if (items.length === 0) {
    return null;
  }

  return (
    <div
      ref={menuRef}
      style={style}
      className="w-64 max-h-[280px] overflow-y-auto bg-card border border-border shadow-lg"
      role="listbox"
      aria-label="Slash commands"
    >
      {items.map((item, index) => (
        <button
          key={item.id}
          type="button"
          onClick={() => onSelect(item)}
          onMouseEnter={() => setSelectedIndex(index)}
          role="option"
          aria-selected={index === selectedIndex}
          className={`
            w-full flex items-start gap-3 px-3 py-2 text-left transition-colors
            ${index === selectedIndex ? "bg-muted/60" : "hover:bg-muted/30"}
          `}
        >
          <span className="text-muted-foreground mt-0.5 w-5 text-center shrink-0">
            {getIcon(item.id)}
          </span>
          <div className="min-w-0">
            <div className="text-xs font-medium text-foreground">
              {item.label}
            </div>
            <div className="text-[10px] text-muted-foreground truncate">
              {item.description}
            </div>
          </div>
        </button>
      ))}
    </div>
  );
}

function getIcon(blockId: string): ReactNode {
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
