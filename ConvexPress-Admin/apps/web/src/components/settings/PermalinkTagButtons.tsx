/**
 * PermalinkTagButtons - Row of tag insertion buttons for custom permalink input.
 *
 * Clicking a tag inserts it at the cursor position in the custom structure input.
 */

import * as React from "react";

import { Button } from "@/components/ui/button";
import type { SettingsFieldApi } from "./fields/types";

interface PermalinkTagButtonsProps {
  /** Reference to the custom structure input element */
  inputRef: React.RefObject<HTMLInputElement | null>;
  /** TanStack Form field for customStructure */
  field: SettingsFieldApi;
}

const PERMALINK_TAGS = [
  { tag: "%year%", label: "%year%" },
  { tag: "%monthnum%", label: "%monthnum%" },
  { tag: "%day%", label: "%day%" },
  { tag: "%hour%", label: "%hour%" },
  { tag: "%minute%", label: "%minute%" },
  { tag: "%second%", label: "%second%" },
  { tag: "%post_id%", label: "%post_id%" },
  { tag: "%postname%", label: "%postname%" },
  { tag: "%category%", label: "%category%" },
  { tag: "%author%", label: "%author%" },
];

export function PermalinkTagButtons({
  inputRef,
  field,
}: PermalinkTagButtonsProps) {
  const handleInsertTag = (tag: string) => {
    const input = inputRef.current;
    if (!input) {
      // No input ref -- just append
      const currentValue = (field.state.value as string) ?? "";
      field.handleChange(currentValue + tag);
      return;
    }

    const start = input.selectionStart ?? 0;
    const end = input.selectionEnd ?? 0;
    const currentValue = (field.state.value as string) ?? "";

    // Insert tag at cursor position
    const newValue =
      currentValue.substring(0, start) + tag + currentValue.substring(end);
    field.handleChange(newValue);

    // After React re-render, set cursor position after the inserted tag
    requestAnimationFrame(() => {
      const newCursorPos = start + tag.length;
      input.focus();
      input.setSelectionRange(newCursorPos, newCursorPos);
    });
  };

  return (
    <div className="flex flex-wrap gap-1">
      {PERMALINK_TAGS.map(({ tag, label }) => (
        <Button
          key={tag}
          type="button"
          variant="outline"
          size="xs"
          onClick={() => handleInsertTag(tag)}
        >
          {label}
        </Button>
      ))}
    </div>
  );
}
