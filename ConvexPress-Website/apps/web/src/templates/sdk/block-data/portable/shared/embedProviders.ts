/** Closed provider adapters. No authored sandbox flags, srcdoc, provider scripts,
 * arbitrary hosts, redirect parameters, tracking/pre-fill fields or automatic playback. */
export type EmbedKind = "video" | "map" | "scheduler";
export interface ReviewedEmbed {
	kind: EmbedKind;
	provider: "YouTube" | "Vimeo" | "OpenStreetMap" | "Calendly";
	src: string;
	href: string;
	sandbox: string;
	allow: string;
}
export class UnsupportedEmbed extends Error {
	constructor() {
		super(
			"Use a supported YouTube, Vimeo, OpenStreetMap share embed, or Calendly scheduling URL.",
		);
	}
}
const refusal = (): never => {
	throw new UnsupportedEmbed();
};
const digits = /^\d{1,12}$/;
const provider = (
	kind: EmbedKind,
	name: ReviewedEmbed["provider"],
	src: string,
	href: string,
): ReviewedEmbed => ({
	kind,
	provider: name,
	src,
	href,
	// These exact external HTTPS hosts remain cross-origin. No popups, top-level
	// navigation, downloads, presentation or browser-permission grants are added.
	sandbox: `allow-scripts allow-same-origin${kind === "scheduler" ? " allow-forms" : ""}`,
	allow:
		kind === "video" ? "fullscreen; picture-in-picture; encrypted-media" : "",
});
export function reviewedEmbed(
	raw: string,
	expected?: EmbedKind,
): ReviewedEmbed {
	if (
		raw.length > 4096 ||
		raw !== raw.trim() ||
		raw.includes("\\") ||
		Array.from(raw).some((char) => char.charCodeAt(0) <= 32)
	)
		return refusal();
	let url: URL;
	try {
		url = new URL(raw);
	} catch {
		return refusal();
	}
	if (
		url.protocol !== "https:" ||
		url.username ||
		url.password ||
		url.port ||
		url.hash ||
		/%2f|%5c|%2e/i.test(url.pathname)
	)
		return refusal();
	const host = url.hostname;
	let result: ReviewedEmbed | undefined;
	if (
		[
			"youtube.com",
			"www.youtube.com",
			"m.youtube.com",
			"youtu.be",
			"www.youtube-nocookie.com",
		].includes(host)
	) {
		const id =
			host === "youtu.be"
				? url.pathname.slice(1)
				: url.pathname === "/watch"
					? url.searchParams.get("v")
					: /^\/embed\/([^/]+)$/.exec(url.pathname)?.[1];
		if (!id || !/^[A-Za-z0-9_-]{11}$/.test(id)) return refusal();
		const source = new URL(`https://www.youtube-nocookie.com/embed/${id}`);
		source.searchParams.set("autoplay", "0");
		source.searchParams.set("controls", "1");
		const start = url.searchParams.get("start");
		if (start !== null) {
			if (!digits.test(start) || Number(start) > 86400) return refusal();
			source.searchParams.set("start", String(Number(start)));
		}
		result = provider(
			"video",
			"YouTube",
			source.href,
			`https://www.youtube.com/watch?v=${id}`,
		);
	} else if (
		["vimeo.com", "www.vimeo.com", "player.vimeo.com"].includes(host)
	) {
		const match = (
			host === "player.vimeo.com" ? /^\/video\/(\d{1,12})$/ : /^\/(\d{1,12})$/
		).exec(url.pathname);
		if (!match || Number(match[1]) === 0) return refusal();
		const source = new URL(`https://player.vimeo.com/video/${match[1]}`);
		source.searchParams.set("autoplay", "0");
		source.searchParams.set("dnt", "1");
		// Vimeo's authored unlisted-video privacy hash is required for that resource;
		// retain only this documented field, never copy arbitrary query parameters.
		const privacyHash = url.searchParams.get("h");
		if (privacyHash !== null) {
			if (!/^[A-Fa-f0-9]{10}$/.test(privacyHash)) return refusal();
			source.searchParams.set("h", privacyHash);
		}
		result = provider(
			"video",
			"Vimeo",
			source.href,
			privacyHash
				? `https://vimeo.com/${match[1]}/${privacyHash}`
				: `https://vimeo.com/${match[1]}`,
		);
	} else if (
		host === "www.openstreetmap.org" &&
		url.pathname === "/export/embed.html"
	) {
		if (
			[...url.searchParams.keys()].some(
				(key) => !["bbox", "layer", "marker"].includes(key),
			)
		)
			return refusal();
		const bounds = (url.searchParams.get("bbox") ?? "").split(",");
		if (
			bounds.length !== 4 ||
			bounds.some((value) => !/^-?\d+(?:\.\d+)?$/.test(value))
		)
			return refusal();
		const [west, south, east, north] = bounds.map(Number);
		if (
			west < -180 ||
			east > 180 ||
			south < -90 ||
			north > 90 ||
			west >= east ||
			south >= north
		)
			return refusal();
		const layer = url.searchParams.get("layer");
		if (layer !== null && layer !== "mapnik") return refusal();
		const source = new URL("https://www.openstreetmap.org/export/embed.html");
		source.searchParams.set("bbox", [west, south, east, north].join(","));
		source.searchParams.set("layer", "mapnik");
		const marker = url.searchParams.get("marker");
		if (marker !== null) {
			const parts = marker.split(",");
			if (
				parts.length !== 2 ||
				parts.some((value) => !/^-?\d+(?:\.\d+)?$/.test(value))
			)
				return refusal();
			const [lat, lon] = parts.map(Number);
			if (lat < -90 || lat > 90 || lon < -180 || lon > 180) return refusal();
			source.searchParams.set("marker", `${lat},${lon}`);
		}
		const [lat, lon] = marker
			? marker.split(",").map(Number)
			: [(south + north) / 2, (west + east) / 2];
		result = provider(
			"map",
			"OpenStreetMap",
			source.href,
			`https://www.openstreetmap.org/?mlat=${lat}&mlon=${lon}#map=13/${lat}/${lon}`,
		);
	} else if (host === "calendly.com") {
		// A user/team scheduling page or event type, not Calendly app/admin/login.
		if (
			!/^\/[a-zA-Z0-9_-]{1,100}(?:\/[a-zA-Z0-9_-]{1,100})?$/.test(
				url.pathname,
			) ||
			/^\/(?:app|login|signup|oauth|help|integrations|pricing|features|solutions)(?:\/|$)/.test(
				url.pathname,
			)
		)
			return refusal();
		const source = new URL(url.origin + url.pathname);
		// Preserve an explicitly selected scheduling month only. Never prefill or
		// transfer a visitor's email/name/answers from an authored embed URL.
		const month = url.searchParams.get("month");
		if (month !== null) {
			if (!/^\d{4}-(?:0[1-9]|1[0-2])$/.test(month)) return refusal();
			source.searchParams.set("month", month);
		}
		result = provider(
			"scheduler",
			"Calendly",
			source.href,
			url.origin + url.pathname,
		);
	}
	if (!result || (expected && result.kind !== expected)) return refusal();
	return result;
}
