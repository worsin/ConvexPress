/**
 * TipTap extensions for the knowledge-base editor.
 *
 * Every node and mark maps one-to-one onto KbDoc (backend kb/content/model.ts),
 * so `editor.getJSON()` is a KbDoc the server only has to normalize. Node and
 * mark names, and the attributes below, are the KbDoc ones; anything TipTap adds
 * on top (an ordered list's `type`, a cell's `colwidth`) is dropped on save.
 */

import { Extension, Mark, Node, mergeAttributes, type Editor, type Range } from "@tiptap/core";
import { Heading } from "@tiptap/extension-heading";
import { Link } from "@tiptap/extension-link";
import { OrderedList } from "@tiptap/extension-list";
import { TableKit } from "@tiptap/extension-table";
import { CharacterCount, Placeholder } from "@tiptap/extensions";
import { ReactNodeViewRenderer, type ReactNodeViewProps } from "@tiptap/react";
import type { ComponentType } from "react";
import StarterKit from "@tiptap/starter-kit";
import Suggestion, { type SuggestionOptions } from "@tiptap/suggestion";

/** Interactive views for the editor's own blocks (nodeviews.tsx); without them the blocks render as plain markup. */
export type KbNodeViews = { callout: ComponentType<ReactNodeViewProps>; figure: ComponentType<ReactNodeViewProps>; details: ComponentType<ReactNodeViewProps> };

export type KbCalloutTone = "note" | "tip" | "warning" | "important";
export type KbFigureAttrs = {
  mediaId: string | null;
  src: string | null;
  alt: string;
  caption: string;
  size: "content" | "wide" | "full";
  frame: "none" | "screenshot";
};

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    kbMarks: {
      toggleKbd: () => ReturnType;
      toggleUiLabel: () => ReturnType;
    };
    kbBlocks: {
      setCallout: (tone?: KbCalloutTone) => ReturnType;
      insertFigure: (attrs: Partial<KbFigureAttrs> & { mediaId: string }) => ReturnType;
      insertDetails: () => ReturnType;
      toggleSteps: () => ReturnType;
    };
  }
}

const KbHeading = Heading.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      // The anchor deep links use; the server keeps it once assigned.
      id: { default: null, parseHTML: (element) => element.getAttribute("id"), renderHTML: (attrs) => (attrs.id ? { id: attrs.id } : {}) },
    };
  },
}).configure({ levels: [2, 3, 4] });

const KbOrderedList = OrderedList.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      kind: {
        default: "list",
        parseHTML: (element) => (element.classList.contains("kb-steps") ? "steps" : "list"),
        renderHTML: (attrs) => (attrs.kind === "steps" ? { class: "kb-steps" } : {}),
      },
    };
  },
  addCommands() {
    return {
      ...this.parent?.(),
      toggleSteps:
        () =>
        ({ editor, chain }) => {
          if (editor.isActive("orderedList", { kind: "steps" })) return chain().updateAttributes("orderedList", { kind: "list" }).run();
          if (editor.isActive("orderedList")) return chain().updateAttributes("orderedList", { kind: "steps" }).run();
          return chain().toggleOrderedList().updateAttributes("orderedList", { kind: "steps" }).run();
        },
    };
  },
});

/** A link to a URL, or to another article (`articleId`, optional heading `anchor`). */
const KbLink = Link.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      articleId: { default: null, parseHTML: (element) => element.getAttribute("data-kb-article"), renderHTML: (attrs) => (attrs.articleId ? { "data-kb-article": attrs.articleId } : {}) },
      anchor: { default: null, parseHTML: (element) => element.getAttribute("data-kb-anchor"), renderHTML: (attrs) => (attrs.anchor ? { "data-kb-anchor": attrs.anchor } : {}) },
    };
  },
}).configure({
  openOnClick: false,
  autolink: true,
  linkOnPaste: true,
  defaultProtocol: "https",
  HTMLAttributes: { rel: null, target: null, class: null },
  isAllowedUri: (url, ctx) => /^(?:https?:|mailto:|tel:|\/(?!\/)|#)/i.test(url) || ctx.defaultValidate(url),
});

const Kbd = Mark.create({
  name: "kbd",
  excludes: "bold italic underline strike ui code",
  parseHTML: () => [{ tag: "kbd" }],
  renderHTML: () => ["kbd", { class: "kb-kbd" }, 0],
  addCommands() {
    return { toggleKbd: () => ({ commands }) => commands.toggleMark(this.name) };
  },
});

/** The name of something on screen ("the Save button"). */
const UiLabel = Mark.create({
  name: "ui",
  parseHTML: () => [{ tag: "span.kb-ui" }],
  renderHTML: () => ["span", { class: "kb-ui" }, 0],
  addKeyboardShortcuts() {
    return { "Mod-Shift-l": () => this.editor.commands.toggleUiLabel() };
  },
  addCommands() {
    return { toggleUiLabel: () => ({ commands }) => commands.toggleMark(this.name) };
  },
});

const makeCallout = (view?: ComponentType<ReactNodeViewProps>) => Node.create({
  name: "callout",
  group: "block",
  content: "block+",
  defining: true,
  addAttributes() {
    return {
      tone: { default: "note", parseHTML: (element) => (/kb-callout--(tip|warning|important)/.exec(element.className)?.[1] ?? "note") },
      title: { default: "" },
    };
  },
  parseHTML: () => [{ tag: "aside.kb-callout" }],
  renderHTML({ node, HTMLAttributes }) {
    return ["aside", mergeAttributes(HTMLAttributes, { class: `kb-callout kb-callout--${node.attrs.tone}` }), 0];
  },
  ...(view ? { addNodeView: () => ReactNodeViewRenderer(view) } : {}),
  addCommands() {
    return {
      setCallout:
        (tone = "note") =>
        ({ commands }) =>
          commands.wrapIn(this.name, { tone }),
    };
  },
});

const makeFigure = (view?: ComponentType<ReactNodeViewProps>) => Node.create({
  name: "figure",
  group: "block",
  atom: true,
  draggable: true,
  selectable: true,
  addAttributes() {
    return {
      mediaId: { default: null },
      src: { default: null },
      alt: { default: "" },
      caption: { default: "" },
      size: { default: "content" },
      frame: { default: "none" },
    };
  },
  parseHTML: () => [
    {
      tag: "figure",
      getAttrs: (element) => {
        const image = element.querySelector("img");
        return image ? { src: image.getAttribute("src"), alt: image.getAttribute("alt") ?? "", caption: element.querySelector("figcaption")?.textContent ?? "" } : false;
      },
    },
  ],
  renderHTML({ node }) {
    return ["figure", { class: "kb-figure" }, ["img", { src: node.attrs.src ?? "", alt: node.attrs.alt }]];
  },
  ...(view ? { addNodeView: () => ReactNodeViewRenderer(view) } : {}),
  addCommands() {
    return {
      insertFigure:
        (attrs) =>
        ({ commands }) =>
          commands.insertContent({ type: this.name, attrs: { frame: "screenshot", ...attrs } }),
    };
  },
});

/** A question that opens: FAQs and optional detail. */
const makeDetails = (view?: ComponentType<ReactNodeViewProps>) => Node.create({
  name: "details",
  group: "block",
  content: "block+",
  defining: true,
  addAttributes() {
    return { summary: { default: "" }, open: { default: false } };
  },
  parseHTML: () => [{ tag: "details" }],
  renderHTML({ HTMLAttributes }) {
    return ["details", mergeAttributes(HTMLAttributes, { class: "kb-details" }), 0];
  },
  ...(view ? { addNodeView: () => ReactNodeViewRenderer(view) } : {}),
  addCommands() {
    return {
      insertDetails:
        () =>
        ({ commands }) =>
          commands.insertContent({ type: this.name, attrs: { summary: "" }, content: [{ type: "paragraph" }] }),
    };
  },
});

// ─── Slash menu ─────────────────────────────────────────────────────────────

export type SlashItem = { title: string; hint: string; keywords: string; run: (editor: Editor, range: Range) => void };

export const SLASH_ITEMS: SlashItem[] = [
  { title: "Heading", hint: "Section title", keywords: "h2 title section", run: (e, r) => e.chain().focus().deleteRange(r).setNode("heading", { level: 2 }).run() },
  { title: "Subheading", hint: "Smaller title", keywords: "h3", run: (e, r) => e.chain().focus().deleteRange(r).setNode("heading", { level: 3 }).run() },
  { title: "Steps", hint: "Numbered procedure", keywords: "procedure how to numbered", run: (e, r) => e.chain().focus().deleteRange(r).toggleSteps().run() },
  { title: "Bulleted list", hint: "Points", keywords: "ul bullets", run: (e, r) => e.chain().focus().deleteRange(r).toggleBulletList().run() },
  { title: "Numbered list", hint: "Ordered points", keywords: "ol ordered", run: (e, r) => e.chain().focus().deleteRange(r).toggleOrderedList().run() },
  { title: "Tip", hint: "Helpful aside", keywords: "callout hint", run: (e, r) => e.chain().focus().deleteRange(r).setCallout("tip").run() },
  { title: "Note", hint: "Neutral aside", keywords: "callout info", run: (e, r) => e.chain().focus().deleteRange(r).setCallout("note").run() },
  { title: "Warning", hint: "Something to avoid", keywords: "callout caution danger", run: (e, r) => e.chain().focus().deleteRange(r).setCallout("warning").run() },
  { title: "Important", hint: "Must-know", keywords: "callout", run: (e, r) => e.chain().focus().deleteRange(r).setCallout("important").run() },
  { title: "Question", hint: "Opens to an answer", keywords: "faq details accordion", run: (e, r) => e.chain().focus().deleteRange(r).insertDetails().run() },
  { title: "Table", hint: "Rows and columns", keywords: "grid", run: (e, r) => e.chain().focus().deleteRange(r).insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run() },
  { title: "Code", hint: "Code block", keywords: "pre snippet", run: (e, r) => e.chain().focus().deleteRange(r).toggleCodeBlock().run() },
  { title: "Quote", hint: "Quotation", keywords: "blockquote", run: (e, r) => e.chain().focus().deleteRange(r).toggleBlockquote().run() },
  { title: "Divider", hint: "Horizontal rule", keywords: "hr line", run: (e, r) => e.chain().focus().deleteRange(r).setHorizontalRule().run() },
];

export type SlashMenuState = { items: SlashItem[]; rect: DOMRect | null; command: (item: SlashItem) => void; selected: number } | null;

/** "/" at the start of an empty line opens the block menu (rendered by KbEditor). */
function slashMenu(onState: (state: SlashMenuState) => void, onKey: { current: ((event: KeyboardEvent) => boolean) | null }) {
  const options: Partial<SuggestionOptions<SlashItem>> = {
    char: "/",
    startOfLine: true,
    allowSpaces: false,
    items: ({ query }) => {
      const q = query.toLowerCase();
      return SLASH_ITEMS.filter((item) => !q || item.title.toLowerCase().includes(q) || item.keywords.includes(q)).slice(0, 10);
    },
    command: ({ editor, range, props }) => props.run(editor, range),
    render: () => {
      let current: SlashMenuState = null;
      return {
        onStart: (props) => {
          current = { items: props.items, rect: props.clientRect?.() ?? null, command: props.command, selected: 0 };
          onState(current);
        },
        onUpdate: (props) => {
          current = { items: props.items, rect: props.clientRect?.() ?? null, command: props.command, selected: 0 };
          onState(current);
        },
        onKeyDown: ({ event }) => {
          if (event.key === "Escape") {
            onState(null);
            return true;
          }
          return onKey.current?.(event) ?? false;
        },
        onExit: () => {
          current = null;
          onState(null);
        },
      };
    },
  };
  return Extension.create({
    name: "kbSlashMenu",
    addProseMirrorPlugins() {
      return [Suggestion({ editor: this.editor, ...options })];
    },
  });
}

export function kbEditorExtensions(options: {
  placeholder: string;
  nodeViews?: KbNodeViews;
  onSlashMenu: (state: SlashMenuState) => void;
  slashKey: { current: ((event: KeyboardEvent) => boolean) | null };
}) {
  return [
    StarterKit.configure({ heading: false, orderedList: false, link: false, trailingNode: {} }),
    KbHeading,
    KbOrderedList,
    KbLink,
    Kbd,
    UiLabel,
    makeCallout(options.nodeViews?.callout),
    makeFigure(options.nodeViews?.figure),
    makeDetails(options.nodeViews?.details),
    TableKit.configure({ table: { resizable: false } }),
    Placeholder.configure({
      placeholder: ({ node }) => (node.type.name === "paragraph" ? options.placeholder : ""),
      includeChildren: false,
    }),
    CharacterCount,
    slashMenu(options.onSlashMenu, options.slashKey),
  ];
}
