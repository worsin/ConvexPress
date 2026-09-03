import { describe, expect, test } from "bun:test";

import { friendlyError, serverMessage } from "./useWorkspaceActions";

describe("workspace error messages", () => {
  test("extracts the thrown message from a Convex server error", () => {
    const error = new Error(
      "[CONVEX M(operators:provisionScoped)] [Request ID: 9f1c] Server Error\nUncaught Error: Website access target is not active\n    at handler (../convex/operators.ts:170:11)",
    );
    expect(serverMessage(error)).toBe("Website access target is not active");
    expect(friendlyError(error)).toBe(
      "That change could not be completed: Website access target is not active.",
    );
  });

  test("keeps known messages friendly", () => {
    const error = new Error(
      "[CONVEX M(websites:archive)] Server Error\nUncaught Error: Archive every environment before archiving the website",
    );
    expect(friendlyError(error)).toBe("Archive every environment of this website first.");
  });

  test("falls back when a server error carries no message", () => {
    expect(friendlyError(new Error("[CONVEX M(x:y)] Server Error"))).toBe(
      "That change could not be completed. Check the values and try again.",
    );
    expect(serverMessage(new Error("network down"))).toBe("network down");
  });
});
