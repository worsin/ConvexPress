/**
 * SEO System - Client-Side SEO Analysis Engine
 *
 * 14 SEO checks with weighted scoring (0-100).
 * Runs entirely client-side, no Convex queries needed.
 * Debounce at the hook level (useSeoAnalysis), not here.
 */

import type { SeoCheckResult, AnalysisResult } from "./types";
import {
  countWords,
  calculateKeyphraseDensity,
  keyphraseInIntro,
  stripHtml,
  countOccurrences,
} from "./utils";

// ─── Check Weights ───────────────────────────────────────────────────────────

const WEIGHTS = {
  keyphraseInTitle: 3,
  keyphraseInDescription: 3,
  keyphraseInIntro: 2,
  keyphraseInSubheadings: 1,
  keyphraseDensity: 2,
  keyphraseInSlug: 2,
  keyphraseInImageAlt: 1,
  titleLength: 2,
  descriptionLength: 2,
  contentLength: 2,
  internalLinks: 1,
  externalLinks: 1,
  imageAltAttributes: 1,
  duplicateKeyphrase: 2,
};

// Maximum score multiplier per check
const MULTIPLIER = { good: 3, ok: 2, poor: 0 };

/**
 * Run the full 14-check SEO analysis.
 */
export function runSeoAnalysis(opts: {
  content: string;
  title: string;
  slug: string;
  excerpt: string;
  focusKeyphrase: string;
  metaTitle: string;
  metaDescription: string;
  isDuplicateKeyphrase?: boolean;
}): AnalysisResult {
  const {
    content,
    title,
    slug,
    excerpt,
    focusKeyphrase,
    metaTitle,
    metaDescription,
    isDuplicateKeyphrase = false,
  } = opts;

  const plainContent = stripHtml(content);
  const effectiveTitle = metaTitle || title;
  const kp = focusKeyphrase.trim().toLowerCase();

  const checks: SeoCheckResult[] = [];

  // 1. Keyphrase in SEO title
  checks.push(checkKeyphraseInTitle(effectiveTitle, kp));

  // 2. Keyphrase in meta description
  checks.push(checkKeyphraseInDescription(metaDescription, kp));

  // 3. Keyphrase in introduction
  checks.push(checkKeyphraseInIntroduction(plainContent, kp));

  // 4. Keyphrase in subheadings
  checks.push(checkKeyphraseInSubheadings(content, kp));

  // 5. Keyphrase density
  checks.push(checkKeyphraseDensity(plainContent, kp));

  // 6. Keyphrase in URL/slug
  checks.push(checkKeyphraseInSlug(slug, kp));

  // 7. Keyphrase in image alt text
  checks.push(checkKeyphraseInImageAlt(content, kp));

  // 8. SEO title length
  checks.push(checkTitleLength(effectiveTitle));

  // 9. Meta description length
  checks.push(checkDescriptionLength(metaDescription));

  // 10. Content length
  checks.push(checkContentLength(plainContent));

  // 11. Internal links
  checks.push(checkInternalLinks(content));

  // 12. External links
  checks.push(checkExternalLinks(content));

  // 13. Image alt attributes
  checks.push(checkImageAltAttributes(content));

  // 14. Duplicate keyphrase
  checks.push(checkDuplicateKeyphrase(isDuplicateKeyphrase, kp));

  // Calculate score
  const maxScore = Object.values(WEIGHTS).reduce((sum, w) => sum + w * MULTIPLIER.good, 0);
  const actualScore = checks.reduce((sum, check) => {
    const mult = MULTIPLIER[check.status];
    return sum + check.weight * mult;
  }, 0);

  const score = maxScore > 0 ? Math.round((actualScore / maxScore) * 100) : 0;

  return { score, checks };
}

// ─── Individual Checks ───────────────────────────────────────────────────────

function checkKeyphraseInTitle(title: string, kp: string): SeoCheckResult {
  if (!kp) {
    return {
      id: "keyphraseInTitle",
      label: "Keyphrase in SEO title",
      status: "poor",
      message: "No focus keyphrase set.",
      weight: WEIGHTS.keyphraseInTitle,
    };
  }
  const found = title.toLowerCase().includes(kp);
  return {
    id: "keyphraseInTitle",
    label: "Keyphrase in SEO title",
    status: found ? "good" : "poor",
    message: found
      ? "Focus keyphrase appears in the SEO title."
      : "The focus keyphrase does not appear in the SEO title.",
    weight: WEIGHTS.keyphraseInTitle,
  };
}

function checkKeyphraseInDescription(desc: string, kp: string): SeoCheckResult {
  if (!kp) {
    return {
      id: "keyphraseInDescription",
      label: "Keyphrase in meta description",
      status: "poor",
      message: "No focus keyphrase set.",
      weight: WEIGHTS.keyphraseInDescription,
    };
  }
  const found = desc.toLowerCase().includes(kp);
  return {
    id: "keyphraseInDescription",
    label: "Keyphrase in meta description",
    status: found ? "good" : "poor",
    message: found
      ? "Focus keyphrase appears in the meta description."
      : "The focus keyphrase does not appear in the meta description.",
    weight: WEIGHTS.keyphraseInDescription,
  };
}

function checkKeyphraseInIntroduction(text: string, kp: string): SeoCheckResult {
  if (!kp) {
    return {
      id: "keyphraseInIntro",
      label: "Keyphrase in introduction",
      status: "poor",
      message: "No focus keyphrase set.",
      weight: WEIGHTS.keyphraseInIntro,
    };
  }
  const found = keyphraseInIntro(text, kp);
  return {
    id: "keyphraseInIntro",
    label: "Keyphrase in introduction",
    status: found ? "good" : "poor",
    message: found
      ? "Focus keyphrase appears in the first paragraph."
      : "The focus keyphrase does not appear in the first paragraph.",
    weight: WEIGHTS.keyphraseInIntro,
  };
}

function checkKeyphraseInSubheadings(html: string, kp: string): SeoCheckResult {
  if (!kp) {
    return {
      id: "keyphraseInSubheadings",
      label: "Keyphrase in subheadings",
      status: "poor",
      message: "No focus keyphrase set.",
      weight: WEIGHTS.keyphraseInSubheadings,
    };
  }

  const headingRegex = /<h[2-6][^>]*>(.*?)<\/h[2-6]>/gi;
  const headings: string[] = [];
  let match;
  while ((match = headingRegex.exec(html)) !== null) {
    headings.push(stripHtml(match[1]));
  }

  if (headings.length === 0) {
    return {
      id: "keyphraseInSubheadings",
      label: "Keyphrase in subheadings",
      status: "ok",
      message: "No subheadings found in the content.",
      weight: WEIGHTS.keyphraseInSubheadings,
    };
  }

  const found = headings.some((h) => h.toLowerCase().includes(kp));
  return {
    id: "keyphraseInSubheadings",
    label: "Keyphrase in subheadings",
    status: found ? "good" : "ok",
    message: found
      ? "Focus keyphrase appears in at least one subheading."
      : "The focus keyphrase does not appear in any subheading.",
    weight: WEIGHTS.keyphraseInSubheadings,
  };
}

function checkKeyphraseDensity(text: string, kp: string): SeoCheckResult {
  if (!kp) {
    return {
      id: "keyphraseDensity",
      label: "Keyphrase density",
      status: "poor",
      message: "No focus keyphrase set.",
      weight: WEIGHTS.keyphraseDensity,
    };
  }

  const density = calculateKeyphraseDensity(text, kp);
  const densityStr = density.toFixed(1);

  if (density >= 0.5 && density <= 3.0) {
    return {
      id: "keyphraseDensity",
      label: "Keyphrase density",
      status: "good",
      message: `Keyphrase density is ${densityStr}% (target: 0.5-3%).`,
      weight: WEIGHTS.keyphraseDensity,
    };
  }
  if (density > 0 && density < 0.5) {
    return {
      id: "keyphraseDensity",
      label: "Keyphrase density",
      status: "ok",
      message: `Keyphrase density is ${densityStr}%. Consider using it more often (target: 0.5-3%).`,
      weight: WEIGHTS.keyphraseDensity,
    };
  }
  if (density > 3.0) {
    return {
      id: "keyphraseDensity",
      label: "Keyphrase density",
      status: "ok",
      message: `Keyphrase density is ${densityStr}%. That's a bit high (target: 0.5-3%).`,
      weight: WEIGHTS.keyphraseDensity,
    };
  }

  return {
    id: "keyphraseDensity",
    label: "Keyphrase density",
    status: "poor",
    message: "The focus keyphrase was not found in the content.",
    weight: WEIGHTS.keyphraseDensity,
  };
}

function checkKeyphraseInSlug(slug: string, kp: string): SeoCheckResult {
  if (!kp) {
    return {
      id: "keyphraseInSlug",
      label: "Keyphrase in URL",
      status: "poor",
      message: "No focus keyphrase set.",
      weight: WEIGHTS.keyphraseInSlug,
    };
  }

  const slugWords = slug.toLowerCase().replace(/-/g, " ");
  const found = slugWords.includes(kp);
  return {
    id: "keyphraseInSlug",
    label: "Keyphrase in URL",
    status: found ? "good" : "ok",
    message: found
      ? "Focus keyphrase appears in the URL slug."
      : "The focus keyphrase does not appear in the URL slug.",
    weight: WEIGHTS.keyphraseInSlug,
  };
}

function checkKeyphraseInImageAlt(html: string, kp: string): SeoCheckResult {
  if (!kp) {
    return {
      id: "keyphraseInImageAlt",
      label: "Keyphrase in image alt",
      status: "poor",
      message: "No focus keyphrase set.",
      weight: WEIGHTS.keyphraseInImageAlt,
    };
  }

  const altRegex = /alt=["']([^"']*)["']/gi;
  const alts: string[] = [];
  let match;
  while ((match = altRegex.exec(html)) !== null) {
    alts.push(match[1]);
  }

  if (alts.length === 0) {
    return {
      id: "keyphraseInImageAlt",
      label: "Keyphrase in image alt",
      status: "ok",
      message: "No images found in the content.",
      weight: WEIGHTS.keyphraseInImageAlt,
    };
  }

  const found = alts.some((alt) => alt.toLowerCase().includes(kp));
  return {
    id: "keyphraseInImageAlt",
    label: "Keyphrase in image alt",
    status: found ? "good" : "ok",
    message: found
      ? "Focus keyphrase appears in at least one image alt attribute."
      : "The focus keyphrase does not appear in any image alt attribute.",
    weight: WEIGHTS.keyphraseInImageAlt,
  };
}

function checkTitleLength(title: string): SeoCheckResult {
  const len = title.length;

  if (len >= 50 && len <= 60) {
    return {
      id: "titleLength",
      label: "SEO title length",
      status: "good",
      message: `SEO title is ${len} characters (recommended: 50-60).`,
      weight: WEIGHTS.titleLength,
    };
  }
  if ((len >= 40 && len < 50) || (len > 60 && len <= 70)) {
    return {
      id: "titleLength",
      label: "SEO title length",
      status: "ok",
      message: `SEO title is ${len} characters (recommended: 50-60).`,
      weight: WEIGHTS.titleLength,
    };
  }
  return {
    id: "titleLength",
    label: "SEO title length",
    status: "poor",
    message: len === 0
      ? "No SEO title set."
      : `SEO title is ${len} characters (recommended: 50-60).`,
    weight: WEIGHTS.titleLength,
  };
}

function checkDescriptionLength(desc: string): SeoCheckResult {
  const len = desc.length;

  if (len >= 120 && len <= 156) {
    return {
      id: "descriptionLength",
      label: "Meta description length",
      status: "good",
      message: `Meta description is ${len} characters (recommended: 120-156).`,
      weight: WEIGHTS.descriptionLength,
    };
  }
  if ((len >= 100 && len < 120) || (len > 156 && len <= 180)) {
    return {
      id: "descriptionLength",
      label: "Meta description length",
      status: "ok",
      message: `Meta description is ${len} characters (recommended: 120-156).`,
      weight: WEIGHTS.descriptionLength,
    };
  }
  return {
    id: "descriptionLength",
    label: "Meta description length",
    status: "poor",
    message: len === 0
      ? "No meta description set."
      : `Meta description is ${len} characters (recommended: 120-156).`,
    weight: WEIGHTS.descriptionLength,
  };
}

function checkContentLength(text: string): SeoCheckResult {
  const words = countWords(text);

  if (words >= 300) {
    return {
      id: "contentLength",
      label: "Content length",
      status: "good",
      message: `Content has ${words} words (minimum: 300).`,
      weight: WEIGHTS.contentLength,
    };
  }
  if (words >= 150) {
    return {
      id: "contentLength",
      label: "Content length",
      status: "ok",
      message: `Content has ${words} words. Consider adding more (minimum: 300).`,
      weight: WEIGHTS.contentLength,
    };
  }
  return {
    id: "contentLength",
    label: "Content length",
    status: "poor",
    message: words === 0
      ? "No content found."
      : `Content has only ${words} words (minimum: 300).`,
    weight: WEIGHTS.contentLength,
  };
}

function checkInternalLinks(html: string): SeoCheckResult {
  const linkRegex = /<a[^>]+href=["']([^"']*)["']/gi;
  let internalCount = 0;
  let match;
  while ((match = linkRegex.exec(html)) !== null) {
    const href = match[1];
    if (href.startsWith("/") || href.startsWith("#")) {
      internalCount++;
    }
  }

  return {
    id: "internalLinks",
    label: "Internal links",
    status: internalCount > 0 ? "good" : "ok",
    message: internalCount > 0
      ? `Found ${internalCount} internal link${internalCount === 1 ? "" : "s"}.`
      : "No internal links found. Consider linking to related content.",
    weight: WEIGHTS.internalLinks,
  };
}

function checkExternalLinks(html: string): SeoCheckResult {
  const linkRegex = /<a[^>]+href=["'](https?:\/\/[^"']*)["']/gi;
  let externalCount = 0;
  let match;
  while ((match = linkRegex.exec(html)) !== null) {
    externalCount++;
  }

  return {
    id: "externalLinks",
    label: "Outbound links",
    status: externalCount > 0 ? "good" : "ok",
    message: externalCount > 0
      ? `Found ${externalCount} outbound link${externalCount === 1 ? "" : "s"}.`
      : "No outbound links found. Consider linking to authoritative sources.",
    weight: WEIGHTS.externalLinks,
  };
}

function checkImageAltAttributes(html: string): SeoCheckResult {
  const imgRegex = /<img[^>]*>/gi;
  const images: string[] = [];
  let match;
  while ((match = imgRegex.exec(html)) !== null) {
    images.push(match[0]);
  }

  if (images.length === 0) {
    return {
      id: "imageAltAttributes",
      label: "Image alt attributes",
      status: "ok",
      message: "No images found in the content.",
      weight: WEIGHTS.imageAltAttributes,
    };
  }

  const withAlt = images.filter((img) => /alt=["'][^"']+["']/i.test(img));
  const allHaveAlt = withAlt.length === images.length;

  return {
    id: "imageAltAttributes",
    label: "Image alt attributes",
    status: allHaveAlt ? "good" : "ok",
    message: allHaveAlt
      ? `All ${images.length} image${images.length === 1 ? " has" : "s have"} alt text.`
      : `${withAlt.length} of ${images.length} image${images.length === 1 ? " has" : "s have"} alt text.`,
    weight: WEIGHTS.imageAltAttributes,
  };
}

function checkDuplicateKeyphrase(isDuplicate: boolean, kp: string): SeoCheckResult {
  if (!kp) {
    return {
      id: "duplicateKeyphrase",
      label: "Previously used keyphrase",
      status: "ok",
      message: "No focus keyphrase set.",
      weight: WEIGHTS.duplicateKeyphrase,
    };
  }

  return {
    id: "duplicateKeyphrase",
    label: "Previously used keyphrase",
    status: isDuplicate ? "poor" : "good",
    message: isDuplicate
      ? "This focus keyphrase has been used on another post. Consider using a unique keyphrase."
      : "This focus keyphrase has not been used on other posts.",
    weight: WEIGHTS.duplicateKeyphrase,
  };
}
