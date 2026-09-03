import { describe, expect, test } from "bun:test";

import { getWidgetPanelA11yProps } from "./WidgetPanel";

describe("support widget panel accessibility", () => {
  test("makes the closed panel inert and exposes modal state only while open", () => {
    expect(getWidgetPanelA11yProps(false)).toEqual({ inert: true });
    expect(getWidgetPanelA11yProps(true)).toEqual({ "aria-modal": true });
    expect("aria-hidden" in getWidgetPanelA11yProps(false)).toBe(false);
  });
});
