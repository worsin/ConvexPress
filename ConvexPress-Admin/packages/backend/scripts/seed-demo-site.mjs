import { readFile, writeFile, mkdir, access } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import { ConvexHttpClient } from "convex/browser";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const backendDir = path.resolve(__dirname, "..");
const repoRoot = path.resolve(backendDir, "../../..");
const outputDir = path.join(repoRoot, ".codex", "demo-media");

dotenv.config({ path: path.join(backendDir, ".env.local") });

const {
  OPENROUTER_API_KEY,
  CONVEX_URL,
  CONVEX_DEPLOY_KEY,
} = process.env;

if (!OPENROUTER_API_KEY) {
  throw new Error("OPENROUTER_API_KEY is required in the shell environment.");
}

if (!CONVEX_URL || !CONVEX_DEPLOY_KEY) {
  throw new Error("CONVEX_URL and CONVEX_DEPLOY_KEY are required from packages/backend/.env.local");
}

const assets = [
  {
    key: "home_hero",
    title: "Sunlit editorial kitchen spread",
    fileName: "demo-home-hero.png",
    altText: "Sunlit editorial kitchen table with citrus, herbs, linen, and ceramic dishes",
    prompt:
      "Create a photorealistic editorial food-brand hero image. A sunlit kitchen table with citrus, herbs, linen napkins, ceramic dishes, and warm natural light. Sophisticated, calm, upscale, magazine-quality styling, no people, no text, no watermark.",
  },
  {
    key: "about_studio",
    title: "Founder portrait in studio kitchen",
    fileName: "demo-about-studio.png",
    altText: "Creative founder standing in a bright studio kitchen with notebooks and flowers nearby",
    prompt:
      "Create a photorealistic portrait-oriented brand image of a creative founder in a bright studio kitchen. Soft natural light, minimal wardrobe, refined editorial styling, notebooks and flowers in the background. Warm, premium, approachable, no text, no watermark.",
  },
  {
    key: "services_studio",
    title: "Brand workshop tabletop",
    fileName: "demo-services-studio.png",
    altText: "Brand workshop tabletop with swatches, menu notes, and styled objects",
    prompt:
      "Create a photorealistic editorial tabletop scene for a food and lifestyle creative studio. Swatches, menu notes, printed layouts, ceramic samples, and a pen arranged beautifully on a wooden table. Clean, premium, magazine-quality, no text, no watermark.",
  },
  {
    key: "services_kitchen",
    title: "Styled prep scene",
    fileName: "demo-services-kitchen.png",
    altText: "Styled preparation scene with hands arranging seasonal ingredients on a countertop",
    prompt:
      "Create a photorealistic food editorial image of a beautifully styled prep scene. Hands arranging seasonal produce, herbs, and bowls on a clean countertop. Natural light, artisanal, warm, elevated, no text, no watermark.",
  },
  {
    key: "services_journal",
    title: "Editorial journal desk",
    fileName: "demo-services-journal.png",
    altText: "Editorial desk with printed layouts, magazines, and a cup of coffee",
    prompt:
      "Create a photorealistic editorial workspace image. Printed magazine layouts, notebooks, coffee, and subtle styling objects on a neat desk. Refined, creative, premium, natural light, no text, no watermark.",
  },
  {
    key: "process_details",
    title: "Recipe notes and styling details",
    fileName: "demo-process-details.png",
    altText: "Close-up of recipe notes, film strips, ceramics, and styling details on a table",
    prompt:
      "Create a photorealistic close-up editorial image showing recipe notes, contact sheets or film strips, ceramic bowls, and styling details on a table. Rich texture, calm palette, premium food publication aesthetic, no text, no watermark.",
  },
  {
    key: "contact_studio",
    title: "Warm inquiry desk",
    fileName: "demo-contact-studio.png",
    altText: "Warm inquiry desk with laptop, flowers, coffee, and notebooks",
    prompt:
      "Create a photorealistic welcoming studio desk scene with a laptop, flowers, coffee, and open notebooks. Warm natural light, premium creative-business aesthetic, inviting and polished, no text, no watermark.",
  },
  {
    key: "post_editorial_home",
    title: "Brunch table editorial",
    fileName: "demo-post-editorial-home.png",
    altText: "Elegant brunch table styled for an editorial photo story",
    prompt:
      "Create a photorealistic editorial brunch table scene with layered ceramics, pastries, fruit, and soft morning light. Sophisticated composition for a premium blog post featured image, no text, no watermark.",
  },
  {
    key: "post_seasonal_launch",
    title: "Seasonal produce launch story",
    fileName: "demo-post-seasonal-launch.png",
    altText: "Seasonal produce and printed menu notes arranged for a campaign planning story",
    prompt:
      "Create a photorealistic editorial image for a seasonal launch story. Autumn produce, handwritten menu notes, fabric textures, and soft directional light. Premium, polished, magazine-quality, no text, no watermark.",
  },
  {
    key: "post_shoot_day",
    title: "Behind the scenes shoot day",
    fileName: "demo-post-shoot-day.png",
    altText: "Behind the scenes content shoot with tripod, plated dish, and styling props",
    prompt:
      "Create a photorealistic behind-the-scenes food content shoot image. Tripod, plated dish, styling props, and a creative workspace in soft natural light. Elevated and believable, no text, no watermark.",
  },
  {
    key: "post_media_library",
    title: "Organized media library desk",
    fileName: "demo-post-media-library.png",
    altText: "Organized desk with labeled photo prints, notebooks, and a camera for a media workflow story",
    prompt:
      "Create a photorealistic editorial desk scene about organized media workflows. Labeled photo prints, a camera, notebooks, and a clean layout on a table. Refined, premium, visually calm, no text, no watermark.",
  },
  {
    key: "recipe_scan_card",
    title: "Handwritten recipe card scan",
    fileName: "demo-recipe-scan-card.png",
    altText: "Scanned handwritten recipe card on a neutral background",
    prompt:
      "Create a realistic scanned handwritten recipe card on a neutral background. The card should look authentic, slightly worn, neatly legible, photographed straight-on for OCR testing. No extra objects, no watermark.",
  },
];

async function fileExists(filePath) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function generateImageDataUrl(prompt) {
  const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${OPENROUTER_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "openai/gpt-5-image-mini",
      modalities: ["image", "text"],
      stream: false,
      messages: [
        {
          role: "user",
          content: prompt,
        },
      ],
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`OpenRouter image request failed (${response.status}): ${body}`);
  }

  const payload = await response.json();
  const dataUrl = payload?.choices?.[0]?.message?.images?.[0]?.image_url?.url;
  if (!dataUrl || !dataUrl.startsWith("data:image/")) {
    throw new Error(`Unexpected OpenRouter image payload: ${JSON.stringify(payload).slice(0, 500)}`);
  }

  return dataUrl;
}

function dataUrlToBuffer(dataUrl) {
  const [, base64Payload] = dataUrl.split(",", 2);
  return Buffer.from(base64Payload, "base64");
}

async function getAssetDataUrl(asset) {
  const filePath = path.join(outputDir, asset.fileName);
  if (await fileExists(filePath)) {
    const buffer = await readFile(filePath);
    return `data:image/png;base64,${buffer.toString("base64")}`;
  }

  const dataUrl = await generateImageDataUrl(asset.prompt);
  await writeFile(filePath, dataUrlToBuffer(dataUrl));
  return dataUrl;
}

async function main() {
  await mkdir(outputDir, { recursive: true });

  const client = new ConvexHttpClient(CONVEX_URL);
  client.setAdminAuth(CONVEX_DEPLOY_KEY);

  const importedAssets = [];

  for (const asset of assets) {
    console.log(`Generating/importing ${asset.key}...`);
    const dataUrl = await getAssetDataUrl(asset);
    const result = await client.action("demoSeed/actions:importGeneratedMedia", {
      title: asset.title,
      fileName: asset.fileName,
      altText: asset.altText,
      width: 1024,
      height: 1024,
      dataUrl,
    });

    importedAssets.push({
      key: asset.key,
      mediaId: result.mediaId,
      url: result.url,
    });
  }

  const seedResult = await client.mutation("demoSeed/internals:seedMarketingSite", {
    assets: importedAssets.map((asset) => ({
      key: asset.key,
      mediaId: asset.mediaId,
    })),
  });

  console.log("Seed complete:");
  console.log(JSON.stringify(seedResult, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
