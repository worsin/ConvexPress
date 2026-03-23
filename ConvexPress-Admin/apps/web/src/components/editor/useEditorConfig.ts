/**
 * useEditorConfig - TipTap editor configuration hook
 *
 * Returns the full array of TipTap extensions configured for the SmithHarper
 * content editor. This is the central extension registry.
 *
 * Key decisions:
 *   - StarterKit provides heading, lists, blockquote, history, etc.
 *   - codeBlock DISABLED in StarterKit to avoid conflict with CodeBlockLowlight
 *   - dropcursor DISABLED in StarterKit to avoid conflict with standalone Dropcursor
 *   - gapcursor DISABLED in StarterKit to avoid conflict with standalone Gapcursor
 *   - Dropcursor and Gapcursor added as standalone extensions for finer control
 *   - Custom extensions registered after standard ones
 *   - Placeholder text matches WordPress editor UX
 *   - CodeBlockLowlight can be added when lowlight + highlight.js are installed
 */

import { useMemo, useCallback, useRef } from "react";
import type { Extensions } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import Image from "@tiptap/extension-image";
import { Table, TableRow, TableCell, TableHeader } from "@tiptap/extension-table";
import Link from "@tiptap/extension-link";
import TextAlign from "@tiptap/extension-text-align";
import Underline from "@tiptap/extension-underline";
import Highlight from "@tiptap/extension-highlight";
import { TextStyle } from "@tiptap/extension-text-style";
import Color from "@tiptap/extension-color";
import TaskList from "@tiptap/extension-task-list";
import TaskItem from "@tiptap/extension-task-item";
import CharacterCount from "@tiptap/extension-character-count";
import Dropcursor from "@tiptap/extension-dropcursor";
import Gapcursor from "@tiptap/extension-gapcursor";
import Superscript from "@tiptap/extension-superscript";
import Subscript from "@tiptap/extension-subscript";
import CodeBlockLowlight from "@tiptap/extension-code-block-lowlight";
import { common, createLowlight } from "lowlight";

// Create lowlight instance with common language grammars
const lowlight = createLowlight(common);

// Custom extensions
import { CalloutBlock } from "./extensions/callout-block";
import { EmbedBlock } from "./extensions/embed-block";
import { ButtonBlock } from "./extensions/button-block";
import { SpacerBlock } from "./extensions/spacer-block";
import { DividerBlock } from "./extensions/divider-block";
import { ColumnsBlock, Column } from "./extensions/columns-block";
import { ReusableBlock } from "./extensions/reusable-block";
import { SlashCommands } from "./extensions/slash-commands";
import type { SlashMenuState } from "./extensions/slash-commands";
import { getSlashCommandItems } from "./slash-command-items";

interface UseEditorConfigOptions {
  placeholder?: string;
  onSlashMenuOpen?: (state: SlashMenuState) => void;
  onSlashMenuClose?: () => void;
}

export function useEditorConfig(options: UseEditorConfigOptions = {}) {
  const {
    placeholder = "Type / to choose a block, or start writing...",
    onSlashMenuOpen,
    onSlashMenuClose,
  } = options;

  // Store refs to avoid extension re-creation on every render
  const onOpenRef = useRef(onSlashMenuOpen);
  const onCloseRef = useRef(onSlashMenuClose);
  onOpenRef.current = onSlashMenuOpen;
  onCloseRef.current = onSlashMenuClose;

  const slashCommandItems = useMemo(() => getSlashCommandItems(), []);

  const handleSlashOpen = useCallback((state: SlashMenuState) => {
    onOpenRef.current?.(state);
  }, []);

  const handleSlashClose = useCallback(() => {
    onCloseRef.current?.();
  }, []);

  const extensions = useMemo<Extensions>(
    () => [
      // ── Starter Kit ────────────────────────────────────────────────────
      // Includes: Document, Paragraph, Text, Heading, BulletList, OrderedList,
      // ListItem, Blockquote, HardBreak, HorizontalRule, Bold, Italic,
      // Strike, Code, History (undo/redo)
      // Disabled: codeBlock (use CodeBlockLowlight instead), dropcursor, gapcursor
      // (standalone versions added below for finer control and to avoid conflicts)
      StarterKit.configure({
        heading: {
          levels: [1, 2, 3, 4, 5, 6],
        },
        codeBlock: false,
        dropcursor: false,
        gapcursor: false,
      }),

      // ── Dropcursor & Gapcursor (standalone) ─────────────────────────
      Dropcursor.configure({
        color: "var(--color-primary)",
        width: 2,
      }),
      Gapcursor,

      // ── Code Block with Syntax Highlighting ──────────────────────────
      CodeBlockLowlight.configure({
        lowlight,
      }),

      // ── Text Formatting ────────────────────────────────────────────────
      Underline,
      Superscript,
      Subscript,
      TextStyle,
      Color,
      Highlight.configure({
        multicolor: true,
      }),

      // ── Text Alignment ─────────────────────────────────────────────────
      TextAlign.configure({
        types: ["heading", "paragraph"],
      }),

      // ── Links ──────────────────────────────────────────────────────────
      Link.configure({
        openOnClick: false,
        HTMLAttributes: {
          rel: "noopener noreferrer",
        },
      }),

      // ── Placeholder ────────────────────────────────────────────────────
      Placeholder.configure({
        placeholder: ({ node }) => {
          if (node.type.name === "heading") {
            return `Heading ${node.attrs.level}`;
          }
          return placeholder;
        },
      }),

      // ── Images ─────────────────────────────────────────────────────────
      Image.configure({
        inline: false,
        allowBase64: false,
        HTMLAttributes: {
          class: "editor-image",
        },
      }),

      // ── Tables ─────────────────────────────────────────────────────────
      Table.configure({
        resizable: true,
      }),
      TableRow,
      TableCell,
      TableHeader,

      // ── Task Lists ─────────────────────────────────────────────────────
      TaskList,
      TaskItem.configure({
        nested: true,
      }),

      // ── Character Count ────────────────────────────────────────────────
      CharacterCount,

      // ── Custom Block Extensions ────────────────────────────────────────
      CalloutBlock,
      EmbedBlock,
      ButtonBlock,
      SpacerBlock,
      DividerBlock,
      ColumnsBlock,
      Column,
      ReusableBlock,

      // ── Slash Commands ─────────────────────────────────────────────────
      SlashCommands.configure({
        commands: slashCommandItems,
        onOpen: handleSlashOpen,
        onClose: handleSlashClose,
      }),
    ],
    [placeholder, slashCommandItems, handleSlashOpen, handleSlashClose],
  );

  return { extensions };
}
