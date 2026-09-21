/** Error codes survive Convex internal calls even when Error.message is opaque.
 * Never display arbitrary provider payloads or nested error messages. */
export function aiFailureMessage(error: unknown, fallback: string): string {
	const data =
		error && typeof error === "object" && "data" in error ? error.data : null;
	const code =
		data && typeof data === "object" && "code" in data ? data.code : null;
	switch (code) {
		case "CONFIGURATION_ERROR":
			return "Configure an AI provider and API key in Settings > AI, then try again.";
		case "AI_PROVIDER_ERROR":
			return "The AI provider rejected the request. Check your credentials, model, and tool-calling support in Settings > AI.";
		case "AI_PROVIDER_TIMEOUT":
			return "AI generation timed out. Your prompt is retained; no proposal was saved.";
		case "AI_PROVIDER_RESULT":
			return "The AI provider did not return a complete supported proposal. Your prompt is retained; no proposal was saved.";
		case "AI_CONTEXT_LIMIT":
			return "The selected content exceeds the AI request limit. Select fewer resources and try again.";
		default:
			return fallback;
	}
}
