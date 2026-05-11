/**
 * TipTapEditor - Main editor content component
 *
 * Renders the TipTap EditorContent with the block toolbar, slash command menu,
 * block inserter button, and editor footer.
 *
 * This component is designed to replace the placeholder div in EditorLayout.
 */

import { useCallback, useState } from "react";
import { EditorContent } from "@tiptap/react";
import { useContentEditor } from "./useContentEditor";
import { useEditorContext } from "./ContentEditorProvider";
import { useNetworkStatus } from "@/hooks/useNetworkStatus";
import "./editor-styles.css";
import { BlockToolbar } from "./BlockToolbar";
import { BlockInserter } from "./BlockInserter";
import { SlashCommandMenu } from "./SlashCommandMenu";
import { EditorFooter } from "./EditorFooter";
import { LinkPopover } from "./LinkPopover";
import { executeSlashCommand } from "./extensions/slash-commands";
import type { SlashCommandItem } from "@/types/editor";

interface TipTapEditorProps {
  /** Initial content as JSON string */
  initialContent?: string;
  /** Callback when content changes */
  onContentChange?: (json: string) => void;
  /** Whether the editor is read-only */
  readOnly?: boolean;
}

export function TipTapEditor({
  initialContent,
  onContentChange,
  readOnly = false,
}: TipTapEditorProps) {
  const {
    editor,
    stats,
    isEmpty,
    slashMenu,
    closeSlashMenu,
  } = useContentEditor({
    initialContent,
    onContentChange,
    editable: !readOnly,
  });

  // Block inserter state
  const [isInserterOpen, setIsInserterOpen] = useState(false);

  // Link popover state
  const [linkPopoverOpen, setLinkPopoverOpen] = useState(false);

  // Network status for disconnect warning
  const { isOnline } = useNetworkStatus();

  // JSON editor toggle (developer mode, Administrator-only)
  const [showJsonEditor, setShowJsonEditor] = useState(false);
  const [jsonValue, setJsonValue] = useState("");
  const [jsonError, setJsonError] = useState<string | null>(null);

  // Handle slash command selection
  const handleSlashSelect = useCallback(
    (item: SlashCommandItem) => {
      if (!editor || !slashMenu.state) return;
      executeSlashCommand(editor, item, slashMenu.state.range);
      closeSlashMenu();
    },
    [editor, slashMenu.state, closeSlashMenu],
  );

  // Handle block inserter selection
  const handleInserterSelect = useCallback(
    (item: SlashCommandItem) => {
      if (!editor) return;
      editor.chain().focus().run();
      item.action(editor);
      setIsInserterOpen(false);
    },
    [editor],
  );

  // Toggle link popover via keyboard shortcut or toolbar button
  // Opens the popover whether a link is active (edit) or not (add)
  const handleToggleLink = useCallback(() => {
    if (!editor) return;
    setLinkPopoverOpen(true);
  }, [editor]);

  // Toggle JSON editor mode (developer mode)
  const handleToggleJsonEditor = useCallback(() => {
    if (!editor) return;
    if (!showJsonEditor) {
      // Opening: serialize current content to formatted JSON
      const json = JSON.stringify(editor.getJSON(), null, 2);
      setJsonValue(json);
      setJsonError(null);
    } else {
      // Closing: apply JSON content if valid
      try {
        const parsed = JSON.parse(jsonValue);
        editor.commands.setContent(parsed);
        setJsonError(null);
      } catch (e) {
        setJsonError("Invalid JSON. Changes not applied.");
        return; // Don't close if JSON is invalid
      }
    }
    setShowJsonEditor(!showJsonEditor);
  }, [editor, showJsonEditor, jsonValue]);

  if (!editor) {
    return (
      <div className="min-h-[400px] border border-border bg-card flex items-center justify-center">
        <p className="text-sm text-muted-foreground">Loading editor...</p>
      </div>
    );
  }

  return (
    <div className="border border-border bg-card" data-slot="tiptap-editor">
      {/* Network disconnect warning banner */}
      {!isOnline && (
        <div
          className="flex items-center gap-2 px-3 py-2 bg-destructive/10 border-b border-destructive/20 text-destructive text-xs font-medium"
          role="alert"
          aria-live="polite"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="shrink-0"
          >
            <line x1="2" x2="22" y1="2" y2="22" />
            <path d="M8.5 16.5a5 5 0 0 1 7 0" />
            <path d="M2 8.82a15 15 0 0 1 4.17-2.65" />
            <path d="M10.66 5c4.01-.36 8.14.9 11.34 3.76" />
            <path d="M16.85 11.25a10 10 0 0 1 2.22 1.68" />
            <path d="M5 12.86a10 10 0 0 1 5.17-2.94" />
            <line x1="12" x2="12.01" y1="20" y2="20" />
          </svg>
          <span>
            You are offline. Changes are being saved locally but autosave to the
            server is paused until your connection is restored.
          </span>
        </div>
      )}

      {/* Block Toolbar (floating, appears on block selection) */}
      <BlockToolbar editor={editor} onToggleLink={handleToggleLink} />

      {/* Add Block button */}
      <div className="border-b border-border px-2 py-1.5 flex items-center gap-1">
        <button
          type="button"
          onClick={() => setIsInserterOpen(!isInserterOpen)}
          className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
          aria-label="Add block"
          title="Add block (/ for slash commands)"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M12 5v14M5 12h14" />
          </svg>
          Add Block
        </button>

        {/* JSON toggle (developer mode) + Undo / Redo */}
        <div className="ml-auto flex items-center gap-0.5">
          {/* JSON toggle button */}
          <button
            type="button"
            onClick={handleToggleJsonEditor}
            className={`p-1 text-xs font-mono transition-colors ${
              showJsonEditor
                ? "text-primary bg-primary/10"
                : "text-muted-foreground hover:text-foreground"
            }`}
            title={showJsonEditor ? "Close JSON editor" : "View/edit raw JSON"}
            aria-label={showJsonEditor ? "Close JSON editor" : "View raw JSON"}
          >
            {"{ }"}
          </button>
        </div>
        <div className="flex items-center gap-0.5">
          <button
            type="button"
            onClick={() => editor.chain().focus().undo().run()}
            disabled={!editor.can().undo()}
            className="p-1 text-muted-foreground hover:text-foreground disabled:opacity-30 transition-colors"
            title="Undo (Ctrl+Z)"
            aria-label="Undo"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M3 7v6h6" />
              <path d="M21 17a9 9 0 0 0-9-9 9 9 0 0 0-6 2.3L3 13" />
            </svg>
          </button>
          <button
            type="button"
            onClick={() => editor.chain().focus().redo().run()}
            disabled={!editor.can().redo()}
            className="p-1 text-muted-foreground hover:text-foreground disabled:opacity-30 transition-colors"
            title="Redo (Ctrl+Shift+Z)"
            aria-label="Redo"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M21 7v6h-6" />
              <path d="M3 17a9 9 0 0 1 9-9 9 9 0 0 1 6 2.3L21 13" />
            </svg>
          </button>
        </div>
      </div>

      {/* Block Inserter Panel (dropdown) */}
      {isInserterOpen && (
        <BlockInserter
          onSelect={handleInserterSelect}
          onClose={() => setIsInserterOpen(false)}
        />
      )}

      {/* JSON Editor Panel (developer mode) */}
      {showJsonEditor && (
        <div className="border-b border-border bg-muted/20">
          <div className="px-3 py-1.5 flex items-center justify-between border-b border-border">
            <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
              Raw JSON Editor
            </span>
            {jsonError && (
              <span className="text-[10px] text-destructive">{jsonError}</span>
            )}
          </div>
          <textarea
            value={jsonValue}
            onChange={(e) => {
              setJsonValue(e.target.value);
              setJsonError(null);
            }}
            className="w-full min-h-[200px] max-h-[400px] bg-transparent px-3 py-2 text-xs font-mono text-foreground outline-hidden resize-y"
            spellCheck={false}
          />
        </div>
      )}

      {/* Main editor content area */}
      <div className={`relative min-h-[400px] px-4 py-3 ${showJsonEditor ? "hidden" : ""}`}>
        <EditorContent editor={editor} className="prose prose-sm max-w-none" />

        {/* Slash Command Menu (floating) */}
        {slashMenu.isOpen && slashMenu.state && (
          <SlashCommandMenu
            items={slashMenu.state.items}
            query={slashMenu.state.query}
            clientRect={slashMenu.state.clientRect}
            onSelect={handleSlashSelect}
            onClose={closeSlashMenu}
          />
        )}

        {/* Link Popover */}
        {linkPopoverOpen && (
          <LinkPopover
            editor={editor}
            onClose={() => setLinkPopoverOpen(false)}
          />
        )}
      </div>

      {/* Editor Footer (word count, block count, reading time) */}
      <EditorFooter
        wordCount={stats.wordCount}
        characterCount={stats.characterCount}
        blockCount={stats.blockCount}
        readingTime={stats.readingTime}
      />
    </div>
  );
}
