/**
 * ButtonBlock - Custom TipTap Node Extension
 *
 * A CTA button block with configurable text, URL, variant, and alignment.
 *
 * Usage: `/button`, `/cta`
 */

import { Node, mergeAttributes } from "@tiptap/core";

export interface ButtonBlockOptions {
  HTMLAttributes: Record<string, any>;
}

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    buttonBlock: {
      setButton: (attrs?: {
        text?: string;
        url?: string;
        variant?: string;
        alignment?: string;
      }) => ReturnType;
    };
  }
}

export const ButtonBlock = Node.create<ButtonBlockOptions>({
  name: "button",

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
      text: {
        default: "Click Here",
      },
      url: {
        default: "#",
      },
      variant: {
        default: "primary",
      },
      alignment: {
        default: "left",
      },
    };
  },

  parseHTML() {
    return [
      {
        tag: "div[data-type='button']",
      },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "div",
      mergeAttributes(this.options.HTMLAttributes, {
        "data-type": "button",
        class: `button-block button-block--${HTMLAttributes.variant || "primary"}`,
        style: `text-align: ${HTMLAttributes.alignment || "left"};`,
      }),
      [
        "a",
        {
          href: HTMLAttributes.url || "#",
          class: `button-block__link button-block__link--${HTMLAttributes.variant || "primary"}`,
          target: "_blank",
          rel: "noopener noreferrer",
        },
        HTMLAttributes.text || "Click Here",
      ],
    ];
  },

  addCommands() {
    return {
      setButton:
        (attrs) =>
        ({ commands }) => {
          return commands.insertContent({
            type: this.name,
            attrs: {
              text: attrs?.text ?? "Click Here",
              url: attrs?.url ?? "#",
              variant: attrs?.variant ?? "primary",
              alignment: attrs?.alignment ?? "left",
            },
          });
        },
    };
  },
});
