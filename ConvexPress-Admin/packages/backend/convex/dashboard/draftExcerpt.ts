/** A bounded preview of authored paragraphs in the owner's private draft list.
 * Never traverse arbitrary attributes, reference bodies, URLs or resolver data. */
export function canonicalDraftExcerpt(blocks: unknown): string {
  let text = "", visited = 0;
  const object = (value: unknown): Record<string, unknown> | null =>
    value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
  const visit = (nodes: unknown, depth: number) => {
    if (!Array.isArray(nodes) || depth > 20) return;
    for (const value of nodes) {
      if (++visited > 500 || text.length >= 100) return;
      const node = object(value);
      if (!node) continue;
      if (node.name === "core/paragraph" && node.version === 2) {
        const body = object(object(node.attrs)?.body);
        if (body?.type === "doc" && Array.isArray(body.content)) for (const value of body.content) {
          if (++visited > 500 || text.length >= 100) return;
          const paragraph = object(value);
          if (paragraph?.type !== "paragraph" || !Array.isArray(paragraph.content)) continue;
          for (const value of paragraph.content) {
            if (++visited > 500 || text.length >= 100) return;
            const run = object(value);
            if (run?.type === "text" && typeof run.text === "string") text += run.text.slice(0, 100 - text.length);
            else if (run?.type === "hardBreak") text += "\n";
          }
          text += "\n";
        }
      }
      visit(node.children, depth + 1);
    }
  };
  visit(blocks, 0);
  return text.trim().slice(0, 100);
}
