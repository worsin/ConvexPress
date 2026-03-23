/**
 * EditorFooter - Word count, character count, block count, reading time
 *
 * Displays editor statistics in a subtle footer bar below the content area.
 * Matches WordPress's editor footer pattern.
 */

interface EditorFooterProps {
  wordCount: number;
  characterCount: number;
  blockCount: number;
  readingTime: number; // in minutes
}

export function EditorFooter({
  wordCount,
  characterCount,
  blockCount,
  readingTime,
}: EditorFooterProps) {
  return (
    <div className="border-t border-border px-3 py-1.5 flex items-center gap-4 text-[10px] text-muted-foreground">
      <span>
        {wordCount} {wordCount === 1 ? "word" : "words"}
      </span>
      <span>{characterCount} characters</span>
      <span>
        {blockCount} {blockCount === 1 ? "block" : "blocks"}
      </span>
      <span className="ml-auto">
        {readingTime} min read
      </span>
    </div>
  );
}
