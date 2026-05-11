/**
 * ColumnsBlock - Custom TipTap Node Extension
 *
 * Multi-column layout (2, 3, or 4 columns).
 * Uses a `columns` parent node containing `column` child nodes.
 * Each column can hold arbitrary block content.
 *
 * Usage: `/columns`, `/cols`
 */

import { Node, mergeAttributes } from "@tiptap/core";

export interface ColumnsBlockOptions {
  HTMLAttributes: Record<string, any>;
}

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    columnsBlock: {
      setColumns: (attrs?: { count?: number }) => ReturnType;
    };
  }
}

/**
 * The Column child node (individual column within a columns layout).
 */
export const Column = Node.create({
  name: "column",

  group: "block",

  content: "block+",

  defining: true,

  isolating: true,

  parseHTML() {
    return [
      {
        tag: "div[data-type='column']",
      },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "div",
      mergeAttributes(HTMLAttributes, {
        "data-type": "column",
        class: "column-block",
        style: "flex: 1; min-width: 0;",
      }),
      0,
    ];
  },
});

/**
 * The Columns parent node (container for column children).
 */
export const ColumnsBlock = Node.create<ColumnsBlockOptions>({
  name: "columns",

  group: "block",

  content: "column+",

  defining: true,

  isolating: true,

  addOptions() {
    return {
      HTMLAttributes: {},
    };
  },

  addAttributes() {
    return {
      count: {
        default: 2,
        parseHTML: (element) => {
          const c = element.getAttribute("data-column-count");
          return c ? parseInt(c, 10) : 2;
        },
        renderHTML: (attributes) => ({
          "data-column-count": attributes.count,
        }),
      },
    };
  },

  parseHTML() {
    return [
      {
        tag: "div[data-type='columns']",
      },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "div",
      mergeAttributes(this.options.HTMLAttributes, HTMLAttributes, {
        "data-type": "columns",
        class: "columns-block",
        style: "display: flex; gap: 1rem;",
      }),
      0,
    ];
  },

  addCommands() {
    return {
      setColumns:
        (attrs) =>
        ({ commands }) => {
          const count = attrs?.count ?? 2;
          const columns = Array.from({ length: count }, () => ({
            type: "column",
            content: [
              {
                type: "paragraph",
              },
            ],
          }));

          return commands.insertContent({
            type: this.name,
            attrs: { count },
            content: columns,
          });
        },
    };
  },
});
