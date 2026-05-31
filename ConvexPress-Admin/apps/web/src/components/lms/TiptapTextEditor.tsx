import { type ReactNode, useEffect, useRef, useState } from "react";
import {
  Bold,
  Heading2,
  Italic,
  List,
  ListOrdered,
  Quote,
  Redo2,
  Undo2,
} from "lucide-react";

interface TiptapTextEditorProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  minHeightClassName?: string;
}

export function TiptapTextEditor({
  label,
  value,
  onChange,
  placeholder,
  minHeightClassName = "min-h-48",
}: TiptapTextEditorProps) {
  const editorRef = useRef<HTMLDivElement | null>(null);
  const [focused, setFocused] = useState(false);

  useEffect(() => {
    const editor = editorRef.current;
    if (!editor || focused) return;
    if (normalizeText(editor.innerText) !== normalizeText(value)) {
      editor.innerText = value;
    }
  }, [focused, value]);

  function run(command: string, argument?: string) {
    editorRef.current?.focus();
    document.execCommand(command, false, argument);
    emitChange();
  }

  function emitChange() {
    const text = normalizeText(editorRef.current?.innerText ?? "");
    onChange(text);
  }

  const isEmpty = normalizeText(value).length === 0;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-3">
        <label className="text-sm font-medium" htmlFor={editorId(label)}>
          {label}
        </label>
        <div className="flex items-center gap-1 rounded-md border border-border bg-background p-1">
          <EditorButton title="Bold" onClick={() => run("bold")}>
            <Bold className="h-4 w-4" />
          </EditorButton>
          <EditorButton title="Italic" onClick={() => run("italic")}>
            <Italic className="h-4 w-4" />
          </EditorButton>
          <EditorButton title="Heading" onClick={() => run("formatBlock", "h2")}>
            <Heading2 className="h-4 w-4" />
          </EditorButton>
          <EditorButton
            title="Block quote"
            onClick={() => run("formatBlock", "blockquote")}
          >
            <Quote className="h-4 w-4" />
          </EditorButton>
          <EditorButton title="Bulleted list" onClick={() => run("insertUnorderedList")}>
            <List className="h-4 w-4" />
          </EditorButton>
          <EditorButton title="Numbered list" onClick={() => run("insertOrderedList")}>
            <ListOrdered className="h-4 w-4" />
          </EditorButton>
          <EditorButton title="Undo" onClick={() => run("undo")}>
            <Undo2 className="h-4 w-4" />
          </EditorButton>
          <EditorButton title="Redo" onClick={() => run("redo")}>
            <Redo2 className="h-4 w-4" />
          </EditorButton>
        </div>
      </div>
      <div className="relative">
        <div
          ref={editorRef}
          id={editorId(label)}
          role="textbox"
          aria-label={label}
          aria-multiline="true"
          contentEditable
          suppressContentEditableWarning
          onFocus={() => setFocused(true)}
          onBlur={() => {
            setFocused(false);
            emitChange();
          }}
          onInput={emitChange}
          className={`${minHeightClassName} w-full rounded-md border border-border bg-background px-3 py-2 text-sm leading-6 outline-none focus:border-primary`}
        />
        {isEmpty && !focused && placeholder ? (
          <div className="pointer-events-none absolute left-3 top-2 text-sm text-muted-foreground">
            {placeholder}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function EditorButton({
  title,
  children,
  onClick,
}: {
  title: string;
  children: ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      onMouseDown={(event) => event.preventDefault()}
      onClick={onClick}
      className="inline-flex h-8 w-8 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground"
    >
      {children}
    </button>
  );
}

function normalizeText(value: string) {
  return value.replace(/\u00a0/g, " ").replace(/\n{3,}/g, "\n\n").trim();
}

function editorId(label: string) {
  return `lms-editor-${label.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
}
