/** Only server configuration supplies approved origins. A content block cannot. */
import { publicSocialUrl } from "../canonicalDocuments/foundation/socialFeedContracts";
export class SocialProviderError extends Error {
	constructor(
		readonly code:
			| "configuration"
			| "network"
			| "response"
			| "identity"
			| "rate_limit",
	) {
		super(`Social provider ${code}`);
	}
}
export type SocialTransport = (
	url: URL,
	headers?: Readonly<Record<string, string>>,
) => Promise<unknown>;
export function createSocialTransport(
	approvedOrigins: ReadonlySet<string>,
	fetcher: typeof fetch = fetch,
): SocialTransport {
	for (const origin of approvedOrigins) {
		const url = publicSocialUrl(origin);
		if (!url || url.origin !== origin || url.pathname !== "/" || url.search)
			throw new SocialProviderError("configuration");
	}
	return async (url, headers = {}) => {
		if (!publicSocialUrl(url.href) || !approvedOrigins.has(url.origin))
			throw new SocialProviderError("configuration");
		const abort = new AbortController(),
			timeout = setTimeout(() => abort.abort(), 10000);
		let response: Response | undefined;
		try {
			response = await fetcher(url, {
				method: "GET",
				redirect: "error",
				headers: { Accept: "application/json", ...headers },
				signal: abort.signal,
				credentials: "omit",
			});
			if (response.status === 429) throw new SocialProviderError("rate_limit");
			if (
				!response.ok ||
				response.redirected ||
				(response.url && new URL(response.url).origin !== url.origin) ||
				!/^application\/json(?:;|$)/i.test(
					response.headers.get("content-type") ?? "",
				)
			)
				throw new SocialProviderError("response");
			const declared = response.headers.get("content-length");
			if (
				declared !== null &&
				(!/^\d+$/.test(declared) || Number(declared) > 1048576)
			)
				throw new SocialProviderError("response");
			if (!response.body) throw new SocialProviderError("response");
			const reader = response.body.getReader(),
				decoder = new TextDecoder("utf-8", { fatal: true });
			let bytes = 0,
				body = "";
			try {
				while (true) {
					const part = await reader.read();
					if (part.done) break;
					bytes += part.value.byteLength;
					if (bytes > 1048576) throw new SocialProviderError("response");
					body += decoder.decode(part.value, { stream: true });
				}
				body += decoder.decode();
			} finally {
				await reader.cancel().catch(() => {});
				reader.releaseLock();
			}
			try {
				return JSON.parse(body);
			} catch {
				throw new SocialProviderError("response");
			}
		} catch (error) {
			if (error instanceof SocialProviderError) throw error;
			throw new SocialProviderError("network");
		} finally {
			clearTimeout(timeout);
			if (response?.body && !response.body.locked)
				await response.body.cancel().catch(() => {});
		}
	};
}
