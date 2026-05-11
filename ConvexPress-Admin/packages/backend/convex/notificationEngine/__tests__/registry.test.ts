import { describe, expect, test } from "bun:test";

import {
  EMAIL_EVENT_HANDLER_ROUTES,
  EVENT_DRIVEN_EMAIL_EVENT_CODES,
  NOTIFICATION_ENGINE_LISTENER_DEFINITIONS,
  getNotificationChannelsForEvent,
} from "../registry";

describe("notification engine registry", () => {
  test("covers every event-driven email route plus supplemental reset completion", () => {
    const handledEventCodes = new Set(
      EMAIL_EVENT_HANDLER_ROUTES.map((route) => route.eventCode),
    );

    for (const eventCode of EVENT_DRIVEN_EMAIL_EVENT_CODES) {
      expect(handledEventCodes.has(eventCode)).toBe(true);
    }

    expect(handledEventCodes.has("password.reset_completed")).toBe(true);
  });

  test("builds the expected event-to-channel matrix", () => {
    expect(getNotificationChannelsForEvent("registration.user_registered")).toEqual([
      "site",
      "email",
    ]);
    expect(getNotificationChannelsForEvent("registration.user_invited")).toEqual([
      "site",
      "email",
    ]);
    expect(getNotificationChannelsForEvent("profile.updated")).toEqual(["site"]);
    expect(getNotificationChannelsForEvent("ticket.replied")).toEqual([
      "site",
      "email",
    ]);
    expect(getNotificationChannelsForEvent("kb.workflow_step_ready")).toEqual([
      "site",
      "email",
    ]);
    expect(getNotificationChannelsForEvent("commerce.subscription_created")).toEqual([
      "site",
      "email",
    ]);
    expect(getNotificationChannelsForEvent("password.reset_requested")).toEqual([]);
  });

  test("generated listener definitions stay unique", () => {
    const seen = new Set<string>();

    for (const definition of NOTIFICATION_ENGINE_LISTENER_DEFINITIONS) {
      const key = `${definition.eventCode}::${definition.name}`;
      expect(seen.has(key)).toBe(false);
      seen.add(key);
    }
  });
});
