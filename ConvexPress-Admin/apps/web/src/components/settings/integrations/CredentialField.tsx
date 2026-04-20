/**
 * CredentialField — masked secret input with Replace flow.
 *
 * Three visual states:
 *   - "masked" — backend returned the SECRET_SENTINEL ("__set__"). Shows a
 *      `•••• set` badge + "Replace" button. The saved value stays on the
 *      server; user has to explicitly opt into editing.
 *   - "editing" — user clicked Replace (or the field is empty). Shows a
 *      password-style input with eye-toggle visibility + paste support.
 *   - "empty" — no value ever saved. Same as editing, minus the cancel.
 *
 * The component owns no form state; it's controlled by the parent. Parent
 * passes `value = null` to mean "user typed nothing new, keep the masked
 * server value" and passes a plaintext string when the user is actively
 * entering a new secret.
 */

import { useState } from "react";
import { Eye, EyeOff, KeyRound, Pencil } from "lucide-react";

import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

export const SECRET_SENTINEL = "__set__";

export interface CredentialFieldProps {
  id: string;
  label: string;
  /** Current value from backend or form state. */
  value: string | null | undefined;
  /**
   * Called with the *new plaintext* the user is typing. `null` means
   * "user clicked Replace and hasn't typed yet — parent should not send
   * this field on save." Empty string means "user cleared the field —
   * parent should treat this as 'remove the stored secret'."
   */
  onChange: (next: string | null) => void;
  placeholder?: string;
  /** Short instructions or link to where to find this key. */
  help?: React.ReactNode;
  /** Zod / inline error to render below the field. */
  error?: string | null;
  disabled?: boolean;
  /** Use `password` for true secrets, `text` for values that are only
   * sensitive-ish (client IDs). Default `password`. */
  inputType?: "password" | "text";
}

export function CredentialField({
  id,
  label,
  value,
  onChange,
  placeholder,
  help,
  error,
  disabled,
  inputType = "password",
}: CredentialFieldProps) {
  const isMaskedStored = value === SECRET_SENTINEL;
  const [editing, setEditing] = useState(!isMaskedStored && value !== undefined);
  const [visible, setVisible] = useState(false);

  function startEdit() {
    setEditing(true);
    // Clear the masked sentinel — parent receives null until user types.
    onChange(null);
  }

  function cancelEdit() {
    setEditing(false);
    setVisible(false);
    // Restore the masked state on the parent side.
    onChange(SECRET_SENTINEL as any);
  }

  return (
    <div className="grid gap-2">
      <Label htmlFor={id} className="text-sm font-medium text-foreground">
        {label}
      </Label>

      {isMaskedStored && !editing ? (
        <div className="flex items-center gap-2">
          <div className="inline-flex items-center gap-2 rounded-full border border-border bg-muted/60 px-3 py-1.5 text-xs">
            <KeyRound className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="font-mono">•••• saved</span>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={startEdit}
            disabled={disabled}
          >
            <Pencil className="mr-1.5 h-3.5 w-3.5" />
            Replace
          </Button>
        </div>
      ) : (
        <div className="relative flex items-center gap-2">
          <Input
            id={id}
            type={inputType === "password" && !visible ? "password" : "text"}
            value={typeof value === "string" && value !== SECRET_SENTINEL ? value : ""}
            onChange={(e) => onChange(e.target.value)}
            placeholder={placeholder}
            disabled={disabled}
            autoComplete="off"
            spellCheck={false}
            aria-invalid={error ? true : undefined}
            className={cn("pr-12", error && "border-destructive")}
          />
          {inputType === "password" && (
            <button
              type="button"
              onClick={() => setVisible((v) => !v)}
              className="absolute right-14 flex h-9 w-9 items-center justify-center rounded-full text-muted-foreground hover:bg-muted"
              aria-label={visible ? "Hide" : "Show"}
              tabIndex={-1}
            >
              {visible ? (
                <EyeOff className="h-4 w-4" />
              ) : (
                <Eye className="h-4 w-4" />
              )}
            </button>
          )}
          {isMaskedStored && editing && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={cancelEdit}
              disabled={disabled}
            >
              Cancel
            </Button>
          )}
        </div>
      )}

      {error ? (
        <p className="text-xs text-destructive">{error}</p>
      ) : help ? (
        <p className="text-xs text-muted-foreground">{help}</p>
      ) : null}
    </div>
  );
}
