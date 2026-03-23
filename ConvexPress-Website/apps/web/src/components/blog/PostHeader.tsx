import { cn } from "@/lib/utils";
import type { PostCategory } from "@/lib/blog/types";

import { CategoryBadge } from "./CategoryBadge";
import { PostMeta } from "./PostMeta";

interface PostHeaderProps {
  title: string;
  author: {
    _id: string;
    displayName: string;
    slug: string;
    avatarUrl?: string;
  };
  publishedAt?: string;
  readingTime?: number;
  categories?: PostCategory[];
  featuredImageUrl?: string;
  featuredImageAlt?: string;
  className?: string;
}

/**
 * Single post header: featured image, title, meta, categories.
 */
export function PostHeader({
  title,
  author,
  publishedAt,
  readingTime,
  categories,
  featuredImageUrl,
  featuredImageAlt,
  className,
}: PostHeaderProps) {
  return (
    <header
      data-slot="post-header"
      className={cn("flex flex-col gap-4", className)}
    >
      {/* Categories */}
      {categories && categories.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {categories.map((cat) => (
            <CategoryBadge key={cat._id} name={cat.name} slug={cat.slug} />
          ))}
        </div>
      )}

      {/* Title */}
      <h1 className="text-lg font-bold leading-tight md:text-xl">{title}</h1>

      {/* Meta */}
      <PostMeta
        author={author}
        publishedAt={publishedAt}
        readingTime={readingTime}
        showAvatar
      />

      {/* Featured Image */}
      {featuredImageUrl && (
        <figure className="-mx-4 md:-mx-6 lg:-mx-8">
          <img
            src={featuredImageUrl}
            alt={featuredImageAlt ?? title}
            className="aspect-video w-full object-cover"
            loading="eager"
          />
        </figure>
      )}
    </header>
  );
}
