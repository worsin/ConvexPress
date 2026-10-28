/**
 * The knowledge-base article editor.
 *
 * WYSIWYG on TipTap, writing KbDoc directly (see extensions.ts): the writing
 * surface uses the published article's `kb-doc` styles, and Preview renders
 * through the backend's own renderer. Screenshots can be pasted or dropped
 * straight in; they upload to the media library and land as framed figures.
 * Type "/" on an empty line for blocks.
 */
import type { JSONContent } from "@tiptap/core";
import { EditorContent, useEditor, useEditorState, type Editor } from "@tiptap/react";
import {
  Bold,
  Code,
  Code2,
  Eye,
  HelpCircle,
  Info,
  Italic,
  Keyboard,
  Link2,
  List,
  ListOrdered,
  Loader2,
  Minus,
  MousePointerClick,
  Pencil,
  Quote,
  Redo2,
  Strikethrough,
  Table2,
  Underline,
  Undo2,
  Footprints,
} from "lucide-react";
import { useCallback, useMemo, useRef, useState, type ReactNode } from "react";
import { toast } from "sonner";

import type { Id } from "@backend/convex/_generated/dataModel";
import { MediaPicker } from "@/components/media/MediaPicker";
import { cn } from "@/lib/utils";

import { kbEditorExtensions, type KbNodeViews, type SlashItem, type SlashMenuState } from "./extensions";
import { CalloutView, DetailsView, FigureView } from "./nodeviews";
import { KbArticlePreview } from "./KbArticlePreview";
import { LinkDialog, type KbLinkValue } from "./LinkDialog";
import { useKbMediaUpload } from "./useKbMediaUpload";
import "./kb-doc.css";
import "./kb-editor.css";

export type KbEditorProps = {
  /** The document to start from (KbDoc JSON). Later changes to it are ignored; remount to reset. */
  initialContent: string;
  onChange: (json: string) => void;
  currentArticleId?: Id<"kb_articles">;
  placeholder?: string;
};

function parseInitial(content: string): JSONContent | undefined {
  try {
    const parsed: unknown = JSON.parse(content);
    return parsed && typeof parsed === "object" && (parsed as { type?: unknown }).type === "doc" ? (parsed as JSONContent) : undefined;
  } catch {
    return undefined;
  }
}

function ToolButton({ label, active, disabled, onClick, children }: { label: string; active?: boolean; disabled?: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      aria-pressed={active}
      disabled={disabled}
      onMouseDown={(event) => event.preventDefault()}
      onClick={onClick}
      className={cn("inline-flex h-8 w-8 items-center justify-center rounded-md text-foreground/70 hover:bg-muted hover:text-foreground disabled:opacity-30", active && "bg-primary/10 text-primary")}
    >
      {children}
    </button>
  );
}

/**
 * Rendered once the editor exists. useEditorState keeps the snapshot it was
 * created with until the next transaction, so a count kept beside useEditor
 * (whose editor starts as null) read 0 words on every article until it was
 * edited.
 */
function WordCount({ editor }: { editor: Editor }) {
  const words = useEditorState({ editor, selector: ({ editor: e }) => (e.storage.characterCount as { words: () => number }).words() });
  return <>{words === 1 ? "1 word" : `${words} words`}</>;
}

function Divider() {
  return <span className="mx-1 h-5 w-px bg-border" aria-hidden="true" />;
}

function Toolbar({ editor, onLink, onImage }: { editor: Editor; onLink: () => void; onImage: (mediaId: Id<"media">) => void }) {
  const state = useEditorState({
    editor,
    selector: ({ editor: e }) => ({
      block: e.isActive("heading", { level: 2 }) ? "h2" : e.isActive("heading", { level: 3 }) ? "h3" : e.isActive("heading", { level: 4 }) ? "h4" : "p",
      bold: e.isActive("bold"),
      italic: e.isActive("italic"),
      underline: e.isActive("underline"),
      strike: e.isActive("strike"),
      code: e.isActive("code"),
      kbd: e.isActive("kbd"),
      ui: e.isActive("ui"),
      link: e.isActive("link"),
      bullet: e.isActive("bulletList"),
      ordered: e.isActive("orderedList") && !e.isActive("orderedList", { kind: "steps" }),
      steps: e.isActive("orderedList", { kind: "steps" }),
      callout: e.isActive("callout"),
      table: e.isActive("table"),
      canUndo: e.can().undo(),
      canRedo: e.can().redo(),
    }),
  });
  const chain = () => editor.chain().focus();
  return (
    <div className="sticky top-0 z-10 flex flex-wrap items-center gap-0.5 border-b border-border bg-card/95 px-2 py-1.5 backdrop-blur" role="toolbar" aria-label="Formatting">
      <ToolButton label="Undo" disabled={!state.canUndo} onClick={() => chain().undo().run()}>
        <Undo2 className="h-4 w-4" />
      </ToolButton>
      <ToolButton label="Redo" disabled={!state.canRedo} onClick={() => chain().redo().run()}>
        <Redo2 className="h-4 w-4" />
      </ToolButton>
      <Divider />
      <select
        aria-label="Text style"
        className="h-8 rounded-md border border-border bg-background px-2 text-xs"
        value={state.block}
        onChange={(event) => {
          const value = event.target.value;
          if (value === "p") chain().setParagraph().run();
          else chain().setHeading({ level: Number(value.slice(1)) as 2 | 3 | 4 }).run();
        }}
      >
        <option value="p">Paragraph</option>
        <option value="h2">Heading</option>
        <option value="h3">Subheading</option>
        <option value="h4">Small heading</option>
      </select>
      <Divider />
      <ToolButton label="Bold (⌘B)" active={state.bold} onClick={() => chain().toggleBold().run()}>
        <Bold className="h-4 w-4" />
      </ToolButton>
      <ToolButton label="Italic (⌘I)" active={state.italic} onClick={() => chain().toggleItalic().run()}>
        <Italic className="h-4 w-4" />
      </ToolButton>
      <ToolButton label="Underline (⌘U)" active={state.underline} onClick={() => chain().toggleUnderline().run()}>
        <Underline className="h-4 w-4" />
      </ToolButton>
      <ToolButton label="Strikethrough" active={state.strike} onClick={() => chain().toggleStrike().run()}>
        <Strikethrough className="h-4 w-4" />
      </ToolButton>
      <ToolButton label="On-screen label, e.g. the Save button (⌘⇧L)" active={state.ui} onClick={() => chain().toggleUiLabel().run()}>
        <MousePointerClick className="h-4 w-4" />
      </ToolButton>
      <ToolButton label="Keyboard key" active={state.kbd} onClick={() => chain().toggleKbd().run()}>
        <Keyboard className="h-4 w-4" />
      </ToolButton>
      <ToolButton label="Inline code" active={state.code} onClick={() => chain().toggleCode().run()}>
        <Code className="h-4 w-4" />
      </ToolButton>
      <ToolButton label="Link (⌘K)" active={state.link} onClick={onLink}>
        <Link2 className="h-4 w-4" />
      </ToolButton>
      <Divider />
      <ToolButton label="Bulleted list" active={state.bullet} onClick={() => chain().toggleBulletList().run()}>
        <List className="h-4 w-4" />
      </ToolButton>
      <ToolButton label="Numbered list" active={state.ordered} onClick={() => chain().toggleOrderedList().run()}>
        <ListOrdered className="h-4 w-4" />
      </ToolButton>
      <ToolButton label="Steps" active={state.steps} onClick={() => chain().toggleSteps().run()}>
        <Footprints className="h-4 w-4" />
      </ToolButton>
      <ToolButton label="Callout" active={state.callout} onClick={() => (state.callout ? chain().lift("callout").run() : chain().setCallout("tip").run())}>
        <Info className="h-4 w-4" />
      </ToolButton>
      <ToolButton label="Question that opens (FAQ)" onClick={() => chain().insertDetails().run()}>
        <HelpCircle className="h-4 w-4" />
      </ToolButton>
      <ToolButton label="Table" active={state.table} onClick={() => chain().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()}>
        <Table2 className="h-4 w-4" />
      </ToolButton>
      <ToolButton label="Code block" onClick={() => chain().toggleCodeBlock().run()}>
        <Code2 className="h-4 w-4" />
      </ToolButton>
      <ToolButton label="Quote" onClick={() => chain().toggleBlockquote().run()}>
        <Quote className="h-4 w-4" />
      </ToolButton>
      <ToolButton label="Divider" onClick={() => chain().setHorizontalRule().run()}>
        <Minus className="h-4 w-4" />
      </ToolButton>
      <Divider />
      <span className="kb-editor-media-button">
        <MediaPicker label="Image" allowedTypes={["image", "video"]} onSelect={onImage} />
      </span>
      {state.table && (
        <div className="ml-1 flex items-center gap-1 text-xs" aria-label="Table">
          {[
            ["+ Row", () => chain().addRowAfter().run()],
            ["+ Column", () => chain().addColumnAfter().run()],
            ["− Row", () => chain().deleteRow().run()],
            ["− Column", () => chain().deleteColumn().run()],
            ["Header row", () => chain().toggleHeaderRow().run()],
            ["Delete table", () => chain().deleteTable().run()],
          ].map(([label, run]) => (
            <button key={label as string} type="button" onMouseDown={(event) => event.preventDefault()} onClick={run as () => void} className="rounded-md border border-border px-2 py-1 hover:bg-muted">
              {label as string}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function SlashMenu({ state, onPick }: { state: NonNullable<SlashMenuState>; onPick: (item: SlashItem) => void }) {
  if (!state.rect || state.items.length === 0) return null;
  return (
    <div
      className="fixed z-50 w-64 overflow-hidden rounded-lg border border-border bg-card py-1 shadow-lg"
      style={{ top: state.rect.bottom + 6, left: state.rect.left }}
      role="listbox"
      aria-label="Insert block"
    >
      {state.items.map((item, index) => (
        <button
          key={item.title}
          type="button"
          role="option"
          aria-selected={index === state.selected}
          onMouseDown={(event) => {
            event.preventDefault();
            onPick(item);
          }}
          className={cn("flex w-full items-baseline justify-between gap-3 px-3 py-1.5 text-left text-sm", index === state.selected ? "bg-primary/10" : "hover:bg-muted")}
        >
          <span>{item.title}</span>
          <span className="text-[11px] text-foreground/50">{item.hint}</span>
        </button>
      ))}
    </div>
  );
}

const NODE_VIEWS: KbNodeViews = { callout: CalloutView, figure: FigureView, details: DetailsView };

export function KbEditor({ initialContent, onChange, currentArticleId, placeholder = "Write, or type “/” for headings, steps, tips, images and more…" }: KbEditorProps) {
  const [mode, setMode] = useState<"write" | "preview">("write");
  const [slash, setSlash] = useState<SlashMenuState>(null);
  const slashRef = useRef<SlashMenuState>(null);
  const slashKey = useRef<((event: KeyboardEvent) => boolean) | null>(null);
  const [linkOpen, setLinkOpen] = useState(false);
  const [uploading, setUploading] = useState(0);
  const upload = useKbMediaUpload();
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  const setSlashState = useCallback((state: SlashMenuState) => {
    slashRef.current = state;
    setSlash(state);
  }, []);
  slashKey.current = (event) => {
    const state = slashRef.current;
    if (!state || state.items.length === 0) return false;
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      const delta = event.key === "ArrowDown" ? 1 : -1;
      setSlashState({ ...state, selected: (state.selected + delta + state.items.length) % state.items.length });
      return true;
    }
    if (event.key === "Enter" || event.key === "Tab") {
      state.command(state.items[state.selected]!);
      return true;
    }
    return false;
  };

  const extensions = useMemo(() => kbEditorExtensions({ placeholder, nodeViews: NODE_VIEWS, onSlashMenu: setSlashState, slashKey }), [placeholder, setSlashState]);

  const uploadFiles = useRef<(files: File[], at?: number) => void>(() => {});
  const editor = useEditor({
    extensions,
    content: parseInitial(initialContent),
    immediatelyRender: false,
    editorProps: {
      attributes: { class: "kb-doc kb-editor-content", "aria-label": "Article content" },
      handlePaste: (_view, event) => {
        const files = Array.from(event.clipboardData?.files ?? []).filter((file) => file.type.startsWith("image/") || file.type.startsWith("video/"));
        if (!files.length) return false;
        event.preventDefault();
        uploadFiles.current(files);
        return true;
      },
      handleDrop: (view, event) => {
        const files = Array.from(event.dataTransfer?.files ?? []).filter((file) => file.type.startsWith("image/") || file.type.startsWith("video/"));
        if (!files.length) return false;
        event.preventDefault();
        const at = view.posAtCoords({ left: event.clientX, top: event.clientY })?.pos;
        uploadFiles.current(files, at);
        return true;
      },
      handleKeyDown: (_view, event) => {
        if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
          event.preventDefault();
          setLinkOpen(true);
          return true;
        }
        return false;
      },
    },
    onUpdate: ({ editor: e }) => onChangeRef.current(JSON.stringify(e.getJSON())),
  });

  uploadFiles.current = (files, at) => {
    if (!editor) return;
    void (async () => {
      for (const file of files) {
        setUploading((count) => count + 1);
        try {
          const mediaId = await upload(file);
          const chain = editor.chain().focus();
          if (at !== undefined) chain.insertContentAt(at, { type: "figure", attrs: { mediaId, frame: "screenshot" } }).run();
          else chain.insertFigure({ mediaId }).run();
        } catch (error) {
          toast.error(error instanceof Error ? `Couldn't upload ${file.name}: ${error.message}` : `Couldn't upload ${file.name}`);
        } finally {
          setUploading((count) => count - 1);
        }
      }
    })();
  };

  const linkInitial = useMemo<KbLinkValue | null>(() => {
    if (!editor || !linkOpen) return null;
    const attrs = editor.getAttributes("link") as Partial<KbLinkValue>;
    return attrs.href || attrs.articleId ? { href: attrs.href ?? null, articleId: attrs.articleId ?? null, anchor: attrs.anchor ?? null } : null;
  }, [editor, linkOpen]);

  if (!editor) {
    return (
      <div className="flex h-48 items-center justify-center rounded-lg border border-border">
        <Loader2 className="h-5 w-5 animate-spin text-foreground/40" />
      </div>
    );
  }

  return (
    <div className="kb-editor rounded-lg border border-border bg-card">
      <div className="flex items-center justify-between border-b border-border px-2 py-1">
        <div className="flex gap-1" role="tablist" aria-label="Editor mode">
          {(["write", "preview"] as const).map((value) => (
            <button
              key={value}
              type="button"
              role="tab"
              aria-selected={mode === value}
              onClick={() => setMode(value)}
              className={cn("inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs", mode === value ? "bg-muted font-medium" : "text-foreground/60 hover:text-foreground")}
            >
              {value === "write" ? <Pencil className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
              {value === "write" ? "Write" : "Preview"}
            </button>
          ))}
        </div>
        <span className="text-[11px] text-foreground/50" aria-live="polite">
          {uploading > 0 ? `Uploading ${uploading} image${uploading === 1 ? "" : "s"}…` : <WordCount editor={editor} />}
        </span>
      </div>
      {mode === "write" ? (
        <>
          <Toolbar editor={editor} onLink={() => setLinkOpen(true)} onImage={(mediaId) => editor.chain().focus().insertFigure({ mediaId }).run()} />
          <EditorContent editor={editor} />
          {slash && <SlashMenu state={slash} onPick={(item) => slash.command(item)} />}
        </>
      ) : (
        <div className="px-6 py-5">
          <KbArticlePreview doc={editor.getJSON()} />
        </div>
      )}
      <LinkDialog
        open={linkOpen}
        initial={linkInitial}
        currentArticleId={currentArticleId}
        onOpenChange={setLinkOpen}
        onRemove={() => editor.chain().focus().extendMarkRange("link").unsetLink().run()}
        onSubmit={(value, label) => {
          const chain = editor.chain().focus().extendMarkRange("link");
          if (editor.state.selection.empty && !editor.isActive("link")) {
            chain.insertContent({ type: "text", text: label, marks: [{ type: "link", attrs: value }] }).run();
          } else chain.setMark("link", value).run();
        }}
      />
    </div>
  );
}
