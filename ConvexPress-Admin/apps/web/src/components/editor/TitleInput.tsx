/**
 * TitleInput - Large borderless title input
 *
 * Renders a borderless input with placeholder "Add title" and large font.
 * Auto-generates slug on blur if slug has not been manually edited.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

interface TitleInputProps {
  value: string;
  onChange: (value: string) => void;
  onSlugGenerate?: (slug: string) => void;
  autoFocus?: boolean;
  maxLength?: number;
}

function generateSlug(title: string): string {
  return title
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, "")
    .replace(/[\s_]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function TitleInput({
  value,
  onChange,
  onSlugGenerate,
  autoFocus = false,
  maxLength = 500,
}: TitleInputProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [showCounter, setShowCounter] = useState(false);

  useEffect(() => {
    if (autoFocus && inputRef.current) {
      inputRef.current.focus();
    }
  }, [autoFocus]);

  // Show character counter when near limit
  useEffect(() => {
    setShowCounter(value.length > maxLength - 50);
  }, [value.length, maxLength]);

  const handleBlur = useCallback(() => {
    if (value.trim() && onSlugGenerate) {
      onSlugGenerate(generateSlug(value));
    }
  }, [value, onSlugGenerate]);

  return (
    <div className="relative">
      <input
        ref={inputRef}
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onBlur={handleBlur}
        placeholder="Add title"
        maxLength={maxLength}
        className={cn(
          "w-full bg-transparent border-none outline-hidden",
          "text-2xl font-semibold text-foreground",
          "placeholder:text-muted-foreground/50",
          "py-2",
        )}
        aria-label="Post title"
      />
      {showCounter && (
        <span className="absolute right-0 bottom-0 text-xs text-muted-foreground">
          {value.length}/{maxLength}
        </span>
      )}
    </div>
  );
}
