/**
 * Slash Command Items Registry
 *
 * All available slash commands for the block editor.
 * Each item defines a label, description, icon name (Lucide), aliases,
 * and an action function that inserts the corresponding block.
 */

import type { SlashCommandItem } from "@/types/editor";

export function getSlashCommandItems(): SlashCommandItem[] {
  return [
    // ── Text Blocks ────────────────────────────────────────────────────
    {
      id: "paragraph",
      label: "Paragraph",
      description: "Plain text block",
      icon: "pilcrow",
      aliases: ["p", "paragraph", "text"],
      action: (editor) => {
        editor.chain().focus().setParagraph().run();
      },
    },
    {
      id: "heading1",
      label: "Heading 1",
      description: "Large section heading",
      icon: "heading-1",
      aliases: ["h", "h1", "heading", "heading1"],
      action: (editor) => {
        editor.chain().focus().toggleHeading({ level: 1 }).run();
      },
    },
    {
      id: "heading2",
      label: "Heading 2",
      description: "Medium section heading",
      icon: "heading-2",
      aliases: ["h2", "heading2"],
      action: (editor) => {
        editor.chain().focus().toggleHeading({ level: 2 }).run();
      },
    },
    {
      id: "heading3",
      label: "Heading 3",
      description: "Small section heading",
      icon: "heading-3",
      aliases: ["h3", "heading3"],
      action: (editor) => {
        editor.chain().focus().toggleHeading({ level: 3 }).run();
      },
    },
    {
      id: "heading4",
      label: "Heading 4",
      description: "Sub-section heading",
      icon: "heading-4",
      aliases: ["h4"],
      action: (editor) => {
        editor.chain().focus().toggleHeading({ level: 4 }).run();
      },
    },
    {
      id: "bulletList",
      label: "Bullet List",
      description: "Unordered list with bullet points",
      icon: "list",
      aliases: ["ul", "list", "bullet"],
      action: (editor) => {
        editor.chain().focus().toggleBulletList().run();
      },
    },
    {
      id: "orderedList",
      label: "Ordered List",
      description: "Numbered list",
      icon: "list-ordered",
      aliases: ["ol", "numbered", "ordered"],
      action: (editor) => {
        editor.chain().focus().toggleOrderedList().run();
      },
    },
    {
      id: "taskList",
      label: "Task List",
      description: "Checklist with checkboxes",
      icon: "list-checks",
      aliases: ["todo", "task", "checklist"],
      action: (editor) => {
        editor.chain().focus().toggleTaskList().run();
      },
    },
    {
      id: "blockquote",
      label: "Blockquote",
      description: "Quoted text block",
      icon: "quote",
      aliases: ["quote", "blockquote"],
      action: (editor) => {
        editor.chain().focus().toggleBlockquote().run();
      },
    },
    {
      id: "codeBlock",
      label: "Code Block",
      description: "Code with syntax highlighting",
      icon: "code",
      aliases: ["code", "codeblock"],
      action: (editor) => {
        editor.chain().focus().toggleCodeBlock().run();
      },
    },
    {
      id: "table",
      label: "Table",
      description: "Insert a table",
      icon: "table",
      aliases: ["table"],
      action: (editor) => {
        editor
          .chain()
          .focus()
          .insertTable({ rows: 3, cols: 3, withHeaderRow: true })
          .run();
      },
    },

    // ── Media Blocks ───────────────────────────────────────────────────
    {
      id: "image",
      label: "Image",
      description: "Insert an image",
      icon: "image",
      aliases: ["img", "image", "photo"],
      action: (editor) => {
        // Insert a placeholder image block; the user will set the src via the block settings
        editor
          .chain()
          .focus()
          .setImage({ src: "", alt: "Image" })
          .run();
      },
    },
    {
      id: "embed",
      label: "Embed",
      description: "Embed a YouTube, Vimeo, or other video",
      icon: "video",
      aliases: ["embed", "youtube", "video", "vimeo"],
      action: (editor) => {
        editor.chain().focus().setEmbed({ url: "" }).run();
      },
    },
    {
      id: "button",
      label: "Button",
      description: "Call-to-action button",
      icon: "mouse-pointer-click",
      aliases: ["button", "cta"],
      action: (editor) => {
        editor.chain().focus().setButton().run();
      },
    },

    // ── Design Blocks ──────────────────────────────────────────────────
    {
      id: "columns",
      label: "Columns",
      description: "Multi-column layout",
      icon: "columns-2",
      aliases: ["columns", "cols"],
      action: (editor) => {
        editor.chain().focus().setColumns({ count: 2 }).run();
      },
    },
    {
      id: "spacer",
      label: "Spacer",
      description: "Vertical space between blocks",
      icon: "separator-horizontal",
      aliases: ["spacer", "space"],
      action: (editor) => {
        editor.chain().focus().setSpacer({ height: 40 }).run();
      },
    },
    {
      id: "divider",
      label: "Divider",
      description: "Horizontal line divider",
      icon: "minus",
      aliases: ["divider", "hr", "line"],
      action: (editor) => {
        editor.chain().focus().setDivider({ style: "solid" }).run();
      },
    },
    {
      id: "callout",
      label: "Callout",
      description: "Info, warning, or alert box",
      icon: "megaphone",
      aliases: ["callout", "alert", "note"],
      action: (editor) => {
        editor.chain().focus().setCallout({ type: "info" }).run();
      },
    },
  ];
}

/**
 * Get the block category for a slash command item.
 * Used by the BlockInserter to group items by category.
 */
export function getBlockCategory(
  itemId: string,
): "text" | "media" | "design" | "reusable" {
  const textBlocks = [
    "paragraph",
    "heading1",
    "heading2",
    "heading3",
    "heading4",
    "bulletList",
    "orderedList",
    "taskList",
    "blockquote",
    "codeBlock",
    "table",
  ];
  const mediaBlocks = ["image", "embed", "button"];
  const designBlocks = ["columns", "spacer", "divider", "callout"];

  if (textBlocks.includes(itemId)) return "text";
  if (mediaBlocks.includes(itemId)) return "media";
  if (designBlocks.includes(itemId)) return "design";
  // Items with id starting with "reusable-" are from the reusable blocks system
  if (itemId.startsWith("reusable-")) return "reusable";
  return "text";
}

/**
 * Create a SlashCommandItem for a reusable block.
 *
 * Reusable blocks are stored in Convex (editor.listReusableBlocks query)
 * and dynamically injected into the inserter/slash menu at runtime.
 *
 * @param block - Reusable block data from Convex
 */
export function createReusableBlockItem(block: {
  _id: string;
  title: string;
  content: string;
}): SlashCommandItem {
  return {
    id: `reusable-${block._id}`,
    label: block.title,
    description: "Reusable block",
    icon: "puzzle",
    aliases: [block.title.toLowerCase(), "reusable"],
    action: (editor) => {
      // Parse the stored JSON content and insert it at the current cursor position
      try {
        const parsed = JSON.parse(block.content);
        editor.chain().focus().insertContent(parsed).run();
      } catch {
        // If content is not valid JSON, insert as text
        editor.chain().focus().insertContent(block.title).run();
      }
    },
  };
}
