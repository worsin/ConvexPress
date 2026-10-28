/** "On this page": the article's second-level headings, for longer articles. */
export type KbOutlineEntry = { id: string; level: 2 | 3 | 4; text: string };

export function KbArticleOutline({ outline, className, minimum = 3 }: { outline: KbOutlineEntry[] | undefined; className?: string; minimum?: number }) {
  const entries = (outline ?? []).filter((entry) => entry.level === 2);
  if (entries.length < minimum) return null;
  return (
    <nav aria-label="On this page" className={className}>
      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">On this page</p>
      <ol className="space-y-1 text-sm">
        {entries.map((entry) => (
          <li key={entry.id}>
            <a href={`#${entry.id}`} className="text-muted-foreground hover:text-foreground hover:underline">
              {entry.text}
            </a>
          </li>
        ))}
      </ol>
    </nav>
  );
}
