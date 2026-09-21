// @ts-ignore Bun supports module aliases; the local declaration omits mock.
import { expect, test, mock } from "bun:test";
import { anyApi } from "convex/server";
// Bun follows the Admin type-only API shim; use the same generated runtime API proxy.
mock.module("@backend/convex/_generated/api", () => ({ api: anyApi }));
import { renderToStaticMarkup } from "react-dom/server";
import { ConvexQueryCacheProvider } from "convex-helpers/react/cache";
import { ConvexProvider, type ConvexReactClient } from "convex/react";
const { HeaderSettingsEditor } = await import("./HeaderComposer");
const { FooterSettingsEditor } = await import("./FooterComposer");
const { FooterRowsBuilder } = await import("./FooterRowsBuilder");

test("Customizer reuses header/footer controls without separate publish buttons", () => {
  const markup = renderToStaticMarkup(
    <>
      <HeaderSettingsEditor value={{}} onChange={() => {}} />
      <FooterSettingsEditor value={{}} onChange={() => {}} />
    </>,
  );
  expect(markup).toContain("Layout");
  expect(markup).toContain("Newsletter");
  expect(markup).not.toContain("Save footer");
  expect(markup).not.toContain("Save Header");
});
test("controlled footer rows render their draft without querying or writing global settings", () => {
  const unexpected = () => {
    throw new Error("Controlled builder attempted backend access");
  };
  const client = {
    mutation: unexpected,
    watchQuery: unexpected,
  } as unknown as ConvexReactClient;
  const markup = renderToStaticMarkup(
    <ConvexProvider client={client}>
      <ConvexQueryCacheProvider>
        <FooterRowsBuilder
          value={{
            rows: [
              {
                id: "r1",
                columns: [
                  {
                    id: "c1",
                    cell: {
                      type: "text",
                      heading: "Draft-only title",
                      body: "Draft-only body",
                    },
                  },
                ],
              },
            ],
          }}
          onChange={() => {}}
        />
      </ConvexQueryCacheProvider>
    </ConvexProvider>,
  );
  expect(markup).toContain("Row 1");
  expect(markup).toContain("1 cell");
  expect(markup).not.toContain("Save footer");
});
