/**
 * CalloutBlock - Custom TipTap Node Extension
 *
 * Info/Warning/Error/Success callout boxes.
 * Each callout has a type attribute and can contain block content.
 *
 * Usage: `/callout`, `/alert`, `/note`
 */

import { Node, mergeAttributes } from "@tiptap/core";

export interface CalloutBlockOptions {
  HTMLAttributes: Record<string, any>;
}

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    calloutBlock: {
      setCallout: (attrs?: { type?: string }) => ReturnType;
      toggleCallout: (attrs?: { type?: string }) => ReturnType;
    };
  }
}

export const CalloutBlock = Node.create<CalloutBlockOptions>({
  name: "callout",

  group: "block",

  content: "block+",

  defining: true,

  addOptions() {
    return {
      HTMLAttributes: {},
    };
  },

  addAttributes() {
    return {
      type: {
        default: "info",
        parseHTML: (element) => element.getAttribute("data-callout-type") || "info",
        renderHTML: (attributes) => ({
          "data-callout-type": attributes.type,
        }),
      },
    };
  },

  parseHTML() {
    return [
      {
        tag: "div[data-type='callout']",
      },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "div",
      mergeAttributes(this.options.HTMLAttributes, HTMLAttributes, {
        "data-type": "callout",
        class: "callout-block",
      }),
      0,
    ];
  },

  addCommands() {
    return {
      setCallout:
        (attrs) =>
        ({ commands }) => {
          return commands.wrapIn(this.name, attrs);
        },
      toggleCallout:
        (attrs) =>
        ({ commands }) => {
          return commands.toggleWrap(this.name, attrs);
        },
    };
  },
});
