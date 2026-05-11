/**
 * Visually hidden link that becomes visible on focus.
 * Allows keyboard users to skip navigation and jump to main content.
 */
export function SkipToContent() {
  return (
    <a
      data-slot="skip-to-content"
      href="#main-content"
      className="sr-only focus:not-sr-only focus:absolute focus:z-[100] focus:bg-primary focus:text-primary-foreground focus:px-4 focus:py-2 focus:text-xs focus:font-medium"
    >
      Skip to main content
    </a>
  );
}
