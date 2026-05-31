/**
 * Lesson content helpers — minimal Tiptap doc <-> plain text bridge.
 * (A full Tiptap editor is a follow-up; this keeps the format compatible.)
 */

export function textToDoc(text: string): unknown {
  const paras = (text ?? "").split(/\n{2,}/);
  return {
    type: "doc",
    content: paras.map((p) => ({
      type: "paragraph",
      content: p ? [{ type: "text", text: p }] : [],
    })),
  };
}

export function docToText(doc: unknown): string {
  const d = doc as { content?: Array<{ content?: Array<{ text?: string }> }> };
  if (!d || !Array.isArray(d.content)) return "";
  return d.content
    .map((node) => (node.content ?? []).map((c) => c.text ?? "").join(""))
    .join("\n\n");
}

export function detectVideoProvider(url: string): string {
  const u = url.toLowerCase();
  if (u.includes("youtube.com") || u.includes("youtu.be")) return "youtube";
  if (u.includes("vimeo.com")) return "vimeo";
  if (u.includes("wistia.")) return "wistia";
  if (u.includes("bunnycdn") || u.includes("mediadelivery")) return "bunny";
  return "other";
}
