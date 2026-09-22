import { test, expect } from "bun:test";
import { contentHtml } from "./content.cases";
import { remainingTime } from "./countdown";
import grade from "../../../../../../../blocks/blocks/grade-gallery/render";
import hero from "../../../../../../../blocks/core/hero-video/render";
import lightbox from "../../../../../../../blocks/core/lightbox-grid/render";
import marquee from "../../../../../../../blocks/core/marquee/render";
import steps from "../../../../../../../blocks/core/steps-with-media/render";
import countdown from "../../../../../../../blocks/core/countdown/render";
import alert from "../../../../../../../blocks/local/sample-alert/render";
import guide from "../../../../../../../blocks/reference/field-guide/render";

test("grade gallery preserves ordered grades, descriptions, notes and every declared image/caption", () => {
	const html = contentHtml(grade, {
		sections: [
			{
				grade: "Paper",
				description: "Authored description",
				notes: "Sample notes",
				images: [
					{ mediaId: "paper", alt: "Authored alt", caption: "One" },
					{ mediaId: "clay", caption: "Two" },
				],
			},
			{ grade: "Clay", images: [] },
		],
	});
	for (const text of [
		"Paper",
		"Clay",
		"Authored description",
		"Sample notes",
		"Authored alt",
		"One",
		"Two",
	])
		expect(html).toContain(text);
	expect(html.indexOf("Paper") < html.lastIndexOf("Clay")).toBe(true);
	expect(html).toContain('src="/paper.png"');
	expect(html).toContain('src="/clay.png"');
	expect(() =>
		contentHtml(grade, { sections: [{ images: [{ mediaId: "missing" }] }] }),
	).toThrow();
});
test("hero video resolves separate native video and poster identities without autoplay or provider embeds", () => {
	const html = contentHtml(
		hero,
		{
			title: "Workshop",
			video: { id: "video" },
			poster: { id: "poster", focalPoint: { x: 0.2, y: 0.8 } },
			cta: { label: "Read", href: "/notes" },
		},
		{
			media: {
				video: {
					src: "/workshop.webm",
					alt: "Video",
					mimeType: "video/webm",
					captions: { src: "/captions.vtt", language: "en", label: "English" },
				},
				poster: { src: "/poster.png", alt: "Poster", mimeType: "image/png" },
			},
		},
	);
	expect(html).toContain('src="/workshop.webm"');
	expect(html).toContain('poster="/poster.png"');
	expect(html).toContain("20% 80%");
	expect(html).toContain("controls=");
	expect(html).not.toContain("autoPlay");
	expect(html).not.toContain("autoplay");
	expect(html).toContain('src="/captions.vtt"');
	expect(html).toContain('href="/notes"');
	expect(() => contentHtml(hero, { video: { id: "paper" } })).toThrow();
});
test("lightbox-grid uses the same real modal behavior and preserves optional caption-only items", () => {
	const html = contentHtml(lightbox, {
		items: [
			{ media: { id: "paper", alt: "Paper image" }, caption: "Paper study" },
			{ caption: "Awaiting image" },
			{ media: { id: "clay" }, caption: "Clay study" },
		],
	});
	expect(html).toContain("<dialog");
	expect(html).toContain("View Paper study");
	expect(html).toContain("View Clay study");
	expect(html).toContain("Awaiting image");
	expect(html).not.toContain("View Awaiting image");
	expect(html).not.toContain('open=""');
});
test("rich marquee preserves linked/media content with a paused SSR state and inert decorative repetition", () => {
	const html = contentHtml(marquee, {
		items: [
			{
				text: "Notice",
				media: {
					id: "paper",
					alt: "Authored paper",
					focalPoint: { x: 0.3, y: 0.4 },
				},
				link: { label: "Read notes", href: "/notes", newTab: true },
			},
		],
	});
	expect(html).toContain('data-playing="false"');
	expect(html).toContain("Play motion");
	expect(html).toContain('aria-hidden="true" inert=""');
	expect(html).toContain('href="/notes"');
	expect(html).toContain('rel="noopener noreferrer"');
	expect(html).toContain("Authored paper");
	expect(html).toContain("30% 40%");
	expect(() =>
		contentHtml(marquee, {
			items: [
				{
					text: "Unsafe",
					link: { label: "Unsafe", href: "javascript:alert(1)" },
				},
			],
		}),
	).toThrow();
});
test("media steps retain order, rich marks, alt and focal points", () => {
	const html = contentHtml(steps, {
		steps: [
			{
				title: "Notice",
				body: {
					type: "doc",
					content: [
						{
							type: "paragraph",
							content: [
								{ type: "text", text: "Look", marks: [{ type: "italic" }] },
							],
						},
					],
				},
				media: {
					id: "paper",
					alt: "A notebook",
					focalPoint: { x: 0.1, y: 0.9 },
				},
			},
			{ title: "Return" },
		],
	});
	expect(html).toContain("<ol");
	expect(html).toContain("<em>Look</em>");
	expect(html).toContain('data-enhanced="false"');
	expect(html).toContain('class="cp-library-scroll-stage" aria-hidden="true"');
	expect(html.indexOf("Notice") < html.indexOf("Return")).toBe(true);
	expect(html).toContain("A notebook");
	expect(html).toContain("10% 90%");
});
test("countdown initial output is clock-independent and only expiry becomes live", () => {
	const original = Date.now;
	try {
		Date.now = () => 0;
		const first = contentHtml(countdown, {
			target: "2040-06-01T09:00:00Z",
			title: "Fictional gathering",
		});
		Date.now = () => Date.parse("2050-01-01T00:00:00Z");
		expect(
			contentHtml(countdown, {
				target: "2040-06-01T09:00:00Z",
				title: "Fictional gathering",
			}),
		).toBe(first);
		expect(first).toContain('dateTime="2040-06-01T09:00:00.000Z"');
		expect(first).not.toContain('aria-label="Time remaining"');
	} finally {
		Date.now = original;
	}
	expect(remainingTime(1000, 1000)).toEqual({
		expired: true,
		days: 0,
		hours: 0,
		minutes: 0,
		seconds: 0,
	});
	expect(remainingTime(1000, 1001).seconds).toBe(0);
	expect(remainingTime(1000, 999).seconds).toBe(1);
	expect(remainingTime(90061000, 0)).toEqual({
		expired: false,
		days: 1,
		hours: 1,
		minutes: 1,
		seconds: 1,
	});
});
test("field guide preserves explicit detail visibility, count, new-tab links and sample alert variant text", () => {
	const attrs = {
		heading: "Guide",
		body: "Body",
		note: "Note",
		count: 1,
		items: [
			{ label: "One", value: "First" },
			{ label: "Two", value: "Second" },
		],
		link: { label: "Read", href: "/read", newTab: true },
	};
	const shown = contentHtml(guide, attrs);
	expect(shown).toContain("First");
	expect(shown).not.toContain("Second");
	expect(shown).toContain('rel="noopener noreferrer"');
	const hidden = contentHtml(guide, { ...attrs, showDetails: false });
	expect(hidden).toContain("Guide");
	expect(hidden).not.toContain("First");
	expect(hidden).not.toContain("Body");
	expect(hidden).not.toContain("Note");
	expect(hidden).toContain('href="/read"');
	for (const variant of ["info", "success", "warning"]) {
		const html = contentHtml(alert, {
			heading: "Sample",
			body: "Authored information",
			variant,
			ctaLabel: "Read",
			ctaUrl: "/read",
		});
		expect(html).toContain(`data-variant="${variant}"`);
		expect(html).toContain(variant);
		expect(html).not.toContain('role="alert"');
	}
});

test("grade rows omit entirely empty image placeholders but retain caption-only authored records", () => {
	const empty = contentHtml(grade, {
		sections: [{ grade: "Paper", description: "Still visible", images: [{}] }],
	});
	expect(empty).toContain("Still visible");
	expect(empty).not.toContain('class="cp-library-grade-images"');
	expect(empty).toContain('data-has-media="false"');
	const captions = contentHtml(grade, {
		sections: [
			{
				grade: "Paper",
				images: [
					{},
					{ caption: "Awaiting the next photograph" },
					{ mediaId: "paper" },
					{ mediaId: "clay" },
				],
			},
		],
	});
	expect(captions).toContain("Awaiting the next photograph");
	expect(captions).toContain('src="/paper.png"');
	expect(captions).toContain('src="/clay.png"');
	expect(captions).toContain('data-has-media="true"');
});
