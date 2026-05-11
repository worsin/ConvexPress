/**
 * User Profile System - Unit Tests for profile.ts
 *
 * Tests public profile shaping and name/slug helpers.
 *
 * Run with: bun test convex/helpers/__tests__/profile.test.ts
 */

import { describe, expect, test } from "bun:test";
import {
  extractPublicFields,
  generateDisplayName,
  generateDisplayNameOptions,
  generateSlug,
  getInitials,
  resolveAvatarUrl,
  validateBio,
} from "../profile";

describe("resolveAvatarUrl", () => {
  test("prefers uploaded avatar over auth provider avatar", () => {
    expect(
      resolveAvatarUrl({
        avatarUrl: "https://cdn.example.com/custom.png",
        profilePictureUrl: "https://cdn.example.com/oauth.png",
      }),
    ).toBe("https://cdn.example.com/custom.png");
  });
});

describe("generateDisplayName", () => {
  test("uses name parts before username and email", () => {
    expect(
      generateDisplayName("Casey", "Jones", "casey@example.com", "casey"),
    ).toBe("Casey Jones");
  });

  test("falls back to email username when names are absent", () => {
    expect(generateDisplayName(undefined, undefined, "writer@example.com")).toBe(
      "writer",
    );
  });
});

describe("generateDisplayNameOptions", () => {
  test("deduplicates and returns WordPress-style options", () => {
    expect(
      generateDisplayNameOptions({
        email: "writer@example.com",
        firstName: "Casey",
        lastName: "Jones",
        nickname: "CJ",
        username: "casey",
      }),
    ).toEqual(["writer", "casey", "Casey", "Jones", "Casey Jones", "Jones, Casey", "CJ"]);
  });
});

describe("generateSlug and getInitials", () => {
  test("normalizes slugs and initials from display names", () => {
    expect(generateSlug("Casey Jones!!!")).toBe("casey-jones");
    expect(getInitials("Casey Jones")).toBe("CJ");
  });
});

describe("extractPublicFields", () => {
  test("returns only public-facing profile fields and resolved avatar", () => {
    expect(
      extractPublicFields({
        _id: "user_123",
        displayName: "Casey Jones",
        slug: "casey-jones",
        bio: "Editor",
        avatarUrl: "https://cdn.example.com/avatar.png",
        profilePictureUrl: "https://cdn.example.com/oauth.png",
        url: "https://example.com",
        socialLinks: { github: "casey" },
        postCount: 7,
        status: "active",
      }),
    ).toEqual({
      _id: "user_123",
      displayName: "Casey Jones",
      slug: "casey-jones",
      bio: "Editor",
      avatarUrl: "https://cdn.example.com/avatar.png",
      url: "https://example.com",
      socialLinks: { github: "casey" },
      postCount: 7,
      status: "active",
    });
  });
});

describe("validateBio", () => {
  test("strips HTML from bios", () => {
    expect(validateBio("<p>Hello <strong>world</strong></p>")).toBe("Hello world");
  });
});
