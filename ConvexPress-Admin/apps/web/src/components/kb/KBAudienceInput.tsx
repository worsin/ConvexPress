/**
 * KB Audience Input
 *
 * Free-form audience labels for a KB article (for example "doctor" or
 * "staff"). ConvexPress stores them for integrators and never interprets
 * them. Enter or comma adds a label; labels are normalized with the same
 * rules the backend enforces (lowercase, 1–48 letters, digits, hyphens or
 * underscores, at most 16).
 */

import { useState } from "react";
import { X } from "lucide-react";
import { MAX_KB_AUDIENCES, parseKbAudience } from "@backend/convex/kb/helpers/visibility";

interface KBAudienceInputProps {
  audiences: string[];
  onChange: (audiences: string[]) => void;
}

export function KBAudienceInput({ audiences, onChange }: KBAudienceInputProps) {
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const full = audiences.length >= MAX_KB_AUDIENCES;

  function add(raw: string) {
    if (!raw.trim()) return;
    const audience = parseKbAudience(raw);
    if (audience === null) {
      setError("Use lowercase letters, digits, hyphens or underscores (up to 48), starting with a letter or digit.");
      return;
    }
    if (!audiences.includes(audience)) {
      if (full) {
        setError(`An article can have at most ${MAX_KB_AUDIENCES} audiences.`);
        return;
      }
      onChange([...audiences, audience]);
    }
    setDraft("");
    setError(null);
  }

  return (
    <div>
      <input
        type="text"
        value={draft}
        onChange={(e) => { setDraft(e.target.value); setError(null); }}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === ",") {
            e.preventDefault();
            add(draft);
          }
        }}
        onBlur={() => add(draft)}
        placeholder={full ? "Audience limit reached" : "Add audience, e.g. staff"}
        disabled={full}
        aria-label="Add audience"
        aria-invalid={error !== null}
        className="w-full px-2 py-1.5 text-sm border border-border rounded-md bg-background disabled:opacity-50"
      />
      {error && <p className="text-xs text-destructive mt-1">{error}</p>}
      {audiences.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-2" role="list" aria-label="Audiences">
          {audiences.map((audience) => (
            <span
              key={audience}
              role="listitem"
              className="inline-flex items-center gap-1 bg-muted px-2 py-0.5 text-xs rounded-md font-mono"
            >
              {audience}
              <button
                type="button"
                onClick={() => onChange(audiences.filter((a) => a !== audience))}
                className="text-muted-foreground hover:text-foreground"
                aria-label={`Remove audience: ${audience}`}
              >
                <X className="size-3" />
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
