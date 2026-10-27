import { expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";

import { AuthConfigProvider } from "@/contexts/AuthConfigContext";
import { defaultWebsiteAuthConfig } from "@/lib/auth/capabilities";

import { AuthDivider } from "./AuthDivider";

function render(social: string[]) {
  const config = defaultWebsiteAuthConfig();
  return renderToStaticMarkup(
    <AuthConfigProvider value={{ ...config, capabilities: { ...config.capabilities, social } }}>
      <AuthDivider />
    </AuthConfigProvider>,
  );
}

test("the divider separates social sign-in from the form", () => {
  expect(render(["oauth_google"])).toContain(">or<");
});

test("there is no dangling divider when the site offers no social sign-in", () => {
  expect(render([])).toBe("");
});
