import type { HeaderConfig, SiteIdentity } from './types';

/** Resolve the portable logo controls while preserving each pack's default image size. */
export function resolveHeaderBrand(site: SiteIdentity | undefined, logo: HeaderConfig['logo'], mediumSize = 32) {
  const showImage = logo.enabled && logo.showImage && !!site?.logoUrl;
  return {
    showImage,
    showTitle: logo.enabled && logo.showTitle && (!showImage || site?.showTitleWithLogo !== false),
    showTagline: logo.enabled && logo.showTagline && !!site?.tagline?.trim(),
    imageSize: mediumSize + (logo.size === 'small' ? -8 : logo.size === 'large' ? 8 : 0),
  };
}
