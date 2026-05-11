import { cn } from "@/lib/utils";
import { Label } from "@/components/ui/label";

interface BioEditorProps {
  value: string;
  onChange: (value: string) => void;
  maxLength?: number;
  error?: string;
}

/**
 * Textarea with character counter for the bio field.
 */
export function BioEditor({
  value,
  onChange,
  maxLength = 500,
  error,
}: BioEditorProps) {
  const charCount = value.length;
  const isOverLimit = charCount >= maxLength;

  return (
    <div data-slot="bio-editor" className="space-y-1.5">
      <Label htmlFor="bio-textarea">Biographical Info</Label>
      <textarea
        id="bio-textarea"
        rows={5}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        maxLength={maxLength}
        placeholder="Share a little biographical information..."
        className={cn(
          "dark:bg-input/30 border-input focus-visible:border-ring focus-visible:ring-ring/50",
          "w-full resize-y rounded-none border bg-transparent px-2.5 py-2 text-xs",
          "placeholder:text-muted-foreground outline-hidden transition-colors focus-visible:ring-1",
          error && "border-destructive",
        )}
        aria-invalid={Boolean(error)}
        aria-describedby="bio-helper bio-counter"
      />
      <div className="flex items-center justify-between">
        <p id="bio-helper" className="text-[10px] text-muted-foreground">
          Share a little biographical information. This may be shown publicly.
        </p>
        <span
          id="bio-counter"
          className={cn(
            "text-[10px] tabular-nums",
            isOverLimit ? "text-destructive" : "text-muted-foreground",
          )}
        >
          {charCount}/{maxLength}
        </span>
      </div>
      {error && (
        <p className="text-[10px] text-destructive" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
