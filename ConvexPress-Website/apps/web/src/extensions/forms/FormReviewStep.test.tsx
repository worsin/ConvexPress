import { expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { JSDOM } from "jsdom";

import { parsePublicFormSettings } from "./StateNotices";
import { FormReviewStep } from "./FormReviewStep";

test("the review step lists each page's answers with an Edit link, then continues", () => {
  const html = renderToStaticMarkup(
    <FormReviewStep
      sections={[
        { position: 0, title: "Choose your package", answers: [{ key: "package", label: "Package", value: "Practice — $299/month" }] },
        { position: 2, title: "Your practice", answers: [{ key: "npi", label: "Group NPI", value: "1234567893" }] },
      ]}
      canEdit
      onEdit={() => undefined}
      onBack={() => undefined}
      onContinue={() => undefined}
      continueLabel="Continue"
      isSubmitting={false}
    />,
  );
  const dom = new JSDOM(html);
  try {
    const doc = dom.window.document;
    expect(doc.querySelector("h2")?.textContent).toBe("Review your answers");
    expect([...doc.querySelectorAll("h3")].map((h) => h.textContent)).toEqual(["Choose your package", "Your practice"]);
    expect([...doc.querySelectorAll("dd")].map((dd) => dd.textContent)).toEqual(["Practice — $299/month", "1234567893"]);
    expect([...doc.querySelectorAll("button[aria-label]")].map((b) => b.getAttribute("aria-label"))).toEqual(["Edit Choose your package", "Edit Your practice"]);
    expect([...doc.querySelectorAll("button")].some((b) => b.textContent === "Continue")).toBe(true);
  } finally {
    dom.window.close();
  }
});

test("the website reads the review step setting", () => {
  expect(parsePublicFormSettings(JSON.stringify({ reviewStep: true })).reviewStep).toBe(true);
  expect(parsePublicFormSettings("{}").reviewStep).toBeUndefined();
});
