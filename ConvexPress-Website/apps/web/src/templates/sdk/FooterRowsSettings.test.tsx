import { expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import type { FooterRow } from "@/lib/layout/types";
import { FooterRowsSettings } from "./FooterRowsSettings";

test("on-site footer builder exposes structured row and cell controls", () => {
  const rows: FooterRow[] = [
    {
      id: "r1",
      background: "default",
      padding: "normal",
      container: "default",
      columns: [
        {
          id: "c1",
          width: 6,
          cell: {
            type: "text",
            heading: "Draft heading",
            body: "Draft paragraph",
          },
        },
      ],
    },
  ];
  const markup = renderToStaticMarkup(
    <FooterRowsSettings
      rows={rows}
      onChange={() => {
        throw new Error("Rendering cannot mutate a draft");
      }}
    />,
  );
  expect(markup).toContain("Draft heading");
  expect(markup).toContain("Draft paragraph");
  expect(markup).toContain("Move up");
  expect(markup).toContain("6 of 12 columns");
  expect(markup).not.toContain("Save footer");
});
test("empty footer builder explains the section fallback", () => {
  const markup = renderToStaticMarkup(
    <FooterRowsSettings rows={[]} onChange={() => {}} />,
  );
  expect(markup).toContain("footer uses the section settings above");
  expect(markup).toContain("Add footer row");
});
