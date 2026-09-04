import { useEffect, useRef, useState, type ReactNode } from "react";
import { FileText, Loader2, Paperclip, Send, X } from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { ATTACHMENT_ACCEPT, ATTACHMENT_MAX_COUNT, DESCRIPTION_MAX, addFilesToSelection, formatBytes } from "@/lib/support-tickets";

// ─── Attachment strip (shared with the new-ticket form) ──────────────────────

export interface AttachmentPickerProps {
  files: File[];
  onFilesChange: (files: File[]) => void;
  problem: string | null;
  onProblemChange: (problem: string | null) => void;
  disabled?: boolean;
  /** Fallback hint when there is no problem to show. */
  hint?: ReactNode;
  buttonVariant?: "ghost" | "outline";
}

export function useAttachmentSelection() {
  const [files, setFiles] = useState<File[]>([]);
  const [problem, setProblem] = useState<string | null>(null);
  const add = (incoming: Iterable<File> | null | undefined) => {
    if (!incoming) return;
    const next = addFilesToSelection(files, incoming);
    setFiles(next.files);
    setProblem(next.problem);
  };
  const reset = () => {
    setFiles([]);
    setProblem(null);
  };
  return { files, setFiles, problem, setProblem, add, reset };
}

export function AttachmentPicker({ files, onFilesChange, problem, onProblemChange, disabled, hint, buttonVariant = "ghost" }: AttachmentPickerProps) {
  const fileRef = useRef<HTMLInputElement>(null);
  const addFiles = (list: FileList | null) => {
    if (!list) return;
    const next = addFilesToSelection(files, Array.from(list));
    onFilesChange(next.files);
    onProblemChange(next.problem);
  };
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" variant={buttonVariant} size="sm" disabled={disabled || files.length >= ATTACHMENT_MAX_COUNT} onClick={() => fileRef.current?.click()}>
          <Paperclip className="size-4" aria-hidden />
          Attach
        </Button>
        <input ref={fileRef} type="file" multiple accept={ATTACHMENT_ACCEPT} className="sr-only" aria-label="Attach files" onChange={(e) => addFiles(e.target.files)} />
        <span className={cn("text-xs", problem ? "text-destructive" : "text-muted-foreground")} role={problem ? "alert" : undefined}>
          {problem ?? hint ?? `PNG, JPG, WebP, GIF, PDF or text, up to 10 MB each, ${ATTACHMENT_MAX_COUNT} per message.`}
        </span>
      </div>
      {files.length > 0 && <FileChips files={files} onRemove={(i) => onFilesChange(files.filter((_, j) => j !== i))} />}
    </div>
  );
}

export function FileChips({ files, onRemove }: { files: File[]; onRemove: (index: number) => void }) {
  return (
    <ul className="flex flex-wrap gap-2">
      {files.map((f, i) => (
        <li key={`${f.name}-${i}`} className="flex items-center gap-2 rounded-lg border border-border bg-muted/50 py-1 pl-1.5 pr-1 text-xs">
          {f.type.startsWith("image/") ? <FilePreview file={f} /> : <FileText className="size-4 text-muted-foreground" aria-hidden />}
          <span className="max-w-[160px] truncate font-medium text-foreground">{f.name}</span>
          <span className="text-muted-foreground">{formatBytes(f.size)}</span>
          <button type="button" aria-label={`Remove ${f.name}`} onClick={() => onRemove(i)} className="grid size-5 place-items-center rounded text-muted-foreground outline-hidden hover:bg-muted hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50">
            <X className="size-3.5" />
          </button>
        </li>
      ))}
    </ul>
  );
}

function FilePreview({ file }: { file: File }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    const next = URL.createObjectURL(file);
    setUrl(next);
    return () => URL.revokeObjectURL(next);
  }, [file]);
  return url ? <img src={url} alt="" className="size-7 rounded object-cover" /> : <FileText className="size-4 text-muted-foreground" aria-hidden />;
}

// ─── Composer ────────────────────────────────────────────────────────────────

export interface TicketComposerProps {
  onSend: (content: string, files: File[]) => Promise<void> | void;
  busy?: boolean;
  disabled?: boolean;
  placeholder?: string;
  /** Shown under the box, e.g. the expected reply window. */
  hint?: string;
  minLength?: number;
  maxLength?: number;
  autoFocus?: boolean;
  /** Error surfaced from the caller (e.g. rejected by the server). */
  error?: string | null;
}

/**
 * Reply box: grows with the text, takes screenshots and PDFs (pick or
 * paste), sends with Cmd/Ctrl+Enter.
 */
export function TicketComposer({ onSend, busy = false, disabled = false, placeholder = "Write a reply", hint, minLength = 10, maxLength = DESCRIPTION_MAX, autoFocus = false, error }: TicketComposerProps) {
  const [text, setText] = useState("");
  const { files, setFiles, problem, add, reset } = useAttachmentSelection();
  const areaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const el = areaRef.current;
    if (!el) return;
    el.style.height = "0px";
    el.style.height = `${Math.min(el.scrollHeight, 320)}px`;
  }, [text]);

  const trimmed = text.trim();
  const canSend = !busy && !disabled && trimmed.length >= minLength && text.length <= maxLength;

  const submit = async () => {
    if (!canSend) return;
    await onSend(trimmed, files);
    setText("");
    reset();
  };

  const status = problem ?? error ?? (trimmed.length > 0 && trimmed.length < minLength ? `A few more words (at least ${minLength} characters).` : null) ?? hint ?? "Screenshots help. Cmd or Ctrl + Enter to send.";

  return (
    <div className={cn("rounded-2xl border border-border bg-card shadow-sm transition-[border-color,box-shadow] focus-within:border-ring focus-within:ring-[3px] focus-within:ring-ring/30", disabled && "opacity-60")}>
      <textarea
        ref={areaRef}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
            e.preventDefault();
            void submit();
          }
        }}
        onPaste={(e) => {
          const pasted = Array.from(e.clipboardData?.files ?? []);
          if (pasted.length) add(pasted);
        }}
        placeholder={placeholder}
        disabled={disabled || busy}
        autoFocus={autoFocus}
        rows={2}
        maxLength={maxLength + 500}
        aria-label="Your message"
        className="block w-full resize-none bg-transparent px-4 pt-3.5 text-[14.5px] leading-relaxed text-foreground outline-hidden placeholder:text-muted-foreground/70"
      />

      {files.length > 0 && (
        <div className="px-4 pb-2">
          <FileChips files={files} onRemove={(i) => setFiles(files.filter((_, j) => j !== i))} />
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2 border-t border-border px-2.5 py-2">
        <AttachmentPickerButton disabled={disabled || busy || files.length >= ATTACHMENT_MAX_COUNT} onFiles={add} />
        <span className={cn("text-xs", problem || error ? "text-destructive" : "text-muted-foreground")} role={problem || error ? "alert" : undefined}>
          {status}
        </span>
        {text.length > maxLength - 500 && (
          <span className={cn("text-xs tabular-nums", text.length > maxLength ? "text-destructive" : "text-muted-foreground")}>
            {text.length.toLocaleString()} / {maxLength.toLocaleString()}
          </span>
        )}
        <Button type="button" size="sm" className="ml-auto" disabled={!canSend} onClick={() => void submit()}>
          {busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Send className="size-4" aria-hidden />}
          Send
        </Button>
      </div>
    </div>
  );
}

function AttachmentPickerButton({ disabled, onFiles }: { disabled: boolean; onFiles: (files: File[]) => void }) {
  const fileRef = useRef<HTMLInputElement>(null);
  return (
    <>
      <Button type="button" variant="ghost" size="sm" disabled={disabled} onClick={() => fileRef.current?.click()}>
        <Paperclip className="size-4" aria-hidden />
        Attach
      </Button>
      <input
        ref={fileRef}
        type="file"
        multiple
        accept={ATTACHMENT_ACCEPT}
        className="sr-only"
        aria-label="Attach files"
        onChange={(e) => {
          onFiles(Array.from(e.target.files ?? []));
          e.target.value = "";
        }}
      />
    </>
  );
}
