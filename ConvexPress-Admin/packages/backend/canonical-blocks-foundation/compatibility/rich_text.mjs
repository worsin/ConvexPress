// Pure conversion of the actual v1 Website renderer grammar. This deliberately
// does not parse arbitrary Markdown/HTML or invent formatting the old site lacked.
export function legacyTextToRichText(value, mode) {
  if (value === null) return null;
  if (typeof value !== "string") throw new Error("Legacy richtext conversion requires a string");
  if (!["plain-prose", "markdown-prose", "plain-inline", "markdown-inline"].includes(mode)) throw new Error("Unknown legacy text conversion mode");
  const paragraphs = mode.endsWith("prose") ? value.split(/\n{2,}/).map(part => part.trim()).filter(Boolean) : [value];
  const content = paragraphs.map(text => {
    if (mode.startsWith("plain")) return { type: "paragraph", content: text ? [{ type: "text", text }] : [] };
    const nodes = [], tokens = /(\*\*[^*]+\*\*|\*[^*]+\*|\[[^\]]+\]\(https?:\/\/[^\s)]+\))/g;
    let cursor = 0, match;
    while ((match = tokens.exec(text))) {
      if (match.index > cursor) nodes.push({ type: "text", text: text.slice(cursor, match.index) });
      const token = match[0];
      if (token.startsWith("**") && token.endsWith("**")) nodes.push({ type: "text", text: token.slice(2, -2), marks: [{ type: "bold" }] });
      else if (token.startsWith("*") && token.endsWith("*")) nodes.push({ type: "text", text: token.slice(1, -1), marks: [{ type: "italic" }] });
      else {
        const link = /^\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)$/.exec(token);
        if (link) nodes.push({ type: "text", text: link[1], marks: [{ type: "link", attrs: { href: link[2], target: "_blank" } }] });
        else nodes.push({ type: "text", text: token });
      }
      cursor = match.index + token.length;
    }
    if (cursor < text.length) nodes.push({ type: "text", text: text.slice(cursor) });
    return { type: "paragraph", content: nodes };
  });
  return { type: "doc", content };
}
