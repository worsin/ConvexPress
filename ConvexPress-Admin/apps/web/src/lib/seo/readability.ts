/**
 * SEO System - Client-Side Readability Analysis Engine
 *
 * 8 readability checks with Flesch-based scoring.
 * Runs entirely client-side, debounced at the hook level.
 */

import type { ReadabilityCheckResult, ReadabilityAnalysisResult } from "./types";
import { countWords, extractSentences, extractParagraphs } from "./utils";

// ─── Check Weights ───────────────────────────────────────────────────────────

const WEIGHTS = {
  fleschReadingEase: 3,
  paragraphLength: 2,
  sentenceLength: 2,
  passiveVoice: 1,
  transitionWords: 1,
  consecutiveSentences: 1,
  subheadingDistribution: 2,
  textPresence: 1,
};

const MULTIPLIER = { good: 3, ok: 2, poor: 0 };

// ─── Transition Words ────────────────────────────────────────────────────────

const TRANSITION_WORDS = [
  "additionally", "also", "as a result", "because", "besides",
  "consequently", "conversely", "for example", "for instance",
  "furthermore", "hence", "however", "in addition", "in contrast",
  "in fact", "indeed", "instead", "likewise", "meanwhile",
  "moreover", "nevertheless", "nonetheless", "on the other hand",
  "otherwise", "similarly", "so", "still", "subsequently",
  "therefore", "thus", "yet", "finally", "first", "second",
  "third", "next", "then", "specifically", "such as",
  "to illustrate", "above all", "after all", "all in all",
  "in conclusion", "in summary", "to sum up", "overall",
];

// ─── Passive Voice Patterns ──────────────────────────────────────────────────

const PASSIVE_PATTERNS = [
  /\b(?:am|is|are|was|were|be|been|being)\s+\w+ed\b/gi,
  /\b(?:am|is|are|was|were|be|been|being)\s+\w+en\b/gi,
];

/**
 * Run the full 8-check readability analysis.
 */
export function runReadabilityAnalysis(opts: {
  content: string;
  title: string;
}): ReadabilityAnalysisResult {
  const { content } = opts;
  const plainText = content
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;/g, " ")
    .trim();

  const checks: ReadabilityCheckResult[] = [];

  // 1. Flesch Reading Ease
  checks.push(checkFleschReadingEase(plainText));

  // 2. Paragraph length
  checks.push(checkParagraphLength(plainText));

  // 3. Sentence length
  checks.push(checkSentenceLength(plainText));

  // 4. Passive voice
  checks.push(checkPassiveVoice(plainText));

  // 5. Transition words
  checks.push(checkTransitionWords(plainText));

  // 6. Consecutive sentences starting with same word
  checks.push(checkConsecutiveSentences(plainText));

  // 7. Subheading distribution
  checks.push(checkSubheadingDistribution(content, plainText));

  // 8. Text presence
  checks.push(checkTextPresence(plainText));

  // Calculate score
  const maxScore = Object.values(WEIGHTS).reduce((sum, w) => sum + w * MULTIPLIER.good, 0);
  const actualScore = checks.reduce((sum, check) => {
    const mult = MULTIPLIER[check.status];
    return sum + check.weight * mult;
  }, 0);

  const score = maxScore > 0 ? Math.round((actualScore / maxScore) * 100) : 0;

  return { score, checks };
}

// ─── Flesch Reading Ease ─────────────────────────────────────────────────────

function countSyllables(word: string): number {
  const w = word.toLowerCase().replace(/[^a-z]/g, "");
  if (w.length <= 3) return 1;

  let count = 0;
  const vowels = "aeiouy";
  let prevVowel = false;

  for (let i = 0; i < w.length; i++) {
    const isVowel = vowels.includes(w[i]);
    if (isVowel && !prevVowel) count++;
    prevVowel = isVowel;
  }

  // Adjust for silent e
  if (w.endsWith("e") && count > 1) count--;
  // Ensure at least 1
  if (count === 0) count = 1;

  return count;
}

function calculateFleschReadingEase(text: string): number {
  const sentences = extractSentences(text);
  const words = text.split(/\s+/).filter((w) => w.length > 0);

  if (sentences.length === 0 || words.length === 0) return 0;

  const totalSyllables = words.reduce((sum, w) => sum + countSyllables(w), 0);
  const avgSentenceLength = words.length / sentences.length;
  const avgSyllablesPerWord = totalSyllables / words.length;

  const score = 206.835 - 1.015 * avgSentenceLength - 84.6 * avgSyllablesPerWord;
  return Math.max(0, Math.min(100, Math.round(score)));
}

function checkFleschReadingEase(text: string): ReadabilityCheckResult {
  const score = calculateFleschReadingEase(text);

  if (score >= 60) {
    return {
      id: "fleschReadingEase",
      label: "Flesch reading ease",
      status: "good",
      message: `Flesch reading ease score: ${score}/100. Easy to read.`,
      weight: WEIGHTS.fleschReadingEase,
    };
  }
  if (score >= 40) {
    return {
      id: "fleschReadingEase",
      label: "Flesch reading ease",
      status: "ok",
      message: `Flesch reading ease score: ${score}/100. Fairly difficult. Try shorter sentences and simpler words.`,
      weight: WEIGHTS.fleschReadingEase,
    };
  }
  return {
    id: "fleschReadingEase",
    label: "Flesch reading ease",
    status: "poor",
    message: score === 0
      ? "Not enough content to calculate readability."
      : `Flesch reading ease score: ${score}/100. Very difficult to read.`,
    weight: WEIGHTS.fleschReadingEase,
  };
}

// ─── Paragraph Length ────────────────────────────────────────────────────────

function checkParagraphLength(text: string): ReadabilityCheckResult {
  const paragraphs = extractParagraphs(text);
  if (paragraphs.length === 0) {
    return {
      id: "paragraphLength",
      label: "Paragraph length",
      status: "ok",
      message: "No paragraphs found.",
      weight: WEIGHTS.paragraphLength,
    };
  }

  const longParagraphs = paragraphs.filter((p) => countWords(p) > 150);

  if (longParagraphs.length === 0) {
    return {
      id: "paragraphLength",
      label: "Paragraph length",
      status: "good",
      message: "All paragraphs are under 150 words.",
      weight: WEIGHTS.paragraphLength,
    };
  }

  return {
    id: "paragraphLength",
    label: "Paragraph length",
    status: longParagraphs.length <= 1 ? "ok" : "poor",
    message: `${longParagraphs.length} paragraph${longParagraphs.length === 1 ? " is" : "s are"} over 150 words. Try breaking them up.`,
    weight: WEIGHTS.paragraphLength,
  };
}

// ─── Sentence Length ─────────────────────────────────────────────────────────

function checkSentenceLength(text: string): ReadabilityCheckResult {
  const sentences = extractSentences(text);
  if (sentences.length === 0) {
    return {
      id: "sentenceLength",
      label: "Sentence length",
      status: "ok",
      message: "No sentences found.",
      weight: WEIGHTS.sentenceLength,
    };
  }

  const longSentences = sentences.filter((s) => countWords(s) > 20);
  const percentage = (longSentences.length / sentences.length) * 100;

  if (percentage <= 25) {
    return {
      id: "sentenceLength",
      label: "Sentence length",
      status: "good",
      message: `${Math.round(percentage)}% of sentences are over 20 words. Good.`,
      weight: WEIGHTS.sentenceLength,
    };
  }
  if (percentage <= 40) {
    return {
      id: "sentenceLength",
      label: "Sentence length",
      status: "ok",
      message: `${Math.round(percentage)}% of sentences are over 20 words. Try shortening some.`,
      weight: WEIGHTS.sentenceLength,
    };
  }
  return {
    id: "sentenceLength",
    label: "Sentence length",
    status: "poor",
    message: `${Math.round(percentage)}% of sentences are over 20 words. Too many long sentences.`,
    weight: WEIGHTS.sentenceLength,
  };
}

// ─── Passive Voice ───────────────────────────────────────────────────────────

function checkPassiveVoice(text: string): ReadabilityCheckResult {
  const sentences = extractSentences(text);
  if (sentences.length === 0) {
    return {
      id: "passiveVoice",
      label: "Passive voice",
      status: "ok",
      message: "No sentences found.",
      weight: WEIGHTS.passiveVoice,
    };
  }

  let passiveCount = 0;
  for (const sentence of sentences) {
    for (const pattern of PASSIVE_PATTERNS) {
      pattern.lastIndex = 0;
      if (pattern.test(sentence)) {
        passiveCount++;
        break;
      }
    }
  }

  const percentage = (passiveCount / sentences.length) * 100;

  if (percentage <= 10) {
    return {
      id: "passiveVoice",
      label: "Passive voice",
      status: "good",
      message: `${Math.round(percentage)}% of sentences use passive voice (max: 10%).`,
      weight: WEIGHTS.passiveVoice,
    };
  }
  if (percentage <= 20) {
    return {
      id: "passiveVoice",
      label: "Passive voice",
      status: "ok",
      message: `${Math.round(percentage)}% of sentences use passive voice. Try using more active voice.`,
      weight: WEIGHTS.passiveVoice,
    };
  }
  return {
    id: "passiveVoice",
    label: "Passive voice",
    status: "poor",
    message: `${Math.round(percentage)}% of sentences use passive voice. Significantly reduce passive voice.`,
    weight: WEIGHTS.passiveVoice,
  };
}

// ─── Transition Words ────────────────────────────────────────────────────────

function checkTransitionWords(text: string): ReadabilityCheckResult {
  const sentences = extractSentences(text);
  if (sentences.length === 0) {
    return {
      id: "transitionWords",
      label: "Transition words",
      status: "ok",
      message: "No sentences found.",
      weight: WEIGHTS.transitionWords,
    };
  }

  let withTransition = 0;
  for (const sentence of sentences) {
    const lower = sentence.toLowerCase();
    if (TRANSITION_WORDS.some((tw) => lower.includes(tw))) {
      withTransition++;
    }
  }

  const percentage = (withTransition / sentences.length) * 100;

  if (percentage >= 30) {
    return {
      id: "transitionWords",
      label: "Transition words",
      status: "good",
      message: `${Math.round(percentage)}% of sentences contain transition words (min: 30%).`,
      weight: WEIGHTS.transitionWords,
    };
  }
  if (percentage >= 20) {
    return {
      id: "transitionWords",
      label: "Transition words",
      status: "ok",
      message: `${Math.round(percentage)}% of sentences contain transition words. Try using more.`,
      weight: WEIGHTS.transitionWords,
    };
  }
  return {
    id: "transitionWords",
    label: "Transition words",
    status: "poor",
    message: `Only ${Math.round(percentage)}% of sentences contain transition words (min: 30%).`,
    weight: WEIGHTS.transitionWords,
  };
}

// ─── Consecutive Sentences ───────────────────────────────────────────────────

function checkConsecutiveSentences(text: string): ReadabilityCheckResult {
  const sentences = extractSentences(text);
  if (sentences.length <= 1) {
    return {
      id: "consecutiveSentences",
      label: "Consecutive sentences",
      status: "good",
      message: "Not enough sentences to check.",
      weight: WEIGHTS.consecutiveSentences,
    };
  }

  let maxConsecutive = 1;
  let currentConsecutive = 1;

  for (let i = 1; i < sentences.length; i++) {
    const prevFirst = sentences[i - 1].split(/\s+/)[0]?.toLowerCase();
    const currFirst = sentences[i].split(/\s+/)[0]?.toLowerCase();
    if (prevFirst && currFirst && prevFirst === currFirst) {
      currentConsecutive++;
      maxConsecutive = Math.max(maxConsecutive, currentConsecutive);
    } else {
      currentConsecutive = 1;
    }
  }

  if (maxConsecutive <= 2) {
    return {
      id: "consecutiveSentences",
      label: "Consecutive sentences",
      status: "good",
      message: "Good sentence variety.",
      weight: WEIGHTS.consecutiveSentences,
    };
  }
  return {
    id: "consecutiveSentences",
    label: "Consecutive sentences",
    status: maxConsecutive <= 3 ? "ok" : "poor",
    message: `${maxConsecutive} consecutive sentences start with the same word. Vary your sentence beginnings.`,
    weight: WEIGHTS.consecutiveSentences,
  };
}

// ─── Subheading Distribution ─────────────────────────────────────────────────

function checkSubheadingDistribution(html: string, plainText: string): ReadabilityCheckResult {
  const totalWords = countWords(plainText);

  if (totalWords < 300) {
    return {
      id: "subheadingDistribution",
      label: "Subheading distribution",
      status: "good",
      message: "Text is short enough not to require subheadings.",
      weight: WEIGHTS.subheadingDistribution,
    };
  }

  const headingRegex = /<h[2-6][^>]*>/gi;
  const headings = html.match(headingRegex) || [];
  const headingCount = headings.length;

  // Rough check: ~1 subheading per 300 words
  const expectedHeadings = Math.floor(totalWords / 300);

  if (headingCount >= expectedHeadings) {
    return {
      id: "subheadingDistribution",
      label: "Subheading distribution",
      status: "good",
      message: `${headingCount} subheading${headingCount === 1 ? "" : "s"} found for ${totalWords} words.`,
      weight: WEIGHTS.subheadingDistribution,
    };
  }
  if (headingCount > 0) {
    return {
      id: "subheadingDistribution",
      label: "Subheading distribution",
      status: "ok",
      message: `${headingCount} subheading${headingCount === 1 ? "" : "s"} found. Consider adding more for ${totalWords} words.`,
      weight: WEIGHTS.subheadingDistribution,
    };
  }
  return {
    id: "subheadingDistribution",
    label: "Subheading distribution",
    status: "poor",
    message: `No subheadings found in ${totalWords} words. Add subheadings to improve readability.`,
    weight: WEIGHTS.subheadingDistribution,
  };
}

// ─── Text Presence ───────────────────────────────────────────────────────────

function checkTextPresence(text: string): ReadabilityCheckResult {
  const words = countWords(text);

  if (words >= 50) {
    return {
      id: "textPresence",
      label: "Text presence",
      status: "good",
      message: "Content has sufficient text.",
      weight: WEIGHTS.textPresence,
    };
  }
  if (words > 0) {
    return {
      id: "textPresence",
      label: "Text presence",
      status: "ok",
      message: "Content has very little text. Add more written content.",
      weight: WEIGHTS.textPresence,
    };
  }
  return {
    id: "textPresence",
    label: "Text presence",
    status: "poor",
    message: "No text content found. Add written content alongside images/embeds.",
    weight: WEIGHTS.textPresence,
  };
}
