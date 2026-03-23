import { useMemo } from "react";

import type { PasswordStrengthResult } from "@/lib/auth/types";

const COMMON_PASSWORDS = [
  "password",
  "123456",
  "12345678",
  "qwerty",
  "abc123",
  "letmein",
  "monkey",
  "master",
  "dragon",
  "login",
  "princess",
  "football",
  "shadow",
  "sunshine",
  "trustno1",
  "iloveyou",
  "batman",
  "access",
  "hello",
  "charlie",
];

function computeStrength(password: string): PasswordStrengthResult {
  if (!password) {
    return {
      score: 0,
      label: "Very Weak",
      suggestions: ["Enter a password"],
      meetsRequirements: false,
    };
  }

  let score = 0;
  const suggestions: string[] = [];

  // Length scoring
  if (password.length >= 16) {
    score += 3;
  } else if (password.length >= 12) {
    score += 2;
  } else if (password.length >= 8) {
    score += 1;
  } else {
    suggestions.push("Use at least 8 characters");
  }

  // Character variety
  const hasUppercase = /[A-Z]/.test(password);
  const hasLowercase = /[a-z]/.test(password);
  const hasNumbers = /[0-9]/.test(password);
  const hasSymbols = /[^A-Za-z0-9]/.test(password);

  const varietyCount = [hasUppercase, hasLowercase, hasNumbers, hasSymbols].filter(Boolean).length;

  if (varietyCount >= 4) {
    score += 2;
  } else if (varietyCount >= 3) {
    score += 1;
  }

  if (!hasUppercase) suggestions.push("Add an uppercase letter");
  if (!hasLowercase) suggestions.push("Add a lowercase letter");
  if (!hasNumbers) suggestions.push("Add a number");
  if (!hasSymbols) suggestions.push("Add a special character");

  // Penalize common patterns
  const lowerPassword = password.toLowerCase();
  if (COMMON_PASSWORDS.includes(lowerPassword)) {
    score = Math.max(0, score - 3);
    suggestions.push("Avoid common passwords");
  }

  // Sequential characters penalty (e.g., "abc", "123")
  const hasSequential = /(?:abc|bcd|cde|def|efg|fgh|ghi|hij|ijk|jkl|klm|lmn|mno|nop|opq|pqr|qrs|rst|stu|tuv|uvw|vwx|wxy|xyz|012|123|234|345|456|567|678|789)/i.test(
    password,
  );
  if (hasSequential) {
    score = Math.max(0, score - 1);
    suggestions.push("Avoid sequential characters");
  }

  // Repeated characters penalty (e.g., "aaa", "111")
  const hasRepeated = /(.)\1{2,}/.test(password);
  if (hasRepeated) {
    score = Math.max(0, score - 1);
    suggestions.push("Avoid repeated characters");
  }

  // Clamp score to 0-4
  const clampedScore = Math.min(4, Math.max(0, score)) as 0 | 1 | 2 | 3 | 4;

  const labels: Record<number, string> = {
    0: "Very Weak",
    1: "Weak",
    2: "Fair",
    3: "Strong",
    4: "Very Strong",
  };

  // Meets requirements: at least 8 chars, uppercase, lowercase, and number
  const meetsRequirements =
    password.length >= 8 && hasUppercase && hasLowercase && hasNumbers;

  return {
    score: clampedScore,
    label: labels[clampedScore] ?? "Very Weak",
    suggestions: clampedScore >= 3 ? [] : suggestions,
    meetsRequirements,
  };
}

export function usePasswordStrength(password: string): PasswordStrengthResult {
  return useMemo(() => computeStrength(password), [password]);
}
