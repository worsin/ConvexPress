/**
 * Puts back the text a CDN split apart before React hydrates the page.
 *
 * Cloudflare's Email Address Obfuscation (on by default for a Cloudflare zone)
 * replaces each email address in the HTML with a placeholder and adds a script
 * that decodes it. The script runs while the page parses, before hydration,
 * and puts each address back as a text node of its own beside the text around
 * it. Where the server rendered "Write to info@example.com today." as one text
 * node, the page now holds three. React rejects that (error #418), throws the
 * server's HTML away and renders the page again in the browser.
 *
 * Merging adjacent text nodes restores the server's DOM. A parsed page never
 * has two text nodes side by side, and React separates its own neighbouring
 * text with comment markers, so an untouched page is left exactly as it is.
 */
export function restoreServerText(root: Node): void {
  root.normalize();
}
