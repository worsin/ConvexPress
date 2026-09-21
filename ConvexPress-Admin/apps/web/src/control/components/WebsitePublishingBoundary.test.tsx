import { expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { WebsitePublishingBoundary } from "./WebsitePublishingBoundary";
test("hosting rollout errors show a local retry without rendering exception text", () => {
  const boundary = new WebsitePublishingBoundary({ children: <p>Hosting status</p> });
  expect(renderToStaticMarkup(boundary.render())).toContain("Hosting status");
  boundary.state = WebsitePublishingBoundary.getDerivedStateFromError();
  const html = renderToStaticMarkup(boundary.render());
  expect(html).toContain("Retry publishing connection");
  expect(html).toContain("rest of this environment remains available");
  expect(html).not.toContain("Hosting status");
});
