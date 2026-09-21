import { expect, test } from "bun:test";
import { mediaEpochFromEnvList } from "./mediaIndex";
test("reads only the exact epoch variable from complete CLI output without returning secrets", () => {
  expect(
    mediaEpochFromEnvList(
      'AUTH_PRIVATE_KEY="private"\nMEDIA_REFERENCE_INDEX_EPOCH=epoch_123456789012\nSITE_URL=https://site.example',
    ),
  ).toBe("epoch_123456789012");
  expect(mediaEpochFromEnvList('MEDIA_REFERENCE_INDEX_EPOCH="epoch_123456789012"')).toBe(
    "epoch_123456789012",
  );
  expect(mediaEpochFromEnvList("PRIVATE=secret")).toBeNull();
  expect(() =>
    mediaEpochFromEnvList("MEDIA_REFERENCE_INDEX_EPOCH=a\nMEDIA_REFERENCE_INDEX_EPOCH=b"),
  ).toThrow("Duplicate");
});
