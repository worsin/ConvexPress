import { PublicFileDownloadProvider } from "./public-file-download";
import { test, expect } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { JSDOM } from "jsdom";
import {
	prepareBlocks,
	type RendererDefinition,
	type RenderResources,
} from "./model";
import { renderMediaSchema } from "./media-resources";
import video from "../../../../../../../blocks/core/video/render";
import audio from "../../../../../../../blocks/core/audio/render";
import download from "../../../../../../../blocks/core/file-download/render";
import code from "../../../../../../../blocks/core/code/render";
import comparison from "../../../../../../../blocks/core/before-after/render";
import gallery from "../../../../../../../blocks/core/gallery/render";
import social from "../../../../../../../blocks/core/social-links/render";
import logos from "../../../../../../../blocks/core/logo-cloud/render";
import image from "../../../../../../../blocks/core/image/render";
import catalog from "../../../../../../../blocks/.generated/catalog.json";
const resources: RenderResources = {
	media: {
		photo: {
			src: "/photo.png",
			alt: "Workshop",
			mimeType: "image/png",
			width: 800,
			height: 600,
		},
		after: { src: "/after.png", alt: "After", mimeType: "image/png" },
		video: {
			src: "/film.webm",
			alt: "Silent workshop film",
			mimeType: "video/webm",
			captions: {
				src: "/captions.vtt",
				label: "English captions",
				language: "en",
			},
		},
		audio: { src: "/audio.wav", alt: "Recording", mimeType: "audio/wav" },
		file: {
			src: "/guide.pdf",
			alt: "Guide",
			mimeType: "application/pdf",
			filename: "guide.pdf",
			byteSize: 2048,
		},
	},
};
export function render(
	definition: RendererDefinition,
	attrs: unknown,
	selectedResources = resources,
) {
	const spec = catalog.find((entry) => entry.name === definition.blockName);
	if (!spec) throw new Error("Missing canonical spec");
	return prepareBlocks(
		[
			{
				id: "media-specimen",
				name: definition.blockName,
				version: spec.version,
				attrs,
			},
		],
		{ [definition.blockName]: definition },
		{
			enabledPlugins: [],
			capabilities: ["reference.targetResolution"],
			disabledBlocks: [],
		},
		selectedResources,
	);
}
function html(
	definition: RendererDefinition,
	attrs: unknown,
	selectedResources = resources,
) {
	return renderToStaticMarkup(render(definition, attrs, selectedResources));
}

test("video and audio use target assets and native non-autoplay controls with transcript/captions", () => {
	const film = html(video, {
		media: { id: "video" },
		poster: { id: "photo" },
		title: "Workshop",
		transcript: { label: "Read film transcript", href: "/transcript" },
	});
	expect(film).toContain('src="/film.webm"');
	expect(film).toContain('poster="/photo.png"');
	expect(film).toContain('kind="captions"');
	expect(film).toContain('controls=""');
	expect(film).not.toContain("autoplay");
	expect(film).toContain("Read film transcript");
	const sound = html(audio, {
		media: { id: "audio" },
		title: "Recording",
		transcript: { label: "", href: "/transcript" },
	});
	expect(sound).toContain('preload="none"');
	expect(sound).toContain('aria-label="Recording"');
	expect(sound).toContain("Read transcript");
	expect(sound).not.toContain("autoplay");
	expect(
		html(video, {
			url: {
				label: "Direct file",
				href: "https://example.invalid/film.mp4?signature=public",
			},
		}),
	).toContain("film.mp4?signature=public");
});
test("unknown identities, wrong MIME types, unsafe resources and provider video fail explicitly", () => {
	expect(() => html(video, { media: { id: "photo" } })).toThrow(
		"supported MIME type",
	);
	expect(() => html(audio, { media: { id: "missing" } })).toThrow(
		"Resolve public media",
	);
	expect(() =>
		html(video, {
			url: { label: "Provider", href: "https://youtube.com/watch?v=test" },
		}),
	).toThrow("provider embeds require");
	expect(() =>
		html(
			download,
			{ media: { id: "file" } },
			{
				media: {
					file: { src: "/active.html", alt: "Bad", mimeType: "text/html" },
				},
			},
		),
	).toThrow("supported MIME type");
	expect(() =>
		html(
			audio,
			{ media: { id: "audio" } },
			{
				media: {
					audio: {
						src: "javascript:alert(1)",
						alt: "Bad",
						mimeType: "audio/wav",
					},
				},
			},
		),
	).toThrow("Invalid public media");
	expect(
		renderMediaSchema.safeParse({
			...resources.media.file,
			filename: "../escape.pdf",
		}).success,
	).toBe(false);
	expect(
		renderMediaSchema.safeParse({ ...resources.media.file, token: "secret" })
			.success,
	).toBe(false);
	expect(
		renderMediaSchema.safeParse({
			...resources.media.file,
			src: "https://user:password@example.invalid/file.pdf",
		}).success,
	).toBe(false);
	expect(
		renderMediaSchema.safeParse({
			...resources.media.video,
			captions: {
				src: "https://user:password@example.invalid/captions.vtt",
				language: "en",
				label: "Captions",
			},
		}).success,
	).toBe(false);
	expect(() =>
		html(
			audio,
			{ media: { id: "audio" } },
			{ media: { audio: { src: "/unknown.wav", alt: "Unknown media type" } } },
		),
	).toThrow("supported MIME type");
});
test("download exposes only public file details and image projection ignores extra file metadata", () => {
	const content = html(download, {
		media: { id: "file" },
		title: "Workshop guide",
		description: "A printable guide",
	});
	expect(content).toContain('download="guide.pdf"');
	expect(content).toContain("2.0 KB");
	expect(content).toContain("application/pdf");
	const photo = html(image, { mediaId: "photo", alt: "Workshop" });
	expect(photo).toContain('src="/photo.png"');
	expect(photo).not.toContain("mimeType");
});
test("code is escaped literal text with keyboard-scrollable region and language label", () => {
	const content = html(code, {
		filename: "example.html",
		language: "html",
		code: '<script>alert("x")</script>',
	});
	expect(content).not.toContain("<script>");
	const dom = new JSDOM(content);
	expect(dom.window.document.querySelector("code")?.textContent).toBe('<script>alert("x")</script>');
	expect(dom.window.document.querySelectorAll("script").length).toBe(0);
	dom.window.close();
	expect(content).toContain('tabindex="0"');
	expect(content).toContain('aria-label="Code: example.html"');
});
test("comparison keeps both target identities, focal points and accessible bounded range", () => {
	const content = html(comparison, {
		before: { id: "photo", focalPoint: { x: 0.2, y: 0.4 } },
		after: { id: "after" },
		beforeLabel: "Raw clay",
		afterLabel: "Fired clay",
	});
	expect(content).toContain('src="/photo.png"');
	expect(content).toContain('src="/after.png"');
	expect(content).toContain("object-position:20% 40%");
	expect(content).toContain('type="range"');
	expect(content).toContain('min="0"');
	expect(content).toContain('max="100"');
	expect(content).toContain('aria-valuetext="50% Raw clay, 50% Fired clay"');
	expect(() => html(comparison, { before: { id: "photo" } })).toThrow(
		"Select both comparison images",
	);
});
test("gallery starts closed; disabled lightbox emits neither dialog nor preview controls", () => {
	const attrs = {
		items: [
			{ media: { id: "photo" }, caption: "The workshop" },
			{ media: { id: "after" }, caption: "The result" },
		],
		lightbox: true,
	};
	const content = html(gallery, attrs);
	expect(content).toContain("<dialog");
	expect(content).not.toContain('open=""');
	expect(content).toContain("View The workshop");
	const plain = html(gallery, { ...attrs, lightbox: false });
	expect(plain).not.toContain("<dialog");
	expect(plain).not.toContain("View The workshop");
});
test("social and logo destinations retain safe accessible labels without invented icons", () => {
	expect(
		html(social, {
			links: [
				{
					platform: "Mastodon",
					label: "",
					href: "https://example.invalid/profile",
				},
			],
		}),
	).toContain(">Mastodon</a>");
	expect(() =>
		html(social, { links: [{ label: "Bad", href: "javascript:alert(1)" }] }),
	).toThrow("Use an HTTP(S)");
	const content = html(logos, {
		logos: [{ name: "Sample studio", mediaId: "photo", href: "/studio" }],
	});
	expect(content).toContain('aria-label="Sample studio"');
	expect(content).toContain('alt="Sample studio"');
});


test("resolved image resources retain a self-hosted HTTP source through the template primitive", () => {
 const src="http://192.168.1.246:4860/api/storage/fixture";
 const owned={media:{photo:{src,alt:"Owned local image",mimeType:"image/png",width:800,height:600}}};
 expect(renderMediaSchema.safeParse(owned.media.photo).success).toBe(true);
 const markup=html(image,{mediaId:"photo",alt:"Authored local image"},owned);
 expect(markup).toContain(`src="${src}"`);
 expect(markup).toContain('alt="Authored local image"');
 expect(()=>html(image,{mediaId:"photo"},{media:{photo:{...owned.media.photo,src:"http://user:secret@192.168.1.246/image.png"}}})).toThrow();
});


test("social profiles use existing platform artwork decoratively without replacing accessible names", () => {
  const doc=new JSDOM(html(social,{links:[{platform:"twitter",label:"Studio updates",href:"https://example.test/updates"},{platform:"unknown",label:"Another profile",href:"https://example.test/profile"},{platform:"instagram",label:"Coming soon",href:""}]})).window.document;
  expect(doc.querySelectorAll("a svg").length + doc.querySelectorAll(".cp-social-profile > svg").length).toBe(2);
  expect(doc.querySelector("a")?.textContent).toBe("Studio updates");
  expect(doc.querySelectorAll("svg[aria-hidden=true]").length).toBe(2);
  expect(doc.querySelectorAll("a").length).toBe(2);
  expect(doc.body.textContent).toContain("Coming soon");
});

test("file cards use the configured public attachment host while standalone SDK rendering preserves source URLs", () => {
  const selected = { media: { file: { src: "https://storage.example/api/storage/file-key", alt: "Guide", filename: "field guide.txt", mimeType: "text/plain" } } };
  const content = renderToStaticMarkup(<PublicFileDownloadProvider backendOrigin="https://storage.example">{render(download, { media: { id: "file" } }, selected)}</PublicFileDownloadProvider>);
  expect(content).toContain('href="/api/public-files/file-key?filename=field%20guide.txt"');
  expect(content).toContain('download="field guide.txt"');
  expect(html(download, { media: { id: "file" } }, selected)).toContain('href="https://storage.example/api/storage/file-key"');
});
