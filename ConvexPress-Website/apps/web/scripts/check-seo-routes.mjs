import { readFile } from "node:fs/promises";
import path from "node:path";

const projectRoot = process.cwd();

const checks = [
  {
    file: "src/routes/_marketing/index.tsx",
    patterns: ["buildSeoHead", "loaderData?.seoHead"],
  },
  {
    file: "src/routes/_marketing/blog/index.tsx",
    patterns: ["buildSeoHead", "loaderData?.seoHead"],
  },
  {
    file: "src/routes/_marketing/blog/$slug.tsx",
    patterns: ["buildSeoHead", "loaderData?.seoHead"],
  },
  {
    file: "src/routes/_marketing/page/$.tsx",
    patterns: ["buildSeoHead", "loaderData?.seoHead"],
  },
  {
    file: "src/routes/_marketing/search.tsx",
    patterns: ["buildSeoHead", "robots: \"noindex, follow\""],
  },
  {
    file: "src/routes/_marketing/help/search.tsx",
    patterns: ["buildSeoHead", "robots: \"noindex, follow\""],
  },
  {
    file: "src/routes/_marketing/support/index.tsx",
    patterns: ["buildIndexablePageHead", "loaderData?.seoHead"],
  },
  {
    file: "src/routes/_marketing/support/new.tsx",
    patterns: ["buildSeoHead", "robots: \"noindex, nofollow\""],
  },
  {
    file: "src/routes/_marketing/support/tickets/index.tsx",
    patterns: ["buildRestrictedPageHead", "loaderData?.seoHead"],
  },
  {
    file: "src/routes/_marketing/support/tickets/$ticketId.tsx",
    patterns: ["buildSeoHead", "robots: \"noindex, nofollow\""],
  },
  {
    file: "src/routes/login.tsx",
    patterns: ["buildRestrictedPageHead"],
  },
  {
    file: "src/routes/register.tsx",
    patterns: ["buildRestrictedPageHead"],
  },
  {
    file: "src/routes/forgot-password.tsx",
    patterns: ["buildRestrictedPageHead"],
  },
  {
    file: "src/routes/reset-password.tsx",
    patterns: ["buildRestrictedPageHead"],
  },
  {
    file: "src/routes/verify-email.tsx",
    patterns: ["buildRestrictedPageHead"],
  },
  {
    file: "src/routes/logout.tsx",
    patterns: ["buildRestrictedPageHead"],
  },
  {
    file: "src/routes/dashboard/index.tsx",
    patterns: ["buildRestrictedPageHead"],
  },
  {
    file: "src/routes/dashboard/settings.tsx",
    patterns: ["buildRestrictedPageHead"],
  },
];

const failures = [];

for (const check of checks) {
  const absolutePath = path.join(projectRoot, check.file);
  const contents = await readFile(absolutePath, "utf8");

  for (const pattern of check.patterns) {
    if (!contents.includes(pattern)) {
      failures.push(`${check.file} is missing required SEO convention marker: ${pattern}`);
    }
  }
}

if (failures.length > 0) {
  console.error("SEO route convention check failed:");
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log(`SEO route convention check passed for ${checks.length} route files.`);
