/**
 * DividerBlock - Custom TipTap Node Extension
 *
 * A styled horizontal divider with configurable style (solid/dashed/dotted/double).
 * Distinct from the built-in horizontalRule which is a simple <hr>.
 *
 * Usage: `/divider`, `/hr`, `/line`
 */

import { Node, mergeAttributes } from "@tiptap/core";

export interface DividerBlockOptions {
  HTMLAttributes: Record<string, any>;
}

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    dividerBlock: {
      setDivider: (attrs?: { style?: string }) => ReturnType;
    };
  }
}

export const DividerBlock = Node.create<DividerBlockOptions>({
  name: "divider",

  group: "block",

  atom: true,

  draggable: true,

  addOptions() {
    return {
      HTMLAttributes: {},
    };
  },

  addAttributes() {
    return {
      style: {
        default: "solid",
        parseHTML: (element) =>
          element.getAttribute("data-divider-style") || "solid",
        renderHTML: (attributes) => ({
          "data-divider-style": attributes.style,
        }),
      },
    };
  },

  parseHTML() {
    return [
      {
        tag: "div[data-type='divider']",
      },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    const borderStyle = HTMLAttributes["data-divider-style"] || "solid";
    return [
      "div",
      mergeAttributes(this.options.HTMLAttributes, HTMLAttributes, {
        "data-type": "divider",
        class: "divider-block",
      }),
      [
        "hr",
        {
          style: `border: none; border-top: 2px ${borderStyle} currentColor; opacity: 0.3;`,
        },
      ],
    ];
  },

  addCommands() {
    return {
      setDivider:
        (attrs) =>
        ({ commands }) => {
          return commands.insertContent({
            type: this.name,
            attrs: { style: attrs?.style ?? "solid" },
          });
        },
    };
  },
});
