import { expect, test } from "bun:test";
import { reviewedEmbed } from "./embed-providers";
test("reviewed video providers normalize exact IDs without autoplay/tracking or arbitrary permissions", () => {
	const yt = reviewedEmbed(
		"https://www.youtube.com/watch?v=dQw4w9WgXcQ&autoplay=1&enablejsapi=1&start=12",
		"video",
	);
	expect(yt.src).toBe(
		"https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?autoplay=0&controls=1&start=12",
	);
	expect(yt.sandbox).toBe("allow-scripts allow-same-origin");
	expect(yt.allow).not.toContain("autoplay");
	const vm = reviewedEmbed(
		"https://player.vimeo.com/video/76979871?h=123456abcd&autoplay=1",
		"video",
	);
	expect(vm.src).toBe(
		"https://player.vimeo.com/video/76979871?autoplay=0&dnt=1&h=123456abcd",
	);
});
test("map bounds and scheduler routes use fixed provider paths and closed settings", () => {
	const map = reviewedEmbed(
		"https://www.openstreetmap.org/export/embed.html?bbox=-105.4,39.6,-105.2,39.8&marker=39.7,-105.3",
		"map",
	);
	expect(new URL(map.src).searchParams.get("bbox")).toBe(
		"-105.4,39.6,-105.2,39.8",
	);
	expect(map.href).toContain("mlat=39.7&mlon=-105.3");
	expect(map.sandbox).not.toContain("allow-forms");
	const booking = reviewedEmbed(
		"https://calendly.com/example-studio/consultation?email=private@example.test&month=2026-09",
		"scheduler",
	);
	expect(booking.src).toBe(
		"https://calendly.com/example-studio/consultation?month=2026-09",
	);
	expect(booking.sandbox).toBe("allow-scripts allow-same-origin allow-forms");
});
test("lookalike hosts, credential URLs, unsafe paths, invalid bounds and wrong mode refuse", () => {
	for (const url of [
		"javascript:alert(1)",
		"http://calendly.com/user/event",
		"https://calendly.com.evil.test/user/event",
		"https://user:pass@calendly.com/user/event",
		"https://calendly.com:444/user/event",
		"https://calendly.com/app/scheduled_events",
		"https://calendly.com/u/event#redirect",
		"https://vimeo.com.evil.test/123",
		"https://www.youtube.com/watch?v=bad",
		"https://www.youtube.com/embed/%2e%2e",
		"https://www.openstreetmap.org/export/embed.html?bbox=90,100,10,120",
		"https://www.openstreetmap.org/export/embed.html?bbox=0,0,1,1&redirect=https://evil.test",
	])
		expect(() => reviewedEmbed(url)).toThrow();
	expect(() =>
		reviewedEmbed("https://calendly.com/user/event", "video"),
	).toThrow();
});
