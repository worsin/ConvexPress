import { expect, type Locator } from "@playwright/test";

/** Decode lazy media before taking a representative block screenshot. */
export async function decodeCaptureMedia(canvas: Locator) {
  const positions = await canvas.evaluateHandle(root => [root, ...root.querySelectorAll("*")]
    .filter((node): node is HTMLElement => node instanceof HTMLElement && (node.scrollWidth > node.clientWidth || node.scrollHeight > node.clientHeight))
    .map(node => ({ node, left: node.scrollLeft, top: node.scrollTop })));
  try {
    for (const media of await canvas.locator("img:visible").all()) await media.scrollIntoViewIfNeeded();
    await expect.poll(() => canvas.locator("img:visible").evaluateAll(images => images.every(image => image instanceof HTMLImageElement && image.complete && image.naturalWidth > 0)), { message: "Visible fixture media decoded before capture" }).toBe(true);
  } finally {
    // Decoding an offscreen image must not change the composition being reviewed.
    await positions.evaluate(saved => {
      for (const { node, left, top } of saved) node.scrollTo({ left, top, behavior: "instant" });
    });
    await positions.dispose();
  }
}
