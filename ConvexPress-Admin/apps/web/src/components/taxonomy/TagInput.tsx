/**
 * TagInput - Tag input with autocomplete and removable chips
 *
 * Comma-separated input with autocomplete dropdown matching existing tags
 * (debounced 200ms). Enter or comma to add. Creates new tag on-the-fly
 * via createTag if not exists. Assigned tags shown as removable chips.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import { useMutation } from "convex/react";
import { useQuery } from "convex-helpers/react/cache";
import { toast } from "sonner";

import { api } from "@backend/convex/_generated/api";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { useDebounce } from "@/hooks/useDebounce";

interface TagData {
  _id: string;
  name: string;
  slug: string;
  count: number;
}

interface TagInputProps {
  /** Currently selected tag IDs. */
  selectedTags: TagData[];
  /** Called when a tag is added. */
  onAddTag: (tag: TagData) => void;
  /** Called when a tag is removed. */
  onRemoveTag: (tagId: string) => void;
}

export function TagInput({
  selectedTags,
  onAddTag,
  onRemoveTag,
}: TagInputProps) {
  const [inputValue, setInputValue] = useState("");
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [focusedIndex, setFocusedIndex] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);

  const debouncedSearch = useDebounce(inputValue.trim(), 200);

  const createTag = useMutation(api.taxonomies.mutations.createTag);

  // Fetch suggestions from backend
  const suggestionsResult = useQuery(
    api.taxonomies.queries.list,
    debouncedSearch.length > 0
      ? {
          taxonomy: "post_tag" as const,
          search: debouncedSearch,
          perPage: 10,
          orderBy: "count" as const,
          orderDir: "desc" as const,
        }
      : "skip",
  );

  const suggestions: TagData[] =
    suggestionsResult?.terms
      ?.filter(
        (t: { _id: string }) => !selectedTags.some((st) => st._id === t._id),
      )
      ?.map((t: { _id: string; name: string; slug: string; count: number }) => ({
        _id: t._id,
        name: t.name,
        slug: t.slug,
        count: t.count,
      })) ?? [];

  useEffect(() => {
    setShowSuggestions(suggestions.length > 0 && inputValue.trim().length > 0);
    setFocusedIndex(-1);
  }, [suggestions.length, inputValue]);

  const addTagByName = useCallback(
    async (name: string) => {
      const trimmed = name.trim();
      if (!trimmed) return;

      // Check if already selected
      if (
        selectedTags.some(
          (t) => t.name.toLowerCase() === trimmed.toLowerCase(),
        )
      ) {
        return;
      }

      // Check if exists in suggestions
      const existing = suggestions.find(
        (t) => t.name.toLowerCase() === trimmed.toLowerCase(),
      );

      if (existing) {
        onAddTag(existing);
      } else {
        // Create the tag on-the-fly
        try {
          const newId = await createTag({ name: trimmed });
          onAddTag({
            _id: newId as string,
            name: trimmed,
            slug: trimmed
              .toLowerCase()
              .replace(/[^\w\s-]/g, "")
              .replace(/\s+/g, "-"),
            count: 0,
          });
        } catch (err: unknown) {
          const message =
            err instanceof Error ? err.message : "Failed to create tag.";
          toast.error(message);
          return;
        }
      }

      setInputValue("");
      setShowSuggestions(false);
    },
    [selectedTags, suggestions, onAddTag, createTag],
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter" || e.key === ",") {
        e.preventDefault();
        if (focusedIndex >= 0 && suggestions[focusedIndex]) {
          onAddTag(suggestions[focusedIndex]);
          setInputValue("");
          setShowSuggestions(false);
        } else {
          addTagByName(inputValue);
        }
        return;
      }

      if (e.key === "ArrowDown" && showSuggestions) {
        e.preventDefault();
        setFocusedIndex((prev) =>
          Math.min(prev + 1, suggestions.length - 1),
        );
        return;
      }

      if (e.key === "ArrowUp" && showSuggestions) {
        e.preventDefault();
        setFocusedIndex((prev) => Math.max(prev - 1, -1));
        return;
      }

      if (e.key === "Escape") {
        setShowSuggestions(false);
        setFocusedIndex(-1);
        return;
      }
    },
    [
      focusedIndex,
      suggestions,
      showSuggestions,
      inputValue,
      addTagByName,
      onAddTag,
    ],
  );

  return (
    <div>
      {/* Input with autocomplete */}
      <div className="relative">
        <Input
          ref={inputRef}
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyDown={handleKeyDown}
          onBlur={() => {
            setTimeout(() => setShowSuggestions(false), 200);
          }}
          placeholder="Add tag"
          className="h-7 text-xs"
          aria-label="Add tag"
          aria-autocomplete="list"
          aria-expanded={showSuggestions}
        />

        {showSuggestions && suggestions.length > 0 && (
          <div className="absolute z-20 top-full left-0 right-0 mt-0.5 border border-border bg-card max-h-40 overflow-y-auto">
            {suggestions.map((tag, index) => (
              <button
                key={tag._id}
                type="button"
                onClick={() => {
                  onAddTag(tag);
                  setInputValue("");
                  setShowSuggestions(false);
                  inputRef.current?.focus();
                }}
                className={cn(
                  "w-full text-left px-2.5 py-1 text-xs hover:bg-muted",
                  focusedIndex === index && "bg-muted",
                )}
              >
                {tag.name}
                <span className="text-muted-foreground ml-1">
                  ({tag.count})
                </span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Selected tag chips */}
      {selectedTags.length > 0 && (
        <div
          className="flex flex-wrap gap-1 mt-2"
          role="list"
          aria-label="Selected tags"
        >
          {selectedTags.map((tag) => (
            <span
              key={tag._id}
              role="listitem"
              className="inline-flex items-center gap-1 bg-muted px-2 py-0.5 text-xs rounded-none"
            >
              {tag.name}
              <button
                type="button"
                onClick={() => {
                  onRemoveTag(tag._id);
                  inputRef.current?.focus();
                }}
                className="text-muted-foreground hover:text-foreground"
                aria-label={`Remove tag: ${tag.name}`}
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
