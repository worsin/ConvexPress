import { expect, test } from "bun:test";
import { createRequire } from "node:module";
import { renderToStaticMarkup } from "react-dom/server";

import { ManagedRecordGate } from "./ManagedRecord";

const require = createRequire(import.meta.url);
const { JSDOM } = createRequire(require.resolve("isomorphic-dompurify"))("jsdom");

function render(markup: string) {
  return new JSDOM(markup).window;
}

const editor = (
  <form>
    <input aria-label="Title" defaultValue="Doctor signup" />
    <button type="submit">Save</button>
    <a href="/forms">Back to forms</a>
  </form>
);

test("a managed record's editor says who manages it and turns read-only", () => {
  const window = render(
    renderToStaticMarkup(
      <ManagedRecordGate managed={{ system: "CaseMedix", note: "Change it in the CaseMedix CRM." }} what="This form">
        {editor}
      </ManagedRecordGate>,
    ),
  );
  try {
    const document = window.document;
    expect(document.querySelector('[role="note"]')?.textContent).toBe(
      "This form is managed by CaseMedix, so it's read-only here.Change it in the CaseMedix CRM.",
    );
    const fieldset = document.querySelector("fieldset");
    expect(fieldset?.disabled).toBe(true);
    const input = document.querySelector("input");
    const save = document.querySelector("button");
    expect(input?.matches(":disabled")).toBe(true);
    expect(save?.matches(":disabled")).toBe(true);
    expect(document.querySelector("a")?.getAttribute("href")).toBe("/forms");
  } finally {
    window.close();
  }
});

test("an unmanaged record, or one still loading, is left as it is", () => {
  for (const managed of [null, undefined]) {
    const window = render(renderToStaticMarkup(<ManagedRecordGate managed={managed} what="This form">{editor}</ManagedRecordGate>));
    try {
      expect(window.document.querySelector('[role="note"]')).toBeNull();
      expect(window.document.querySelector("fieldset")).toBeNull();
      expect(window.document.querySelector("button")?.matches(":disabled")).toBe(false);
    } finally {
      window.close();
    }
  }
});
