import { describe, expect, test } from "bun:test";

import {
  blurActiveElementBeforeOverlay,
  getBackgroundInertProps,
} from "./LayoutShellProvider";

describe("mobile overlay focus handoff", () => {
  test("releases focus from page content before it becomes inert", () => {
    let blurCalls = 0;
    blurActiveElementBeforeOverlay({
      activeElement: {
        blur: () => {
          blurCalls += 1;
        },
      },
    });

    expect(blurCalls).toBe(1);
  });

  test("uses native inert without a redundant aria-hidden transition", () => {
    expect(getBackgroundInertProps(true)).toEqual({ inert: true });
    expect(getBackgroundInertProps(false)).toEqual({});
    expect("aria-hidden" in getBackgroundInertProps(true)).toBe(false);
  });
});
