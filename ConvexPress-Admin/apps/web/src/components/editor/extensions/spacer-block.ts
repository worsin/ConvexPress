/**
 * SpacerBlock - Custom TipTap Node Extension
 *
 * Adds vertical spacing between blocks. Height is configurable.
 *
 * Usage: `/spacer`, `/space`
 */

import { Node, mergeAttributes } from "@tiptap/core";

export interface SpacerBlockOptions {
  HTMLAttributes: Record<string, any>;
}

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    spacerBlock: {
      setSpacer: (attrs?: { height?: number }) => ReturnType;
    };
  }
}

export const SpacerBlock = Node.create<SpacerBlockOptions>({
  name: "spacer",

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
      height: {
        default: 40,
        parseHTML: (element) => {
          const h = element.getAttribute("data-height");
          return h ? parseInt(h, 10) : 40;
        },
        renderHTML: (attributes) => ({
          "data-height": attributes.height,
          style: `height: ${attributes.height}px;`,
        }),
      },
    };
  },

  parseHTML() {
    return [
      {
        tag: "div[data-type='spacer']",
      },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "div",
      mergeAttributes(this.options.HTMLAttributes, HTMLAttributes, {
        "data-type": "spacer",
        class: "spacer-block",
      }),
    ];
  },

  addCommands() {
    return {
      setSpacer:
        (attrs) =>
        ({ commands }) => {
          return commands.insertContent({
            type: this.name,
            attrs: { height: attrs?.height ?? 40 },
          });
        },
    };
  },
});
