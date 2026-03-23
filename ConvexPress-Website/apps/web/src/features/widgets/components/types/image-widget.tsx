/**
 * Image Widget - Website Renderer
 *
 * Displays an image with optional link. Uses loading="lazy" for performance.
 */

interface ImageWidgetConfig {
  imageUrl?: string;
  altText?: string;
  linkUrl?: string;
  linkTarget?: string;
}

export function ImageWidget({ config }: { config: ImageWidgetConfig }) {
  if (!config.imageUrl) {
    return <p className="text-sm text-muted-foreground">No image selected.</p>;
  }

  const img = (
    <img
      src={config.imageUrl}
      alt={config.altText || ""}
      loading="lazy"
      className="w-full h-auto"
    />
  );

  if (config.linkUrl) {
    return (
      <a
        href={config.linkUrl}
        target={config.linkTarget || "_self"}
        rel={config.linkTarget === "_blank" ? "noopener noreferrer" : undefined}
      >
        {img}
      </a>
    );
  }

  return img;
}
