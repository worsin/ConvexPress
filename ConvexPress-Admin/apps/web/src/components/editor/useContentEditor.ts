/**
 * useContentEditor - Core TipTap editor hook
 *
 * Manages TipTap editor instance lifecycle:
 *   - Initializes editor with extensions from useEditorConfig
 *   - Loads initial content from JSON string
 *   - Provides content serialization (getJSON -> JSON.stringify)
 *   - Tracks dirty state and editor statistics (word count, block count, etc.)
 *   - Handles content change callbacks to sync with the EditorLayout form
 */

import { useCallback, useRef, useState } from "react";
import { useEditor, type Editor } from "@tiptap/react";
import { useEditorConfig } from "./useEditorConfig";
import type { SlashMenuState } from "./extensions/slash-commands";

interface UseContentEditorOptions {
  /** Initial content as JSON string (from posts.content) */
  initialContent?: string;
  /** Callback when content changes (JSON string) */
  onContentChange?: (json: string) => void;
  /** Whether the editor is in read-only mode */
  editable?: boolean;
  /** Placeholder text */
  placeholder?: string;
}

interface EditorStats {
  wordCount: number;
  characterCount: number;
  blockCount: number;
  readingTime: number; // in minutes
}

interface SlashMenuContext {
  isOpen: boolean;
  state: SlashMenuState | null;
}

export function useContentEditor(options: UseContentEditorOptions = {}) {
  const {
    initialContent,
    onContentChange,
    editable = true,
    placeholder,
  } = options;

  const onContentChangeRef = useRef(onContentChange);
  onContentChangeRef.current = onContentChange;

  // Slash command menu state
  const [slashMenu, setSlashMenu] = useState<SlashMenuContext>({
    isOpen: false,
    state: null,
  });

  const handleSlashOpen = useCallback((state: SlashMenuState) => {
    setSlashMenu({ isOpen: true, state });
  }, []);

  const handleSlashClose = useCallback(() => {
    setSlashMenu({ isOpen: false, state: null });
  }, []);

  // Get extensions
  const { extensions } = useEditorConfig({
    placeholder,
    onSlashMenuOpen: handleSlashOpen,
    onSlashMenuClose: handleSlashClose,
  });

  // Parse initial content
  const parsedContent = (() => {
    if (!initialContent) return undefined;
    try {
      return JSON.parse(initialContent);
    } catch {
      return undefined;
    }
  })();

  // Editor stats
  const [stats, setStats] = useState<EditorStats>({
    wordCount: 0,
    characterCount: 0,
    blockCount: 0,
    readingTime: 0,
  });

  // Initialize editor
  const editor = useEditor({
    extensions,
    content: parsedContent,
    editable,
    editorProps: {
      attributes: {
        class:
          "prose prose-sm sm:prose-base max-w-none focus:outline-none min-h-[300px] px-4 py-3",
        role: "textbox",
        "aria-multiline": "true",
        "aria-label": "Content editor",
      },
    },
    onUpdate: ({ editor: ed }) => {
      // Serialize content and notify parent
      const json = JSON.stringify(ed.getJSON());
      onContentChangeRef.current?.(json);

      // Update stats
      updateStats(ed);
    },
    onCreate: ({ editor: ed }) => {
      updateStats(ed);
    },
  });

  // Update stats helper
  const updateStats = useCallback((ed: Editor) => {
    const text = ed.getText();
    const words = text
      .split(/\s+/)
      .filter((w) => w.length > 0);
    const wordCount = words.length;
    const characterCount = ed.storage.characterCount?.characters() ?? text.length;
    const blockCount = ed.state.doc.childCount;

    // Calculate reading time excluding code blocks (code is typically skimmed, not read)
    let readableWordCount = 0;
    ed.state.doc.descendants((node) => {
      // Skip code_block nodes — their content inflates reading time
      if (node.type.name === "codeBlock" || node.type.name === "code_block") {
        return false; // don't descend into children
      }
      if (node.isText && node.text) {
        const nodeWords = node.text.split(/\s+/).filter((w) => w.length > 0);
        readableWordCount += nodeWords.length;
      }
      return true; // continue traversal
    });
    const readingTime = Math.max(1, Math.ceil(readableWordCount / 200));

    setStats({
      wordCount,
      characterCount,
      blockCount,
      readingTime,
    });
  }, []);

  // Serialize current content to JSON string
  const getContent = useCallback((): string => {
    if (!editor) return "";
    return JSON.stringify(editor.getJSON());
  }, [editor]);

  // Set content from JSON string
  const setContent = useCallback(
    (json: string) => {
      if (!editor) return;
      try {
        const parsed = JSON.parse(json);
        editor.commands.setContent(parsed);
      } catch {
        // Invalid JSON, ignore
      }
    },
    [editor],
  );

  // Check if editor has any content
  const isEmpty = editor?.isEmpty ?? true;

  return {
    editor,
    stats,
    isEmpty,
    getContent,
    setContent,
    slashMenu,
    closeSlashMenu: handleSlashClose,
  };
}
