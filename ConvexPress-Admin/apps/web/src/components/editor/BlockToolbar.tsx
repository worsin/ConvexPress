/**
 * BlockToolbar - Floating formatting toolbar
 *
 * Appears above the editor when text is selected. Provides inline formatting
 * controls: Bold, Italic, Underline, Strikethrough, Code, Link, Highlight,
 * and block type selector (Paragraph, H1-H4, Blockquote).
 *
 * Uses the BubbleMenu pattern from TipTap.
 */

import type { Editor } from "@tiptap/core";
import { BubbleMenu } from "@tiptap/react/menus";

interface BlockToolbarProps {
  editor: Editor;
  onToggleLink: () => void;
}

export function BlockToolbar({ editor, onToggleLink }: BlockToolbarProps) {
  return (
    <BubbleMenu
      editor={editor}
      options={{
        placement: "top",
      }}
      className="flex items-center gap-0.5 bg-card border border-border shadow-md p-0.5"
    >
      {/* Block type selector */}
      <select
        value={getCurrentBlockType(editor)}
        onChange={(e) => handleBlockTypeChange(editor, e.target.value)}
        className="h-6 text-xs bg-transparent border-none outline-hidden text-foreground cursor-pointer px-1"
        aria-label="Block type"
      >
        <option value="paragraph">Paragraph</option>
        <option value="heading-1">Heading 1</option>
        <option value="heading-2">Heading 2</option>
        <option value="heading-3">Heading 3</option>
        <option value="heading-4">Heading 4</option>
        <option value="blockquote">Blockquote</option>
        <option value="codeBlock">Code Block</option>
      </select>

      <div className="w-px h-4 bg-border mx-0.5" />

      {/* Bold */}
      <ToolbarButton
        onClick={() => editor.chain().focus().toggleBold().run()}
        isActive={editor.isActive("bold")}
        title="Bold (Ctrl+B)"
        aria-label="Bold"
      >
        <span className="font-bold">B</span>
      </ToolbarButton>

      {/* Italic */}
      <ToolbarButton
        onClick={() => editor.chain().focus().toggleItalic().run()}
        isActive={editor.isActive("italic")}
        title="Italic (Ctrl+I)"
        aria-label="Italic"
      >
        <span className="italic">I</span>
      </ToolbarButton>

      {/* Underline */}
      <ToolbarButton
        onClick={() => editor.chain().focus().toggleUnderline().run()}
        isActive={editor.isActive("underline")}
        title="Underline (Ctrl+U)"
        aria-label="Underline"
      >
        <span className="underline">U</span>
      </ToolbarButton>

      {/* Strikethrough */}
      <ToolbarButton
        onClick={() => editor.chain().focus().toggleStrike().run()}
        isActive={editor.isActive("strike")}
        title="Strikethrough (Ctrl+Shift+X)"
        aria-label="Strikethrough"
      >
        <span className="line-through">S</span>
      </ToolbarButton>

      {/* Inline Code */}
      <ToolbarButton
        onClick={() => editor.chain().focus().toggleCode().run()}
        isActive={editor.isActive("code")}
        title="Inline Code (Ctrl+E)"
        aria-label="Inline code"
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
          <polyline points="16 18 22 12 16 6" />
          <polyline points="8 6 2 12 8 18" />
        </svg>
      </ToolbarButton>

      {/* Superscript */}
      <ToolbarButton
        onClick={() => editor.chain().focus().toggleSuperscript().run()}
        isActive={editor.isActive("superscript")}
        title="Superscript"
        aria-label="Superscript"
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
          <path d="m4 19 8-8" />
          <path d="m12 19-8-8" />
          <path d="M20 12h-4c0-1.5.44-2 1.5-2.5S20 8.33 20 7.5c0-.83-.5-1.5-1.5-1.5S17 6.67 17 7.5" />
        </svg>
      </ToolbarButton>

      {/* Subscript */}
      <ToolbarButton
        onClick={() => editor.chain().focus().toggleSubscript().run()}
        isActive={editor.isActive("subscript")}
        title="Subscript"
        aria-label="Subscript"
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
          <path d="m4 5 8 8" />
          <path d="m12 5-8 8" />
          <path d="M20 19h-4c0-1.5.44-2 1.5-2.5S20 15.33 20 14.5c0-.83-.5-1.5-1.5-1.5S17 13.67 17 14.5" />
        </svg>
      </ToolbarButton>

      <div className="w-px h-4 bg-border mx-0.5" />

      {/* Link */}
      <ToolbarButton
        onClick={onToggleLink}
        isActive={editor.isActive("link")}
        title="Link (Ctrl+K)"
        aria-label="Insert link"
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
          <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
          <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
        </svg>
      </ToolbarButton>

      {/* Highlight */}
      <ToolbarButton
        onClick={() => editor.chain().focus().toggleHighlight().run()}
        isActive={editor.isActive("highlight")}
        title="Highlight (Ctrl+Shift+H)"
        aria-label="Highlight"
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
          <path d="m9 11-6 6v3h9l3-3" />
          <path d="m22 12-4.6 4.6a2 2 0 0 1-2.8 0l-5.2-5.2a2 2 0 0 1 0-2.8L14 4" />
        </svg>
      </ToolbarButton>

      <div className="w-px h-4 bg-border mx-0.5" />

      {/* Text Alignment */}
      <ToolbarButton
        onClick={() => editor.chain().focus().setTextAlign("left").run()}
        isActive={editor.isActive({ textAlign: "left" })}
        title="Align left"
        aria-label="Align left"
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
          <line x1="21" x2="3" y1="6" y2="6" />
          <line x1="15" x2="3" y1="12" y2="12" />
          <line x1="17" x2="3" y1="18" y2="18" />
        </svg>
      </ToolbarButton>
      <ToolbarButton
        onClick={() => editor.chain().focus().setTextAlign("center").run()}
        isActive={editor.isActive({ textAlign: "center" })}
        title="Align center"
        aria-label="Align center"
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
          <line x1="21" x2="3" y1="6" y2="6" />
          <line x1="17" x2="7" y1="12" y2="12" />
          <line x1="19" x2="5" y1="18" y2="18" />
        </svg>
      </ToolbarButton>
      <ToolbarButton
        onClick={() => editor.chain().focus().setTextAlign("right").run()}
        isActive={editor.isActive({ textAlign: "right" })}
        title="Align right"
        aria-label="Align right"
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
          <line x1="21" x2="3" y1="6" y2="6" />
          <line x1="21" x2="9" y1="12" y2="12" />
          <line x1="21" x2="7" y1="18" y2="18" />
        </svg>
      </ToolbarButton>
    </BubbleMenu>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getCurrentBlockType(editor: Editor): string {
  if (editor.isActive("heading", { level: 1 })) return "heading-1";
  if (editor.isActive("heading", { level: 2 })) return "heading-2";
  if (editor.isActive("heading", { level: 3 })) return "heading-3";
  if (editor.isActive("heading", { level: 4 })) return "heading-4";
  if (editor.isActive("blockquote")) return "blockquote";
  if (editor.isActive("codeBlock")) return "codeBlock";
  return "paragraph";
}

function handleBlockTypeChange(editor: Editor, type: string): void {
  const chain = editor.chain().focus();

  switch (type) {
    case "paragraph":
      chain.setParagraph().run();
      break;
    case "heading-1":
      chain.toggleHeading({ level: 1 }).run();
      break;
    case "heading-2":
      chain.toggleHeading({ level: 2 }).run();
      break;
    case "heading-3":
      chain.toggleHeading({ level: 3 }).run();
      break;
    case "heading-4":
      chain.toggleHeading({ level: 4 }).run();
      break;
    case "blockquote":
      chain.toggleBlockquote().run();
      break;
    case "codeBlock":
      chain.toggleCodeBlock().run();
      break;
  }
}

// ─── Toolbar Button ──────────────────────────────────────────────────────────

interface ToolbarButtonProps {
  onClick: () => void;
  isActive: boolean;
  title: string;
  children: React.ReactNode;
  "aria-label": string;
}

function ToolbarButton({
  onClick,
  isActive,
  title,
  children,
  "aria-label": ariaLabel,
}: ToolbarButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      aria-label={ariaLabel}
      aria-pressed={isActive}
      className={`
        inline-flex items-center justify-center size-6 text-xs transition-colors
        ${isActive ? "bg-primary/10 text-primary" : "text-muted-foreground hover:text-foreground hover:bg-muted/50"}
      `}
    >
      {children}
    </button>
  );
}
