/**
 * The in-app help spots an article shows in: chips, with registered spots
 * offered as you type. Keys apps haven't registered are allowed (they show
 * as "not registered" on the In-app help page until an app registers them).
 */
import { useQuery } from "convex-helpers/react/cache";
import { X } from "lucide-react";
import { useId, useState } from "react";

import { api } from "@backend/convex/_generated/api";
import { HELP_CONTEXT_KEY_PATTERN } from "@backend/convex/kb/helpers/help";

export function KBHelpSpotsInput({ spots, onChange }: { spots: string[]; onChange: (next: string[]) => void }) {
  const registered = useQuery(api.kb.helpContexts.list) ?? [];
  const [draft, setDraft] = useState("");
  const listId = useId();
  const labelOf = (key: string) => registered.find((spot) => spot.key === key)?.label;

  function add(raw: string) {
    const key = raw.trim().toLowerCase();
    if (!key) return;
    // A label typed from the suggestions resolves to its key.
    const byLabel = registered.find((spot) => spot.label.toLowerCase() === key);
    const resolved = byLabel?.key ?? key;
    if (!HELP_CONTEXT_KEY_PATTERN.test(resolved) || spots.includes(resolved)) return;
    onChange([...spots, resolved]);
    setDraft("");
  }

  return (
    <div className="space-y-1.5">
      {spots.length > 0 && (
        <ul className="flex flex-wrap gap-1.5">
          {spots.map((key) => (
            <li key={key} className="inline-flex max-w-full items-center gap-1 rounded-full border border-border bg-muted px-2 py-0.5 text-[11px]">
              <span className="truncate" title={key}>
                {labelOf(key) ?? key}
              </span>
              <button type="button" aria-label={`Remove ${labelOf(key) ?? key}`} onClick={() => onChange(spots.filter((item) => item !== key))} className="text-foreground/50 hover:text-foreground">
                <X className="h-3 w-3" />
              </button>
            </li>
          ))}
        </ul>
      )}
      <input
        list={listId}
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === ",") {
            event.preventDefault();
            add(draft);
          }
        }}
        onBlur={() => add(draft)}
        placeholder="Add a spot, e.g. doctor.cases.list"
        className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-xs font-mono"
      />
      <datalist id={listId}>
        {registered
          .filter((spot) => !spots.includes(spot.key))
          .map((spot) => (
            <option key={spot.key} value={spot.key}>
              {spot.label}
            </option>
          ))}
      </datalist>
    </div>
  );
}
