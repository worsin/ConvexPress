/**
 * TopicsListEditor - Dynamic array of topic sections (0-5)
 *
 * Manages adding/removing topics with an "Add Topic" button.
 * Renders a TopicSectionEditor for each topic in the array.
 */

import { useCallback } from "react";
import { Plus } from "lucide-react";
import { TopicSectionEditor } from "./TopicSectionEditor";
import type { TopicFields } from "@/types/editor";
import { DEFAULT_TOPIC } from "@/types/editor";

const MAX_TOPICS = 5;

interface TopicsListEditorProps {
  value: TopicFields[];
  onChange: (topics: TopicFields[]) => void;
  onRegenerateTopic?: (index: number) => void;
}

export function TopicsListEditor({
  value,
  onChange,
  onRegenerateTopic,
}: TopicsListEditorProps) {
  const handleAdd = useCallback(() => {
    if (value.length >= MAX_TOPICS) return;
    onChange([...value, { ...DEFAULT_TOPIC }]);
  }, [value, onChange]);

  const handleRemove = useCallback(
    (index: number) => {
      onChange(value.filter((_, i) => i !== index));
    },
    [value, onChange],
  );

  const handleChange = useCallback(
    (index: number, topic: TopicFields) => {
      const updated = [...value];
      updated[index] = topic;
      onChange(updated);
    },
    [value, onChange],
  );

  return (
    <div className="space-y-3">
      {value.map((topic, index) => (
        <TopicSectionEditor
          key={`topic-${index}-${topic.title || "empty"}`}
          index={index}
          value={topic}
          onChange={(t) => handleChange(index, t)}
          onRemove={() => handleRemove(index)}
          onRegenerate={onRegenerateTopic ? () => onRegenerateTopic(index) : undefined}
        />
      ))}

      {value.length < MAX_TOPICS && (
        <button
          type="button"
          onClick={handleAdd}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground border border-dashed border-border hover:border-primary/50 transition-colors w-full justify-center"
        >
          <Plus className="size-3.5" />
          Add Topic ({value.length}/{MAX_TOPICS})
        </button>
      )}

      {value.length === 0 && (
        <p className="text-xs text-muted-foreground text-center py-2">
          No topics yet. Click "Add Topic" to create one.
        </p>
      )}
    </div>
  );
}
