import { test, expect } from "bun:test";
import { act } from "react";
import { JSDOM } from "jsdom";
import calendar from "../../../../../../../blocks/events/calendar/render";
import { calendarWindow } from "../block-data/portable/calendarContracts";

test("Calendar follows authored view changes and undo without resetting visitor choice on data refresh", async () => {
  const dom = new JSDOM('<div id="app"></div>', { url: "https://calendar.invalid", pretendToBeVisual: true });
  const names = ["window", "document", "navigator", "HTMLElement", "Element", "Node", "MutationObserver", "getComputedStyle", "IS_REACT_ACT_ENVIRONMENT"];
  const previous = names.map(name => [name, Object.getOwnPropertyDescriptor(globalThis, name)]);
  for (const name of names) Object.defineProperty(globalThis, name, { configurable: true, writable: true, value: name === "IS_REACT_ACT_ENVIRONMENT" ? true : dom.window[name] });
  const { createRoot } = await import("react-dom/client");
  const root = createRoot(document.getElementById("app")), View = calendar.View;
  const range = calendarWindow("2026-11", "America/Denver");
  const data = { ...range, asOf: range.startsAt + 1, categoryId: null, items: [], cursor: null, nextCursor: null };
  const render = async (view, refreshed = data) => act(async () => root.render(<View blockId="calendar" attrs={{ view }} data={refreshed} resources={{ media: {} }} />));
  const selected = () => document.querySelector('button[aria-pressed="true"]').textContent;
  try {
    await render("month");
    expect(selected()).toBe("Month");
    await render("agenda");
    expect(selected()).toBe("Agenda");
    expect(document.querySelector("table")).toBeNull();
    await render("month");
    expect(selected()).toBe("Month");
    expect(document.querySelector("table")).not.toBeNull();
    await act(async () => [...document.querySelectorAll("button")].find(button => button.textContent === "Agenda").click());
    expect(selected()).toBe("Agenda");
    await render("month", { ...data, asOf: data.asOf + 1000 });
    expect(selected()).toBe("Agenda");
    await render("agenda");
    await render("month");
    expect(selected()).toBe("Month");
  } finally {
    await act(async () => root.unmount()); dom.window.close();
    for (const [name, descriptor] of previous) { if (descriptor) Object.defineProperty(globalThis, name, descriptor); else delete globalThis[name]; }
  }
});
