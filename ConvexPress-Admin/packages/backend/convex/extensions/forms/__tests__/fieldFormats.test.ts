import { describe, expect, test } from "bun:test";

import { validateFieldValue } from "../../../helpers/customFieldValidation";
import { fieldFormatError, fieldInputHints, isValidNpi, normalizeFieldFormat, usPhoneDigits } from "../fieldFormats";

describe("field formats", () => {
  test("phone numbers: US, formatted any way, with or without +1", () => {
    for (const ok of ["(702) 386-0101", "702-386-0101", "7023860101", "+1 702 386 0101", "1-702-386-0101"]) {
      expect(fieldFormatError("phone", ok)).toBeNull();
      expect(usPhoneDigits(ok)).toBe("7023860101");
    }
    for (const bad of ["abc", "386-0101", "123-456-7890", "702-086-0101", "702 386 01011"]) expect(fieldFormatError("phone", bad)).not.toBeNull();
    expect(normalizeFieldFormat("phone", "+1 702.386.0101")).toBe("(702) 386-0101");
  });

  test("US states take the two-letter code, any case", () => {
    expect(fieldFormatError("us-state", "nv")).toBeNull();
    expect(fieldFormatError("us-state", "PR")).toBeNull();
    expect(fieldFormatError("us-state", "Nevada")).not.toBeNull();
    expect(fieldFormatError("us-state", "XX")).not.toBeNull();
    expect(normalizeFieldFormat("us-state", " nv ")).toBe("NV");
  });

  test("ZIP codes: five digits or ZIP+4", () => {
    expect(fieldFormatError("us-zip", "89101")).toBeNull();
    expect(fieldFormatError("us-zip", "89101-1234")).toBeNull();
    for (const bad of ["abc", "8910", "891011", "89101-12"]) expect(fieldFormatError("us-zip", bad)).not.toBeNull();
  });

  test("NPI: ten digits whose CMS check digit matches", () => {
    // CMS's published example and a real-format number.
    expect(isValidNpi("1234567893")).toBe(true);
    expect(fieldFormatError("us-npi", "1234567893")).toBeNull();
    expect(fieldFormatError("us-npi", "1234567890")).toContain("check digit");
    expect(fieldFormatError("us-npi", "12345")).toBe("An NPI is 10 digits.");
  });

  test("empty answers are left to the required rule", () => {
    expect(fieldFormatError("us-npi", "  ")).toBeNull();
  });

  test("hints: phone keyboard and autofill; an explicit autocomplete token wins; unknown tokens are ignored", () => {
    expect(fieldInputHints("phone")).toEqual({ type: "tel", inputMode: "tel", autoComplete: "tel" });
    expect(fieldInputHints("us-zip").autoComplete).toBe("postal-code");
    expect(fieldInputHints(undefined, "given-name")).toEqual({ type: "text", autoComplete: "given-name" });
    expect(fieldInputHints(undefined, "javascript:alert(1)")).toEqual({ type: "text" });
  });

  test("the server's text validator enforces the format", () => {
    expect(validateFieldValue("text", "1234567890", { format: "us-npi" }, true).valid).toBe(false);
    expect(validateFieldValue("text", "1234567893", { format: "us-npi" }, true).valid).toBe(true);
    expect(validateFieldValue("text", "anything", { format: "not-a-format" }, true).valid).toBe(true);
  });
});
